const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const XLSX = require('xlsx');
const { query, run, get } = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const { sendApprovalEmail, sendRejectionEmail, sendTempPasswordEmail, sendIntroductionEmail, sendUnsubscribeConfirmationEmail, sendFabricatorBroadcastEmail } = require('../utils/email');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function uploadToCloudinary(buffer) {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            { folder: 'remnant-exchange', resource_type: 'image' },
            (error, result) => error ? reject(error) : resolve(result.secure_url)
        ).end(buffer);
    });
}

const router = express.Router();

router.post('/create-fabricator', requireAdmin, async (req, res) => {
    try {
        const { name, business_name, email, phone, city } = req.body;
        if (!name || !business_name || !email) return res.status(400).json({ error: 'Name, business name, and email are required' });

        const existing = await get(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase()]);
        if (existing) return res.status(400).json({ error: 'Email already registered' });

        const tempPassword = '12345678';
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        const userId = uuidv4();

        await run(`INSERT INTO users (id, name, business_name, email, password_hash, phone, city, email_verified, approved, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)`,
            [userId, name, business_name, email.toLowerCase(), passwordHash, phone || null, city || null]);

        const magicToken = uuidv4();
        const magicExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await run(`INSERT INTO email_tokens (id, user_id, token, type, expires_at) VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), userId, magicToken, 'magic-login', magicExpires]);

        try {
            await sendTempPasswordEmail(email, name, tempPassword, magicToken);
        } catch (emailErr) {
            console.error('Temp password email failed:', emailErr.message);
        }

        res.json({ message: `Account created and credentials emailed to ${email}` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

router.post('/post-listing/:fabricatorId', requireAdmin, (req, res, next) => {
    upload.array('photos', 5)(req, res, err => {
        if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be under 10MB' : err.message });
        next();
    });
}, async (req, res) => {
    try {
        const fabricator = await get(`SELECT * FROM users WHERE id = ? AND role = 'fabricator'`, [req.params.fabricatorId]);
        if (!fabricator) return res.status(404).json({ error: 'Fabricator not found' });

        const { material_type, stone_name, length, width, thickness, state_id, metro_id, description,
                shape, length2, width2, vendor_name, bundle_number, visibility, remnant_owner } = req.body;

        if (!material_type || !stone_name || !length || !width || !thickness || !state_id || !metro_id) {
            return res.status(400).json({ error: 'All required fields must be filled' });
        }

        const planSettings = await get(`SELECT * FROM plan_settings WHERE plan = ?`, [fabricator.plan]);
        const activeCount = await get(`SELECT count(*) as cnt FROM listings WHERE user_id = ? AND status = 'active'`, [fabricator.id]);
        if (Number(activeCount.cnt) >= Number(planSettings.max_posts)) {
            return res.status(403).json({ error: `This fabricator has reached their listing limit` });
        }

        const id = uuidv4();
        const expiresAt = new Date(Date.now() + Number(planSettings.duration_days) * 24 * 60 * 60 * 1000).toISOString();
        const slabShape = shape || 'rectangular';
        const vis = visibility === 'private' ? 'private' : 'public';

        await run(`INSERT INTO listings (id, user_id, material_type, color, stone_name, shape, length, width, thickness, length2, width2, vendor_name, bundle_number, state_id, metro_id, description, expires_at, visibility, remnant_owner)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, fabricator.id, material_type, stone_name, stone_name, slabShape,
             parseFloat(length), parseFloat(width), thickness,
             length2 ? parseFloat(length2) : null, width2 ? parseFloat(width2) : null,
             vendor_name || null, bundle_number || null,
             state_id, metro_id, description || null, expiresAt, vis, remnant_owner || null]);

        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                const url = await uploadToCloudinary(req.files[i].buffer);
                await run(`INSERT INTO listing_photos (id, listing_id, filename, display_order) VALUES (?, ?, ?, ?)`,
                    [uuidv4(), id, url, i]);
            }
        }

        res.json({ id, message: 'Listing posted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to post listing' });
    }
});

