const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../database/db');
const { sendVerificationEmail, sendAdminNotification } = require('../utils/email');

const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { name, business_name, email, password, phone } = req.body;

        if (!name || !business_name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const existing = await get(`SELECT id FROM users WHERE email = ?`, [email.toLowerCase()]);
        if (existing) return res.status(400).json({ error: 'Email already registered' });

        const userId = uuidv4();
        const passwordHash = await bcrypt.hash(password, 10);

        await run(`INSERT INTO users (id, name, business_name, email, password_hash, phone) VALUES (?, ?, ?, ?, ?, ?)`,
            [userId, name, business_name, email.toLowerCase(), passwordHash, phone || null]);

        const token = uuidv4();
        const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await run(`INSERT INTO email_tokens (id, user_id, token, type, expires_at) VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), userId, token, 'verify', expires]);

        try {
            await sendVerificationEmail(email, name, token);
        } catch (emailErr) {
            console.error('Email send failed:', emailErr.message);
        }

        res.json({ message: 'Registration successful. Please check your email to verify your account.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Invalid token' });

        const record = await get(`SELECT * FROM email_tokens WHERE token = ? AND type = 'verify'`, [token]);
        if (!record) return res.status(400).json({ error: 'Invalid or expired verification link' });

        if (new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Verification link has expired' });
        }

        await run(`UPDATE users SET email_verified = 1, approved = 1 WHERE id = ?`, [record.user_id]);
        await run(`DELETE FROM email_tokens WHERE id = ?`, [record.id]);

        const user = await get(`SELECT * FROM users WHERE id = ?`, [record.user_id]);
        try {
            await sendAdminNotification(user);
        } catch (emailErr) {
            console.error('Admin notification failed:', emailErr.message);
        }

        res.redirect('/email-verified.html');
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Verification failed' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase()]);
        if (!user) return res.status(401).json({ error: 'Invalid email or password' });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

        if (!user.email_verified) {
            return res.status(403).json({ error: 'Please verify your email address first' });
        }

        if (user.role === 'fabricator' && !user.approved) {
            return res.status(403).json({ error: 'Your account is pending admin approval' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, approved: user.approved, plan: user.plan },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            user: { id: user.id, name: user.name, business_name: user.business_name, email: user.email, role: user.role, plan: user.plan }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

router.get('/me', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await get(`SELECT id, name, business_name, email, role, plan, approved, created_at FROM users WHERE id = ?`, [decoded.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;
