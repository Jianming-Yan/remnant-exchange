require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb, run } = require('./database/db');

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

async function start() {
    await getDb();

    expireListings();
    setInterval(expireListings, 60 * 60 * 1000);

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Remnant Exchange running at http://localhost:${PORT}`);
    });
}

start().catch(console.error);
