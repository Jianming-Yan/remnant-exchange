const express = require('express');
const { get, run } = require('../database/db');

const router = express.Router();

router.get('/unsubscribe', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).send('Invalid unsubscribe link.');

        const lead = await get(`SELECT * FROM contractor_leads WHERE unsubscribe_token = ?`, [token]);
        if (!lead) return res.status(404).send('Unsubscribe link not found or already used.');

        await run(`UPDATE contractor_leads SET unsubscribed = 1 WHERE id = ?`, [lead.id]);

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Unsubscribed — Remnant Exchange</title>
                <link rel="stylesheet" href="/css/style.css">
            </head>
            <body>
            <nav>
                <a href="/" class="nav-logo">Remnant<span>Exchange</span><span style="color:#93c5fd;font-size:0.68em;font-weight:600;">.org</span></a>
            </nav>
            <div class="container" style="max-width:520px;margin:80px auto;text-align:center;">
                <h2>You've been unsubscribed</h2>
                <p style="color:#64748b;">We've removed <strong>${lead.email}</strong> from our contractor outreach list. You won't receive any further emails from us.</p>
                <p style="color:#64748b;">You can still browse remnants for free anytime at <a href="https://remnantexchange.org">remnantexchange.org</a>.</p>
            </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error('contractor unsubscribe error:', err);
        res.status(500).send('Something went wrong. Please try again.');
    }
});

module.exports = router;
