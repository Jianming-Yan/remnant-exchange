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
app.set('trust proxy', true); // behind Cloudflare + Render, so req.protocol/host reflect the original request

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

// Simple branded landing page for the activation flow below.
function activateResultPage(title, bodyHtml, ctaUrl, ctaLabel) {
    const cta = ctaUrl
        ? `<p style="margin-top:28px;"><a href="${ctaUrl}" style="background:#2563eb;color:white;padding:12px 28px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">${ctaLabel || 'Log In'} &rarr;</a></p>`
        : '';
    return `<html><body style="font-family:Arial,sans-serif;max-width:480px;margin:80px auto;text-align:center;color:#1a1a1a;line-height:1.6;padding:0 16px;">
        <h2>${title}</h2>
        <p style="color:#64748b;">${bodyHtml}</p>
        ${cta}
    </body></html>`;
}

// Fabricator lead one-click account activation (public, no auth).
// Cold-outreach leads already have their business name/email/phone/city in
// fabricator_leads, so the "Create Your Free Account" button provisions the
// account straight from the lead record and emails a temp password — no form.
app.get('/api/fab-leads/activate', async (req, res) => {
    try {
        // Build links from the REQUEST host so a click on a remnanttrading.com email
        // stays on remnanttrading.com (matching from-domain + link-domain). Falls back
        // to BASE_URL if the host header is somehow missing.
        const base = req.get('host') ? `${req.protocol}://${req.get('host')}` : process.env.BASE_URL;
        const brand = /remnanttrading/i.test(req.get('host') || '') ? 'Remnant Trading' : 'Remnant Exchange';

        const { token } = req.query;
        if (!token) return res.redirect(`${base}/register.html`);

        const lead = await get(`SELECT * FROM fabricator_leads WHERE unsubscribe_token = ?`, [token]);
        // Unknown token (e.g. admin-monitor copy or forwarded/edited link) -> normal signup form.
        if (!lead) return res.redirect(`${base}/register.html`);

        const email = (lead.email || '').toLowerCase();
        const existing = await get(`SELECT id FROM users WHERE email = ?`, [email]);
        if (existing) {
            // Already has an account — never reset their password; just point them to login.
            await run(`UPDATE fabricator_leads SET registered = 1 WHERE id = ?`, [lead.id]);
            return res.send(activateResultPage(
                'You already have an account',
                `An account for <strong>${email}</strong> already exists. Log in below — or use "Forgot password" on the login page if you need to reset it.`,
                `${base}/login.html`, 'Log In'
            ));
        }

        // Provision the account from the lead record (mirrors admin create-fabricator).
        const tempPassword = '12345678';
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        const userId = uuidv4();
        const name = lead.contact_name || lead.business_name;
        await run(
            `INSERT INTO users (id, name, business_name, email, password_hash, phone, city, state, email_verified, approved, must_change_password, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 'lead_activated')`,
            [userId, name, lead.business_name, email, passwordHash, lead.phone || null, lead.city || null, lead.state || null]
        );
        await run(`UPDATE fabricator_leads SET registered = 1 WHERE id = ?`, [lead.id]);

        // Fresh single-use magic-login token so the CTA + emailed link log them straight in.
        const magicToken = uuidv4();
        const magicExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await run(`DELETE FROM email_tokens WHERE user_id = ? AND type = 'magic-login'`, [userId]);
        await run(`INSERT INTO email_tokens (id, user_id, token, type, expires_at) VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), userId, magicToken, 'magic-login', magicExpires]);

        try {
            await sendTempPasswordEmail(email, name, tempPassword, magicToken);
        } catch (emailErr) {
            console.error('Activation temp-password email failed:', emailErr.message);
        }

        return res.send(activateResultPage(
            'Your account is ready! &#127881;',
            `We have created your free ${brand} account and emailed your login details to <strong>${email}</strong>. Click below to log in — your temporary password is in that email.`,
            `${base}/login.html?magic=${magicToken}`, 'Log In Now'
        ));
    } catch (err) {
        console.error('fab-lead activate error:', err);
        res.status(500).send(activateResultPage(
            'Something went wrong',
            'We could not activate your account automatically. Please register directly instead.',
            `${process.env.BASE_URL}/register.html`, 'Register'
        ));
    }
});

// Resend webhook: hard bounces & spam complaints -> mark leads undeliverable so broadcasts skip them.
// Set RESEND_WEBHOOK_SECRET, then in Resend -> Webhooks add an endpoint at
// {BASE_URL}/api/webhooks/resend/<RESEND_WEBHOOK_SECRET> subscribed to email.bounced + email.complained.
app.post('/api/webhooks/resend/:secret', async (req, res) => {
    try {
        if (!process.env.RESEND_WEBHOOK_SECRET || req.params.secret !== process.env.RESEND_WEBHOOK_SECRET) {
            return res.status(401).json({ error: 'unauthorized' });
        }
        const event = req.body || {};
        const data = event.data || {};
        const isBounce = event.type === 'email.bounced';
        const isComplaint = event.type === 'email.complained';

        if (isBounce || isComplaint) {
            // Soft/transient bounces are temporary — don't permanently suppress those.
            const bounceType = (data.bounce && (data.bounce.type || data.bounce.subType)) || '';
            if (isBounce && /soft|transient|temporary/i.test(String(bounceType))) {
                return res.json({ ok: true, skipped: 'soft bounce' });
            }
            const recipients = [].concat(data.to || []).filter(Boolean);
            for (const email of recipients) {
                await run(`UPDATE fabricator_leads SET bounced = 1 WHERE email = ?`, [email]).catch(() => {});
            }
            console.log(`Resend webhook ${event.type}: suppressed ${recipients.join(', ') || '(none)'}`);
        }
        res.json({ ok: true });
    } catch (err) {
        console.error('Resend webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

const { sendBuyerRequestEmail, sendActivationNudgeEmail, sendFabLeadIntroEmail, sendFabLeadFollowUp1Email, sendFabLeadFollowUp2Email, sendTempPasswordEmail } = require('./utils/email');
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
        // Sweep abandoned self-registrations whose verify link expired unclicked
        // (bots and drop-offs). These never became users; just clear the pending rows.
        await run(`DELETE FROM pending_registrations WHERE expires_at < datetime('now')`).catch(() => {});
    } catch (err) {
        console.error('Expiry job error:', err);
    }
}

async function sendDailyFabLeadBroadcast() {
    // PAUSED 2026-06-14: do not auto-broadcast to the un-validated lead list.
    // Re-enable by setting BROADCAST_ENABLED=true on Render AFTER list validation.
    if (process.env.BROADCAST_ENABLED !== 'true') {
        console.log('Daily fab lead broadcast is PAUSED (set BROADCAST_ENABLED=true to resume)');
        return;
    }
    try {
        const limit = parseInt(process.env.FAB_LEAD_DAILY_LIMIT || '50');

        // Safety: skip if we already sent emails today (UTC date)
        const alreadySent = await get(`SELECT COUNT(*) as cnt FROM fabricator_leads WHERE DATE(last_sent_at) = DATE('now')`);
        if (Number(alreadySent.cnt) > 0) {
            console.log('Daily broadcast: already sent today, skipping');
            return;
        }

        const leads = await query(
            `SELECT * FROM fabricator_leads WHERE touch_count < 3 AND unsubscribed = 0 AND registered = 0 AND bounced = 0 LIMIT ?`,
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
                await new Promise(r => setTimeout(r, 300));
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
