const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../database/db');
const { sendVerificationEmail, sendAdminNotification, sendResetPasswordEmail, sendUnsubscribeConfirmationEmail, sendReactivationWelcomeEmail } = require('../utils/email');

const router = express.Router();

// How long an unverified signup waits in pending_registrations before the hourly
// sweep in server.js discards it. Fabricators often check email only once a week,
// so a 24h window silently deleted real signups before they ever clicked.
const PENDING_VERIFY_DAYS = 7;

// Minimum gap between verification emails to one address, so the unauthenticated
// resend endpoint cannot be used to mail-bomb someone.
const RESEND_THROTTLE_SECONDS = 60;

router.post('/register', async (req, res) => {
    try {
        const { name, business_name, email, password, phone, company_website } = req.body;

        // Honeypot: the hidden company_website field is invisible to real users, so any
        // value means an automated bot filled every field. Return a fake success (no
        // account created) so the bot thinks it worked and doesn't retry/adapt.
        if (company_website) {
            console.log(`[honeypot] blocked bot registration: email=${(email || '').toLowerCase()} name="${name || ''}"`);
            return res.status(200).json({ message: 'Registration successful. Please check your email to verify your account.' });
        }

        if (!name || !business_name || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const existing = await get(`SELECT id, outreach_status FROM users WHERE email = ?`, [email.toLowerCase()]);
        if (existing) {
            if (existing.outreach_status === 'unsubscribed') {
                return res.status(400).json({ code: 'ACCOUNT_UNSUBSCRIBED', error: 'This email was previously unsubscribed. Would you like to reactivate your account?' });
            }
            return res.status(400).json({ error: 'Email already registered' });
        }

        // Deferred registration: DO NOT create a users row here. An unverified
        // signup (e.g. a bot) must never become a registered user. We stash the
        // signup in pending_registrations and only create the real users row when
        // the applicant clicks the verify link (see /verify-email below).
        const passwordHash = await bcrypt.hash(password, 10);
        const token = uuidv4();
        const expires = new Date(Date.now() + PENDING_VERIFY_DAYS * 24 * 60 * 60 * 1000).toISOString();

        // Replace any earlier un-verified attempt for this email so a resend works.
        await run(`DELETE FROM pending_registrations WHERE email = ?`, [email.toLowerCase()]).catch(() => {});
        await run(`INSERT INTO pending_registrations (id, token, name, business_name, email, password_hash, phone, expires_at, last_sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
            [uuidv4(), token, name, business_name, email.toLowerCase(), passwordHash, phone || null, expires]);

        // Never report success when the verification email did not go out — the
        // applicant would sit waiting for a message that does not exist, and the
        // pending row would be swept before anyone noticed. The row is kept so
        // /resend-verification can retry without re-entering the form.
        try {
            await sendVerificationEmail(email, name, token);
        } catch (emailErr) {
            console.error('Verification email send failed for', email.toLowerCase(), '-', emailErr.message);
            return res.status(502).json({
                code: 'VERIFICATION_EMAIL_FAILED',
                error: 'Your details were saved, but we could not send the verification email. Please check the address for typos and click "Resend verification email", or contact us at ming@remnanttrading.com.',
            });
        }

        res.json({ message: 'Registration successful. Please check your email to verify your account.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Re-send the verification email for a signup still waiting in pending_registrations.
// Without this, anyone whose verification email was lost, filtered to spam, or failed
// to send had no way forward at all — their only option was to register again.
router.post('/resend-verification', async (req, res) => {
    try {
        const email = (req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ error: 'Email is required' });

        // Already verified: registering again would only hit "Email already registered",
        // so point them at the door they can actually walk through.
        const existing = await get(`SELECT id FROM users WHERE email = ?`, [email]);
        if (existing) {
            return res.status(400).json({
                code: 'ALREADY_REGISTERED',
                error: 'This email already has an account. Try logging in, or use "Forgot password" to reset it.',
            });
        }

        // Compare last_sent_at in SQL: it is written by datetime('now') and so is not
        // in the ISO format JS Date parses reliably.
        const pending = await get(
            `SELECT *, (last_sent_at IS NOT NULL AND last_sent_at > datetime('now', ?)) AS throttled
             FROM pending_registrations WHERE email = ?`,
            [`-${RESEND_THROTTLE_SECONDS} seconds`, email]
        );
        if (!pending) {
            return res.status(404).json({
                code: 'NO_PENDING',
                error: 'We could not find a pending signup for that email. Please register again.',
            });
        }

        if (Number(pending.throttled)) {
            return res.status(429).json({ error: 'A verification email was just sent. Please wait a minute before trying again.' });
        }

        // Issue a fresh token and restart the clock, so a resend is always usable
        // even if the original link is already close to expiring.
        const token = uuidv4();
        const expires = new Date(Date.now() + PENDING_VERIFY_DAYS * 24 * 60 * 60 * 1000).toISOString();
        await run(`UPDATE pending_registrations SET token = ?, expires_at = ?, last_sent_at = datetime('now') WHERE id = ?`,
            [token, expires, pending.id]);

        try {
            await sendVerificationEmail(pending.email, pending.name, token);
        } catch (emailErr) {
            console.error('Verification resend failed for', email, '-', emailErr.message);
            return res.status(502).json({
                code: 'VERIFICATION_EMAIL_FAILED',
                error: 'We could not send the verification email. Please contact us at ming@remnanttrading.com and we will set up your account.',
            });
        }

        res.json({ message: 'Verification email sent. Please check your inbox, and your spam folder.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to resend verification email' });
    }
});

router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Invalid token' });

        // New flow: the signup is waiting in pending_registrations. Clicking the
        // link is what actually creates the verified users row — so an unverified
        // signup never becomes a registered user.
        const pending = await get(`SELECT * FROM pending_registrations WHERE token = ?`, [token]);
        if (pending) {
            if (new Date(pending.expires_at) < new Date()) {
                await run(`DELETE FROM pending_registrations WHERE id = ?`, [pending.id]).catch(() => {});
                return res.status(400).json({ error: 'Verification link has expired' });
            }

            // Guard against a duplicate account if two links for the same email are clicked.
            const already = await get(`SELECT id FROM users WHERE email = ?`, [pending.email]);
            if (already) {
                await run(`DELETE FROM pending_registrations WHERE id = ?`, [pending.id]).catch(() => {});
                return res.redirect('/email-verified.html');
            }

            const userId = uuidv4();
            await run(`INSERT INTO users (id, name, business_name, email, password_hash, phone, source, email_verified, approved) VALUES (?, ?, ?, ?, ?, ?, 'self_registered', 1, 1)`,
                [userId, pending.name, pending.business_name, pending.email, pending.password_hash, pending.phone || null]);

            // Now that the email is proven, mark the matching outreach lead registered.
            await run(`UPDATE fabricator_leads SET registered = 1 WHERE email = ?`, [pending.email]).catch(() => {});
            await run(`DELETE FROM pending_registrations WHERE id = ?`, [pending.id]).catch(() => {});

            const user = await get(`SELECT * FROM users WHERE id = ?`, [userId]);
            try {
                await sendAdminNotification(user);
            } catch (emailErr) {
                console.error('Admin notification failed:', emailErr.message);
            }
            return res.redirect('/email-verified.html');
        }

        // Backward-compat: tokens issued by the OLD flow point at an already-created
        // users row via email_tokens. Keep honoring those until they age out.
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

        if (user.outreach_status === 'unsubscribed') {
            return res.status(403).json({ error: 'Your account has been deactivated. Please register again at remnantexchange.org to rejoin.' });
        }

        if (!user.email_verified) {
            return res.status(403).json({ error: 'Please verify your email address first' });
        }

        if (user.role === 'fabricator' && !user.approved) {
            return res.status(403).json({ error: 'Your account is pending admin approval' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, approved: user.approved, plan: user.plan, territory_state_id: user.territory_state_id || null, extra_territories: user.extra_territories || null },
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
            { id: user.id, email: user.email, role: user.role, approved: user.approved, plan: user.plan, territory_state_id: user.territory_state_id || null, extra_territories: user.extra_territories || null },
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

router.get('/unsubscribe', async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Invalid link' });

        const record = await get(`SELECT * FROM email_tokens WHERE token = ? AND type = 'unsubscribe'`, [token]);
        if (!record) return res.status(400).json({ error: 'Invalid or expired unsubscribe link' });

        const user = await get(`SELECT * FROM users WHERE id = ?`, [record.user_id]);
        if (!user) return res.status(404).json({ error: 'Account not found' });

        await run(`UPDATE users SET approved = 0, outreach_status = 'unsubscribed', unsubscribed_at = ? WHERE id = ?`,
            [new Date().toISOString(), user.id]);
        await run(`DELETE FROM email_tokens WHERE id = ?`, [record.id]);

        try {
            await sendUnsubscribeConfirmationEmail(user.email, user.business_name);
        } catch (e) { console.error('Unsubscribe confirm email failed:', e.message); }

        res.json({ message: 'You have been successfully unsubscribed.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Unsubscribe failed' });
    }
});

router.post('/reactivate', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
        if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

        const user = await get(`SELECT * FROM users WHERE email = ? AND outreach_status = 'unsubscribed'`, [email.toLowerCase()]);
        if (!user) return res.status(404).json({ error: 'No unsubscribed account found with that email' });

        const passwordHash = await bcrypt.hash(password, 10);
        await run(`UPDATE users SET password_hash = ?, approved = 1, email_verified = 1, must_change_password = 0, outreach_status = 'credentials', reactivated_at = ? WHERE id = ?`,
            [passwordHash, new Date().toISOString(), user.id]);

        try {
            await sendReactivationWelcomeEmail(user.email, user.name);
        } catch (e) { console.error('Reactivation email failed:', e.message); }

        res.json({ message: 'Your account has been reactivated. You can now log in.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Reactivation failed' });
    }
});

module.exports = router;
