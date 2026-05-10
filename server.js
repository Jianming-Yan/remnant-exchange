if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb, run, get } = require('./database/db');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/admin', require('./routes/admin'));

function expireListings() {
    try {
        run(`UPDATE listings SET status = 'expired' WHERE status = 'active' AND expires_at < datetime('now')`);
    } catch (err) {
        console.error('Expiry job error:', err);
    }
}

async function ensureAdmin() {
    const admin = get(`SELECT id FROM users WHERE role = 'admin'`);
    if (!admin) {
        const hash = await bcrypt.hash('Admin1234!', 10);
        run(`INSERT INTO users (id, name, business_name, email, password_hash, role, email_verified, approved)
             VALUES (?, 'Admin', 'Remnant Exchange', 'admin@remnantexchange.com', ?, 'admin', 1, 1)`,
            [uuidv4(), hash]);
        console.log('Admin account created');
    }
}

async function start() {
    await getDb();
    await ensureAdmin();

    expireListings();
    setInterval(expireListings, 60 * 60 * 1000);

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Remnant Exchange running at http://localhost:${PORT}`);
    });
}

start().catch(console.error);
