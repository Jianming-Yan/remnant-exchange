const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const { sendApprovalEmail, sendRejectionEmail, sendTempPasswordEmail } = require('../utils/email');

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
        const { name, business_name, email, phone } = req.body;
        if (!name || !business_name || !email) return res.status(400).json({ error: 'Name, business name, and email are required' });

        const existing = await get(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase()]);
        if (existing) return res.status(400).json({ error: 'Email already registered' });

        const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        const userId = uuidv4();

        await run(`INSERT INTO users (id, name, business_name, email, password_hash, phone, email_verified, approved, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1)`,
            [userId, name, business_name, email.toLowerCase(), passwordHash, phone || null]);

        try {
            await sendTempPasswordEmail(email, name, tempPassword);
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
                shape, length2, width2, vendor_name, bundle_number } = req.body;

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

        await run(`INSERT INTO listings (id, user_id, material_type, color, stone_name, shape, length, width, thickness, length2, width2, vendor_name, bundle_number, state_id, metro_id, description, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, fabricator.id, material_type, stone_name, stone_name, slabShape,
             parseFloat(length), parseFloat(width), thickness,
             length2 ? parseFloat(length2) : null, width2 ? parseFloat(width2) : null,
             vendor_name || null, bundle_number || null,
             state_id, metro_id, description || null, expiresAt]);

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
        SELECT id, name, business_name, email, phone, plan, approved, created_at
        FROM users WHERE role = 'fabricator'
        ORDER BY created_at DESC
    `);
    res.json(users);
});

router.get('/fabricators/:id', requireAdmin, async (req, res) => {
    const user = await get(`SELECT id, name, business_name, email, phone, plan, approved, created_at FROM users WHERE id = ? AND role = 'fabricator'`, [req.params.id]);
    if (!user) return res.status(404).json({ error: 'Fabricator not found' });

    const listings = await query(`
        SELECT l.id, l.material_type, l.stone_name, l.length, l.width, l.thickness, l.shape,
               l.status, l.created_at, l.expires_at, s.name as state_name, m.name as metro_name
        FROM listings l
        JOIN states s ON l.state_id = s.id
        JOIN metros m ON l.metro_id = m.id
        WHERE l.user_id = ?
        ORDER BY l.created_at DESC
    `, [req.params.id]);

    res.json({ ...user, listings });
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

router.get('/stats', requireAdmin, async (req, res) => {
    const totalFabricators = await get(`SELECT count(*) as cnt FROM users WHERE role = 'fabricator' AND approved = 1 AND email != 'seed@remnantexchange.org'`);
    const pendingApproval = await get(`SELECT count(*) as cnt FROM users WHERE role = 'fabricator' AND email_verified = 1 AND approved = 0`);
    const activeListings = await get(`SELECT count(*) as cnt FROM listings WHERE status = 'active' AND is_seeded = 0`);
    const expiredListings = await get(`SELECT count(*) as cnt FROM listings WHERE status = 'expired' AND is_seeded = 0`);
    const seededListings = await get(`SELECT count(*) as cnt FROM listings WHERE is_seeded = 1 AND status = 'active'`);

    res.json({
        totalFabricators: Number(totalFabricators.cnt),
        pendingApproval: Number(pendingApproval.cnt),
        activeListings: Number(activeListings.cnt),
        expiredListings: Number(expiredListings.cnt),
        seededListings: Number(seededListings.cnt),
    });
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
