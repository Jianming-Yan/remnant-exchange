const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../database/db');
const { requireIntern } = require('../middleware/auth');
const { sendIntroductionEmail, sendTempPasswordEmail } = require('../utils/email');

const router = express.Router();

router.get('/fabricators', requireIntern, async (req, res) => {
    try {
        const stateId = req.user.territory_state_id;
        const users = await query(`
            SELECT u.id, u.name, u.business_name, u.email, u.phone, u.city, u.outreach_status, u.admin_notes, u.created_at,
                   COUNT(l.id) as active_listings
            FROM users u
            LEFT JOIN listings l ON l.user_id = u.id AND l.status = 'active'
            WHERE u.role = 'fabricator' AND u.territory_state_id = ?
            GROUP BY u.id
            ORDER BY u.business_name ASC
        `, [stateId]);
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to load fabricators' });
    }
});

router.patch('/fabricators/:id/notes', requireIntern, async (req, res) => {
    try {
        const stateId = req.user.territory_state_id;
        const user = await get(`SELECT id FROM users WHERE id = ? AND role = 'fabricator' AND territory_state_id = ?`, [req.params.id, stateId]);
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
        const user = await get(`SELECT * FROM users WHERE id = ? AND role = 'fabricator' AND territory_state_id = ?`, [req.params.id, stateId]);
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
        const user = await get(`SELECT * FROM users WHERE id = ? AND role = 'fabricator' AND territory_state_id = ?`, [req.params.id, stateId]);
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

module.exports = router;