router.get('/pending-fabricators', requireAdmin, async (req, res) => {
    const users = await query(`
        SELECT id, name, business_name, email, phone, created_at
        FROM users
        WHERE role = 'fabricator' AND email_verified = 1 AND approved = 0
        ORDER BY created_at ASC
    `);
    res.json(users);
});

router.post('/approve/:userId', requireAdmin, async (req, res) => {
    try {
        const user = await get(`SELECT * FROM users WHERE id = ?`, [req.params.userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        await run(`UPDATE users SET approved = 1 WHERE id = ?`, [user.id]);
        try {
            await sendApprovalEmail(user.email, user.name);
        } catch (emailErr) {
            console.error('Approval email failed:', emailErr.message);
        }

        res.json({ message: 'Fabricator approved' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Approval failed' });
    }
});

router.post('/reject/:userId', requireAdmin, async (req, res) => {
    try {
        const { reason } = req.body;
        const user = await get(`SELECT * FROM users WHERE id = ?`, [req.params.userId]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        await run(`DELETE FROM users WHERE id = ?`, [user.id]);
        try {
            await sendRejectionEmail(user.email, user.name, reason);
        } catch (emailErr) {
            console.error('Rejection email failed:', emailErr.message);
        }

        res.json({ message: 'Fabricator rejected' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Rejection failed' });
    }
});

router.get('/fabricators', requireAdmin, async (req, res) => {
    const users = await query(`
        SELECT u.id, u.name, u.business_name, u.email, u.phone, u.city, u.plan, u.approved, u.created_at, u.admin_notes, u.outreach_status,
               COUNT(l.id) as active_listings
        FROM users u
        LEFT JOIN listings l ON l.user_id = u.id AND l.status = 'active'
        WHERE u.role = 'fabricator'
        GROUP BY u.id
        ORDER BY u.created_at DESC
    `);
    res.json(users);
});

router.get('/fabricators/:id', requireAdmin, async (req, res) => {
    try {
        const user = await get(`SELECT id, name, business_name, email, phone, city, plan, approved, created_at, admin_notes, outreach_status FROM users WHERE id = ? AND role = 'fabricator'`, [req.params.id]);
        if (!user) return res.status(404).json({ error: 'Fabricator not found' });

        const listings = await query(`
            SELECT l.id, l.material_type, l.stone_name, l.length, l.width, l.thickness, l.shape,
                   l.length2, l.width2, l.vendor_name, l.bundle_number, l.state_id, l.metro_id,
                   l.description, l.visibility, l.remnant_owner,
                   l.status, l.created_at, l.expires_at, s.name as state_name, m.name as metro_name
            FROM listings l
            JOIN states s ON l.state_id = s.id
            JOIN metros m ON l.metro_id = m.id
            WHERE l.user_id = ?
            ORDER BY l.created_at DESC
        `, [req.params.id]);

        res.json({ ...user, listings });
    } catch (err) {
        console.error('fabricators/:id error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/fabricators/:id/send-introduction', requireAdmin, async (req, res) => {
    try {
        const user = await get(`SELECT * FROM users WHERE id = ? AND role = 'fabricator'`, [req.params.id]);
        if (!user) return res.status(404).json({ error: 'Fabricator not found' });

        const unsubToken = uuidv4();
        const unsubExpires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        await run(`DELETE FROM email_tokens WHERE user_id = ? AND type = 'unsubscribe'`, [user.id]);
        await run(`INSERT INTO email_tokens (id, user_id, token, type, expires_at) VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), user.id, unsubToken, 'unsubscribe', unsubExpires]);

        await sendIntroductionEmail(user.email, user.business_name, unsubToken);
        await run(`UPDATE users SET outreach_status = 'introduction' WHERE id = ?`, [user.id]);
        res.json({ message: `Introduction sent to ${user.email}` });
    } catch (err) {
        console.error('send-introduction error:', err);
        res.status(500).json({ error: 'Failed to send introduction: ' + err.message });
    }
});

router.post('/fabricators/:id/send-credentials', requireAdmin, async (req, res) => {
    try {
        const user = await get(`SELECT * FROM users WHERE id = ? AND role = 'fabricator'`, [req.params.id]);
        if (!user) return res.status(404).json({ error: 'Fabricator not found' });

        const tempPassword = '12345678';
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        await run(`UPDATE users SET password_hash = ?, must_change_password = 1, outreach_status = 'credentials' WHERE id = ?`, [passwordHash, user.id]);

        const magicToken = uuidv4();
        const magicExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await run(`DELETE FROM email_tokens WHERE user_id = ? AND type = 'magic-login'`, [user.id]);
        await run(`INSERT INTO email_tokens (id, user_id, token, type, expires_at) VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), user.id, magicToken, 'magic-login', magicExpires]);

        await sendTempPasswordEmail(user.email, user.name, tempPassword, magicToken);
        res.json({ message: `Credentials sent to ${user.email}` });
    } catch (err) {
        console.error('send-credentials error:', err);
        res.status(500).json({ error: 'Failed to send credentials: ' + err.message });
    }
});

router.patch('/fabricators/:id', requireAdmin, async (req, res) => {
    try {
        const user = await get(`SELECT id FROM users WHERE id = ? AND role = 'fabricator'`, [req.params.id]);
        if (!user) return res.status(404).json({ error: 'Fabricator not found' });

        const { name, business_name, email, phone, city, admin_notes } = req.body;
        if (!name || !business_name || !email) return res.status(400).json({ error: 'Name, business name, and email are required' });

        const existing = await get(`SELECT id FROM users WHERE email = ? AND id != ?`, [email.toLowerCase(), req.params.id]);
        if (existing) return res.status(400).json({ error: 'Email already in use by another account' });

        await run(`UPDATE users SET name = ?, business_name = ?, email = ?, phone = ?, city = ?, admin_notes = ? WHERE id = ?`,
            [name, business_name, email.toLowerCase(), phone || null, city || null, admin_notes || null, req.params.id]);

        res.json({ message: 'Fabricator updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update fabricator' });
    }
});

router.delete('/fabricators/:id', requireAdmin, async (req, res) => {
    try {
        const user = await get(`SELECT id FROM users WHERE id = ? AND role = 'fabricator'`, [req.params.id]);
        if (!user) return res.status(404).json({ error: 'Fabricator not found' });

        const listings = await query(`SELECT id FROM listings WHERE user_id = ?`, [user.id]);
        for (const l of listings) {
            await run(`DELETE FROM listing_photos WHERE listing_id = ?`, [l.id]);
        }
        await run(`DELETE FROM listings WHERE user_id = ?`, [user.id]);
        await run(`DELETE FROM email_tokens WHERE user_id = ?`, [user.id]);
        await run(`DELETE FROM users WHERE id = ?`, [user.id]);

        res.json({ message: 'Fabricator deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete fabricator' });
    }
});

router.patch('/listings/:id', requireAdmin, async (req, res) => {
    try {
        const listing = await get(`SELECT id FROM listings WHERE id = ?`, [req.params.id]);
        if (!listing) return res.status(404).json({ error: 'Listing not found' });

        const { material_type, stone_name, shape, length, width, thickness, length2, width2,
                vendor_name, bundle_number, state_id, metro_id, description, visibility, remnant_owner, status } = req.body;

        if (!material_type || !stone_name || !length || !width || !thickness || !state_id || !metro_id) {
            return res.status(400).json({ error: 'All required fields must be filled' });
        }

        await run(`UPDATE listings SET
            material_type = ?, color = ?, stone_name = ?, shape = ?, length = ?, width = ?, thickness = ?,
            length2 = ?, width2 = ?, vendor_name = ?, bundle_number = ?, state_id = ?, metro_id = ?,
            description = ?, visibility = ?, remnant_owner = ?, status = ?
            WHERE id = ?`,
            [material_type, stone_name, stone_name, shape || 'rectangular',
             parseFloat(length), parseFloat(width), thickness,
             length2 ? parseFloat(length2) : null, width2 ? parseFloat(width2) : null,
             vendor_name || null, bundle_number || null,
             state_id, metro_id, description || null,
             visibility === 'private' ? 'private' : 'public',
             remnant_owner || null, status || 'active',
             req.params.id]);

        res.json({ message: 'Listing updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update listing' });
    }
});

router.delete('/listings/:id', requireAdmin, async (req, res) => {
    const listing = await get(`SELECT id FROM listings WHERE id = ?`, [req.params.id]);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    await run(`UPDATE listings SET status = 'removed' WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Listing removed' });
});

router.get('/states', requireAdmin, async (req, res) => {
    const states = await query(`SELECT * FROM states ORDER BY name ASC`);
    res.json(states);
});

router.post('/states', requireAdmin, async (req, res) => {
    const { name, abbreviation } = req.body;
    if (!name || !abbreviation) return res.status(400).json({ error: 'Name and abbreviation required' });
    const id = uuidv4();
    await run(`INSERT INTO states (id, name, abbreviation) VALUES (?, ?, ?)`, [id, name, abbreviation.toUpperCase()]);
    res.json({ id, name, abbreviation: abbreviation.toUpperCase() });
});

router.get('/states/:stateId/metros', requireAdmin, async (req, res) => {
    const metros = await query(`SELECT * FROM metros WHERE state_id = ? ORDER BY name ASC`, [req.params.stateId]);
    res.json(metros);
});

router.post('/states/:stateId/metros', requireAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const id = uuidv4();
    await run(`INSERT INTO metros (id, state_id, name) VALUES (?, ?, ?)`, [id, req.params.stateId, name]);
    res.json({ id, state_id: req.params.stateId, name });
});

router.patch('/metros/:id', requireAdmin, async (req, res) => {
    const { name, active } = req.body;
    if (name !== undefined) await run(`UPDATE metros SET name = ? WHERE id = ?`, [name, req.params.id]);
    if (active !== undefined) await run(`UPDATE metros SET active = ? WHERE id = ?`, [active ? 1 : 0, req.params.id]);
    res.json({ message: 'Updated' });
});

router.delete('/metros/:id', requireAdmin, async (req, res) => {
    await run(`DELETE FROM metros WHERE id = ?`, [req.params.id]);
    res.json({ message: 'Deleted' });
});

router.get('/plan-settings', requireAdmin, async (req, res) => {
    const settings = await query(`SELECT * FROM plan_settings`);
    res.json(settings);
});

router.patch('/plan-settings/:plan', requireAdmin, async (req, res) => {
    const { max_posts, duration_days } = req.body;
    const { plan } = req.params;
    if (max_posts !== undefined) await run(`UPDATE plan_settings SET max_posts = ? WHERE plan = ?`, [max_posts, plan]);
    if (duration_days !== undefined) await run(`UPDATE plan_settings SET duration_days = ? WHERE plan = ?`, [duration_days, plan]);
    res.json({ message: 'Plan settings updated' });
});

router.delete('/clear-fabricators', requireAdmin, async (req, res) => {
    const users = await query(`SELECT id FROM users WHERE role != 'admin'`);
    for (const u of users) {
        const listings = await query(`SELECT id FROM listings WHERE user_id = ?`, [u.id]);
        for (const l of listings) {
            await run(`DELETE FROM listing_photos WHERE listing_id = ?`, [l.id]);
        }
        await run(`DELETE FROM listings WHERE user_id = ?`, [u.id]);
        await run(`DELETE FROM email_tokens WHERE user_id = ?`, [u.id]);
        await run(`DELETE FROM users WHERE id = ?`, [u.id]);
    }
    res.json({ message: `Deleted ${users.length} user(s)` });
});

router.post('/bulk-import', requireAdmin, (req, res, next) => {
    upload.single('file')(req, res, err => {
        if (err) return res.status(400).json({ error: err.message });
        next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const sendEmail = false; // always off — admin sends credentials manually after calling
        const tempPassword = '12345678';
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const imported = [];
        const skipped = [];
        const errors = [];

        for (const row of rows) {
            const businessName = (row['Business Name'] || '').trim();
            const contactName = (row['Contact Name'] || '').trim();
            const email = (row['Email'] || '').trim().toLowerCase();
            const phone = (row['Phone'] || row['Cell'] || '').toString().trim();
            const city = (row['City'] || '').trim();
            const website = (row['Website'] || '').trim();

            if (!email) {
                skipped.push({ business: businessName || '(no name)', reason: 'No email address' });
                continue;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                skipped.push({ business: businessName, reason: `Invalid email: ${email}` });
                continue;
            }

            const existing = await get(`SELECT id FROM users WHERE email = ?`, [email]);
            if (existing) {
                skipped.push({ business: businessName, reason: `Already registered: ${email}` });
                continue;
            }

            const name = contactName || businessName;
            if (!name || !businessName) {
                skipped.push({ business: email, reason: 'Missing business name' });
                continue;
            }

            try {
                const userId = uuidv4();
                await run(
                    `INSERT INTO users (id, name, business_name, email, password_hash, phone, city, email_verified, approved, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1)`,
                    [userId, name, businessName, email, passwordHash, phone || null, city || null]
                );

                if (sendEmail) {
                    const magicToken = uuidv4();
                    const magicExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                    await run(`INSERT INTO email_tokens (id, user_id, token, type, expires_at) VALUES (?, ?, ?, ?, ?)`,
                        [uuidv4(), userId, magicToken, 'magic-login', magicExpires]);
                    try {
                        await sendTempPasswordEmail(email, name, tempPassword, magicToken);
                    } catch (emailErr) {
                        console.error('Bulk import email failed for', email, emailErr.message);
                    }
                }

                imported.push({ business: businessName, email });
            } catch (rowErr) {
                errors.push({ business: businessName, email, reason: rowErr.message });
            }
        }

        res.json({
            total: rows.length,
            imported: imported.length,
            skipped: skipped.length,
            failed: errors.length,
            importedList: imported,
            skippedList: skipped,
            errorList: errors,
        });
    } catch (err) {
        console.error('bulk-import error:', err);
        res.status(500).json({ error: 'Failed to process file: ' + err.message });
    }
});

router.get('/stats', requireAdmin, async (req, res) => {
    const totalFabricators = await get(`SELECT count(*) as cnt FROM users WHERE role = 'fabricator' AND approved = 1 AND email != 'seed@remnantexchange.org'`);
    const pendingApproval = await get(`SELECT count(*) as cnt FROM users WHERE role = 'fabricator' AND email_verified = 1 AND approved = 0`);
    const activeListings = await get(`SELECT count(*) as cnt FROM listings WHERE status = 'active' AND is_seeded = 0`);
    const expiredListings = await get(`SELECT count(*) as cnt FROM listings WHERE status = 'expired' AND is_seeded = 0`);
    const seededListings = await get(`SELECT count(*) as cnt FROM listings WHERE is_seeded = 1 AND status = 'active'`);
    const unsubscribed = await get(`SELECT count(*) as cnt FROM users WHERE role = 'fabricator' AND outreach_status = 'unsubscribed'`);
    const reactivated = await get(`SELECT count(*) as cnt FROM users WHERE role = 'fabricator' AND reactivated_at IS NOT NULL`);

    res.json({
        totalFabricators: Number(totalFabricators.cnt),
        pendingApproval: Number(pendingApproval.cnt),
        activeListings: Number(activeListings.cnt),
        expiredListings: Number(expiredListings.cnt),
        seededListings: Number(seededListings.cnt),
        unsubscribed: Number(unsubscribed.cnt),
        reactivated: Number(reactivated.cnt),
    });
});

router.get('/requests', requireAdmin, async (req, res) => {
    try {
        const requests = await query(`
            SELECT r.*, s.name as state_name, m.name as metro_name
            FROM buyer_requests r
            JOIN states s ON r.state_id = s.id
            JOIN metros m ON r.metro_id = m.id
            ORDER BY r.created_at DESC
        `);
        res.json(requests);
    } catch (err) {
        console.error('requests error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.post('/requests/:id/broadcast', requireAdmin, async (req, res) => {
    try {
        const { scope } = req.body; // 'metro' | 'state' | 'all'
        const request = await get(`
            SELECT r.*, s.name as state_name, m.name as metro_name
            FROM buyer_requests r
            JOIN states s ON r.state_id = s.id
            JOIN metros m ON r.metro_id = m.id
            WHERE r.id = ?
        `, [req.params.id]);
        if (!request) return res.status(404).json({ error: 'Request not found' });

        const { metro_ids, test } = req.body;
        let fabricators;
        if (test) {
            fabricators = [{ id: 'test', name: 'Admin', business_name: 'Admin', email: process.env.ADMIN_EMAIL }];
        } else if (scope === 'all') {
            fabricators = await query(`
                SELECT DISTINCT u.id, u.name, u.business_name, u.email
                FROM users u
                WHERE u.role = 'fabricator' AND u.approved = 1
                AND u.outreach_status IN ('introduction', 'credentials')
            `);
        } else if (scope === 'metros' && metro_ids && metro_ids.length > 0) {
            const placeholders = metro_ids.map(() => '?').join(',');
            fabricators = await query(`
                SELECT DISTINCT u.id, u.name, u.business_name, u.email
                FROM users u
                JOIN listings l ON l.user_id = u.id
                WHERE u.role = 'fabricator' AND u.approved = 1
                AND u.outreach_status IN ('introduction', 'credentials')
                AND l.state_id = ? AND l.metro_id IN (${placeholders}) AND l.status = 'active'
            `, [request.state_id, ...metro_ids]);
        } else {
            fabricators = await query(`
                SELECT DISTINCT u.id, u.name, u.business_name, u.email
                FROM users u
                JOIN listings l ON l.user_id = u.id
                WHERE u.role = 'fabricator' AND u.approved = 1
                AND u.outreach_status IN ('introduction', 'credentials')
                AND l.state_id = ? AND l.status = 'active'
            `, [request.state_id]);
        }

        let sent = 0;
        for (const fab of fabricators) {
            try {
                await sendFabricatorBroadcastEmail(fab.email, fab.business_name || fab.name, request, request.state_name, request.metro_name);
                sent++;
            } catch (e) {
                console.error(`Broadcast email failed for ${fab.email}:`, e.message);
            }
        }

        if (!test) {
            await run(`UPDATE buyer_requests SET status = 'broadcasted', broadcasted_at = datetime('now') WHERE id = ?`, [req.params.id]);
        }
        res.json({ message: test ? `Test email sent to ${process.env.ADMIN_EMAIL}` : `Broadcast sent to ${sent} fabricator(s)`, sent });
    } catch (err) {
        console.error('broadcast error:', err);
        res.status(500).json({ error: err.message });
    }
});

router.get('/seeded-listings', requireAdmin, async (req, res) => {
    const count = await get(`SELECT count(*) as cnt FROM listings WHERE is_seeded = 1`);
    res.json({ count: Number(count.cnt) });
});

router.delete('/seeded-listings', requireAdmin, async (req, res) => {
    try {
        const seeded = await query(`SELECT id FROM listings WHERE is_seeded = 1`);
        for (const l of seeded) {
            await run(`DELETE FROM listing_photos WHERE listing_id = ?`, [l.id]);
        }
        await run(`DELETE FROM listings WHERE is_seeded = 1`);
        await run(`DELETE FROM users WHERE email = 'seed@remnantexchange.org'`);
        res.json({ message: `Removed ${seeded.length} seeded listing(s)` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to remove seeded listings' });
    }
});

module.exports = router;
