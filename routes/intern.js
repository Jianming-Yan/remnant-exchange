const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../database/db');
const { requireIntern } = require('../middleware/auth');
const { sendIntroductionEmail, sendTempPasswordEmail } = require('../utils/email');

const router = express.Router();

router.get('/states', requireIntern, async (req, res) => {
    try {
        const states = await query(`SELECT id, name, abbreviation FROM states ORDER BY name ASC`);
        res.json(states);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load states' });
    }
});

router.get('/fabricators', requireIntern, async (req, res) => {
    try {
        const stateId = req.user.territory_state_id;
        const internId = req.user.id;
        const users = await query(`
            SELECT u.id, u.name, u.business_name, u.email, u.phone, u.city, u.outreach_status, u.admin_notes, u.created_at,
                   u.territory_state_id, s.name as territory_state_name, s.abbreviation as territory_state_abbr,
                   COUNT(l.id) as active_listings,
                   CASE WHEN u.territory_state_id = ? THEN 1 ELSE 0 END as is_own_territory
            FROM users u
            LEFT JOIN listings l ON l.user_id = u.id AND l.status = 'active'
            LEFT JOIN states s ON s.id = u.territory_state_id
            WHERE u.role = 'fabricator'
              AND (u.territory_state_id = ? OR u.added_by_intern_id = ?)
            GROUP BY u.id
            ORDER BY is_own_territory DESC, u.business_name ASC
        `, [stateId, stateId, internId]);
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load fabricators' });
    }
});

router.post('/fabricators', requireIntern, async (req, res) => {
    try {
        const { name, business_name, email, phone, city, notes, territory_state_id } = req.body;
        if (!name || !business_name || !email) return res.status(400).json({ error: 'Business name, contact name, and email are required' });

        const existing = await get(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase()]);
        if (existing) return res.status(400).json({ error: 'A fabricator with that email already exists' });

        const tempPassword = '12345678';
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        const userId = uuidv4();
        const stateId = territory_state_id || req.user.territory_state_id;

        await run(`INSERT INTO users (id, name, business_name, email, password_hash, phone, city, admin_notes, email_verified, approved, must_change_password, territory_state_id, added_by_intern_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, ?, ?)`,
            [userId, name, business_name, email.toLowerCase(), passwordHash, phone || null, city || null, notes || null, stateId, req.user.id]);

        res.json({ message: `${business_name} added to your list` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add fabricator' });
    }
});

router.patch('/fabricators/:id/notes', requireIntern, async (req, res) => {
    try {
        const stateId = req.user.territory_state_id;
        const internId = req.user.id;
        const user = await get(`SELECT id FROM users WHERE id = ? AND role = 'fabricator' AND (territory_state_id = ? OR added_by_intern_id = ?)`, [req.params.id, stateId, internId]);
        if (!user) return res.status(404).json({ error: 'Fabricator not found' });

        await run(`UPDATE users SET admin_notes = ? WHERE id = ?`, [req.body.notes || null, req.params.id]);
        res.json({ message: 'Notes updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update notes' });
    }
});

router.post('/fabricators/:id/send-introduction', requireIntern, async (req, res) => {
    try {
        const stateId = req.user.territory_state_id;
        const internId = req.user.id;
        const user = await get(`SELECT * FROM users WHERE id = ? AND role = 'fabricator' AND (territory_state_id = ? OR added_by_intern_id = ?)`, [req.params.id, stateId, internId]);
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

router.post('/fabricators/:id/send-credentials', requireIntern, async (req, res) => {
    try {
        const stateId = req.user.territory_state_id;
        const internId = req.user.id;
        const user = await get(`SELECT * FROM users WHERE id = ? AND role = 'fabricator' AND (territory_state_id = ? OR added_by_intern_id = ?)`, [req.params.id, stateId, internId]);
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

// -------- Leads (intern-sourced, not bulk-imported) --------

router.get('/leads', requireIntern, async (req, res) => {
    try {
        const leads = await query(
            `SELECT * FROM fabricator_leads WHERE added_by_intern_id = ? ORDER BY created_at DESC`,
            [req.user.id]
        );
        res.json(leads);
    } catch (err) {
        res.status(500).json({ error: 'Failed to load leads' });
    }
});

router.post('/leads', requireIntern, async (req, res) => {
    try {
        const { business_name, contact_name, email, phone, city, state } = req.body;
        if (!business_name || !email) return res.status(400).json({ error: 'Business name and email are required' });

        const existing = await get(`SELECT id FROM fabricator_leads WHERE email = ?`, [email.toLowerCase()]);
        if (existing) return res.status(400).json({ error: 'A lead with that email already exists' });

        const registered = await get(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase()]);
        if (registered) return res.status(400).json({ error: 'This fabricator is already registered on Remnant Exchange' });

        const id = uuidv4();
        const unsubToken = uuidv4();
        await run(
            `INSERT INTO fabricator_leads (id, business_name, contact_name, email, phone, city, state, unsubscribe_token, added_by_intern_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, business_name, contact_name || null, email.toLowerCase(), phone || null, city || null, state || null, unsubToken, req.user.id]
        );
        res.json({ message: 'Lead added' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add lead: ' + err.message });
    }
});

router.patch('/leads/:id/call', requireIntern, async (req, res) => {
    try {
        const lead = await get(
            `SELECT id FROM fabricator_leads WHERE id = ? AND added_by_intern_id = ?`,
            [req.params.id, req.user.id]
        );
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        const { call_outcome, call_notes } = req.body;
        await run(
            `UPDATE fabricator_leads SET call_outcome = ?, call_notes = ?, called_at = datetime('now') WHERE id = ?`,
            [call_outcome, call_notes || null, req.params.id]
        );
        res.json({ message: 'Call logged' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to log call' });
    }
});

router.post('/leads/:id/create-account', requireIntern, async (req, res) => {
    try {
        const lead = await get(
            `SELECT * FROM fabricator_leads WHERE id = ? AND added_by_intern_id = ?`,
            [req.params.id, req.user.id]
        );
        if (!lead) return res.status(404).json({ error: 'Lead not found' });

        const existing = await get(`SELECT id FROM users WHERE email = ?`, [lead.email]);
        if (existing) return res.status(400).json({ error: 'An account with that email already exists' });

        let stateId = req.user.territory_state_id;
        if (lead.state) {
            const stateRow = await get(`SELECT id FROM states WHERE abbreviation = ?`, [lead.state]);
            if (stateRow) stateId = stateRow.id;
        }

        const tempPassword = '12345678';
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        const userId = uuidv4();
        const contactName = lead.contact_name || lead.business_name;

        await run(
            `INSERT INTO users (id, name, business_name, email, password_hash, phone, city, email_verified, approved, must_change_password, territory_state_id, added_by_intern_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1, ?, ?, ?)`,
            [userId, contactName, lead.business_name, lead.email, passwordHash, lead.phone || null, lead.city || null, stateId, req.user.id, 'intern_lead']
        );

        const magicToken = uuidv4();
        const magicExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await run(`INSERT INTO email_tokens (id, user_id, token, type, expires_at) VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), userId, magicToken, 'magic-login', magicExpires]);

        await sendTempPasswordEmail(lead.email, contactName, tempPassword, magicToken);
        await run(`UPDATE fabricator_leads SET registered = 1 WHERE id = ?`, [lead.id]);

        res.json({ message: `Account created and credentials sent to ${lead.email}` });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create account: ' + err.message });
    }
});

module.exports = router;
