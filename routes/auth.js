const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../database/db');
const { sendVerificationEmail, sendAdminNotification, sendResetPasswordEmail } = require('../utils/email');

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
        if (!user) return res.status(401).json({ error: 'No account found with that email address. Check your welcome email for the correct login email.' });

        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) return res.status(401).json({ error: 'Incorrect password. Use "Forgot your password?" below to reset it.' });

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
            must_change_password: user.must_change_password === 1,
            user: { id: user.id, name: user.name, business_name: user.business_name, email: user.email, role: user.role, plan: user.plan }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

router.get('/magic-login', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Missing token' });

        const record = await get(`SELECT * FROM email_tokens WHERE token = ? AND type = 'magic-login'`, [token]);
        if (!record) return res.status(400).json({ error: 'Invalid or expired login link' });

        if (new Date(record.expires_at) < new Date()) {
            await run(`DELETE FROM email_tokens WHERE id = ?`, [record.id]);
            return res.status(400).json({ error: 'Login link has expired' });
        }

        await run(`DELETE FROM email_tokens WHERE id = ?`, [record.id]);

        const user = await get(`SELECT * FROM users WHERE id = ?`, [record.user_id]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const jwtToken = jwt.sign(
            { id: user.id, email: user.email, role: user.role, approved: user.approved, plan: user.plan },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token: jwtToken,
            must_change_password: user.must_change_password === 1,
            user: { id: user.id, name: user.name, business_name: user.business_name, email: user.email, role: user.role, plan: user.plan }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Magic login failed' });
    }
});

router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const user = await get(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase()]);
        if (!user) return res.json({ message: 'If that email exists, a temporary password has been sent.' });

        const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase();
        const passwordHash = await bcrypt.hash(tempPassword, 10);
        await run(`UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?`, [passwordHash, user.id]);

        try {
            await sendResetPasswordEmail(user.email, user.name, tempPassword);
        } catch (emailErr) {
            console.error('Reset email failed:', emailErr.message);
            return res.status(500).json({ error: 'Failed to send reset email: ' + emailErr.message });
        }

        res.json({ message: 'A temporary password has been sent to your email.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

router.post('/change-password', async (req, res) => {
    const authHeader = req.headers.authorization?.split(' ')[1];
    if (!authHeader) return res.status(401).json({ error: 'Not authenticated' });

    let decoded;
    try {
        decoded = jwt.verify(authHeader, process.env.JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }

    try {
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password) return res.status(400).json({ error: 'Both fields are required' });
        if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

        const user = await get(`SELECT * FROM users WHERE id = ?`, [decoded.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const valid = await bcrypt.compare(current_password, user.password_hash);
        if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

        const newHash = await bcrypt.hash(new_password, 10);
        await run(`UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`, [newHash, user.id]);

        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to change password' });
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
