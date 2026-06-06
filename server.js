if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const { initSchema, query, run, get } = require('./database/db');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function uploadToCloudinary(buffer) {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            { folder: 'remnant-exchange/requests', resource_type: 'image' },
            (error, result) => error ? reject(error) : resolve(result.secure_url)
        ).end(buffer);
    });
}

fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/intern', require('./routes/intern'));
app.use('/api/contractor', require('./routes/contractor'));

// Fabricator lead unsubscribe (public, no auth)
app.get('/api/fab-leads/unsubscribe', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).send('Invalid link');
        const lead = await get(`SELECT * FROM fabricator_leads WHERE unsubscribe_token = ?`, [token]);
        if (!lead) return res.status(404).send('Link not found');
        await run(`UPDATE fabricator_leads SET unsubscribed = 1 WHERE id = ?`, [lead.id]);
        res.send(`<html><body style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#1a1a1a;">
            <h2>You have been unsubscribed</h2>
            <p style="color:#64748b;">You will not receive any more emails from Remnant Exchange.<br>We appreciate your time and wish you all the best.</p>
        </body></html>`);
    } catch (err) {
        console.error('fab-lead unsubscribe error:', err);
        res.status(500).send('Error');
    }
});

const { sendBuyerRequestEmail, sendActivationNudgeEmail, sendFabLeadIntroEmail, sendFabLeadFollowUp1Email, sendFabLeadFollowUp2Email } = require('./utils/email');
app.post('/api/request', upload.array('photos', 5), async (req, res) => {
    try {
        const { name, email, material, length, width, state_id, metro_id } = req.body;
        if (!name || !email || !material || !length || !width || !state_id || !metro_id) {
            return res.status(400).json({ error: 'Please fill in all required fields.' });
        }

        const photoUrls = [];
        if (req.files && req.files.length > 0) {
            for (const file of req.files) {
                try {
                    const url = await uploadToCloudinary(file.buffer);
                    photoUrls.push(url);
                } catch (e) {
                    console.error('Photo upload failed:', e.message);
                }
            }
        }

        const id = uuidv4();
        await run(`INSERT INTO buyer_requests (id, name, email, phone, material, color, length, width, state_id, metro_id, notes, photos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, name, email, req.body.phone || null, material, req.body.color || null, length, width, state_id, metro_id, req.body.notes || null, photoUrls.length > 0 ? JSON.stringify(photoUrls) : null]);

        await sendBuyerRequestEmail({ ...req.body, photos: photoUrls });
        res.json({ message: 'Request submitted successfully.' });
    } catch (err) {
        console.error('Buyer request error:', err);
        res.status(500).json({ error: 'Failed to submit request. Please try again.' });
    }
});

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

async function expireListings() {
    try {
        await run(`UPDATE listings SET status = 'expired' WHERE status = 'active' AND expires_at < datetime('now')`);
    } catch (err) {
        console.error('Expiry job error:', err);
    }
}

async function sendDailyFabLeadBroadcast() {
    try {
        const limit = parseInt(process.env.FAB_LEAD_DAILY_LIMIT || '50');

        // Safety: skip if we already sent emails today (UTC date)
        const alreadySent = await get(`SELECT COUNT(*) as cnt FROM fabricator_leads WHERE DATE(last_sent_at) = DATE('now')`);
        if (Number(alreadySent.cnt) > 0) {
            console.log('Daily broadcast: already sent today, skipping');
            return;
        }

        const leads = await query(
            `SELECT * FROM fabricator_leads WHERE touch_count < 3 AND unsubscribed = 0 AND registered = 0 LIMIT ?`,
            [limit]
        );
        if (!leads.length) {
            console.log('Daily broadcast: no eligible leads');
            return;
        }

        const emailFns = [sendFabLeadIntroEmail, sendFabLeadFollowUp1Email, sendFabLeadFollowUp2Email];
        let sent = 0;
        for (const lead of leads) {
            try {
                const touchIndex = Math.min(Number(lead.touch_count), 2);
                await emailFns[touchIndex](lead.email, lead.business_name, lead.unsubscribe_token);
                await run(`UPDATE fabricator_leads SET touch_count = touch_count + 1, last_sent_at = datetime('now') WHERE id = ?`, [lead.id]);
                sent++;
                await new Promise(r => setTimeout(r, 200));
            } catch (e) {
                console.error(`Daily broadcast failed for ${lead.email}:`, e.message);
            }
        }

        // Send the same email to admin as the 51st — to monitor inbox vs spam delivery
        if (sent > 0) {
            await sendFabLeadIntroEmail(process.env.ADMIN_EMAIL, 'Remnant Exchange', 'admin-monitor')
                .catch(e => console.error('Admin monitor email failed:', e.message));
        }

        console.log(`Daily fab lead broadcast: sent ${sent} emails`);
    } catch (e) {
        console.error('Daily fab lead broadcast error:', e.message);
    }
}

async function checkDailyBroadcast() {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday

    // Only run Mon-Sat between 12 UTC (8 AM ET) and 23 UTC
    if (dayOfWeek === 0 || currentHour < 12) return;

    await sendDailyFabLeadBroadcast();
}

async function sendActivationNudges() {
    try {
        // Self-registered fabricators, 3+ days old, zero listings, nudge not yet sent
        const users = await query(`
            SELECT u.id, u.name, u.email, u.business_name
            FROM users u
            WHERE u.role = 'fabricator'
              AND u.source = 'self_registered'
              AND u.nudge_sent = 0
              AND u.created_at < datetime('now', '-3 days')
              AND NOT EXISTS (SELECT 1 FROM listings l WHERE l.user_id = u.id AND l.status = 'active')
        `);
        for (const u of users) {
            try {
                await sendActivationNudgeEmail(u.email, u.name, u.business_name);
                await run(`UPDATE users SET nudge_sent = 1 WHERE id = ?`, [u.id]);
            } catch (e) {
                console.error('Nudge email failed for', u.email, e.message);
            }
        }
        if (users.length > 0) console.log(`Activation nudges sent: ${users.length}`);
    } catch (err) {
        console.error('Nudge job error:', err);
    }
}

async function ensureAdmin() {
    const admin = await get(`SELECT id FROM users WHERE role = 'admin'`);
    if (!admin) {
        const hash = await bcrypt.hash('Admin1234!', 10);
        await run(`INSERT INTO users (id, name, business_name, email, password_hash, role, email_verified, approved)
             VALUES (?, 'Admin', 'Remnant Exchange', 'admin@remnantexchange.com', ?, 'admin', 1, 1)`,
            [uuidv4(), hash]);
        console.log('Admin account created');
    }
}

async function start() {
    await initSchema();
    await ensureAdmin();

    await expireListings();
    setInterval(() => expireListings(), 60 * 60 * 1000);

    await sendActivationNudges();
    setInterval(() => sendActivationNudges(), 60 * 60 * 1000);

    await checkDailyBroadcast();
    setInterval(() => checkDailyBroadcast(), 60 * 60 * 1000);

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Remnant Exchange running at http://localhost:${PORT}`);
    });
}

start().catch(console.error);
