const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../database/db');
const { requireAdmin } = require('../middleware/auth');
const { sendApprovalEmail, sendRejectionEmail } = require('../utils/email');

const router = express.Router();

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

router.get('/stats', requireAdmin, async (req, res) => {
    const totalFabricators = await get(`SELECT count(*) as cnt FROM users WHERE role = 'fabricator' AND approved = 1`);
    const pendingApproval = await get(`SELECT count(*) as cnt FROM users WHERE role = 'fabricator' AND email_verified = 1 AND approved = 0`);
    const activeListings = await get(`SELECT count(*) as cnt FROM listings WHERE status = 'active'`);
    const expiredListings = await get(`SELECT count(*) as cnt FROM listings WHERE status = 'expired'`);

    res.json({
        totalFabricators: Number(totalFabricators.cnt),
        pendingApproval: Number(pendingApproval.cnt),
        activeListings: Number(activeListings.cnt),
        expiredListings: Number(expiredListings.cnt),
    });
});

module.exports = router;
