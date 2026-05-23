if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { v4: uuidv4 } = require('uuid');
const { initSchema, run, get } = require('./database/db');

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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/admin', require('./routes/admin'));

const { sendBuyerRequestEmail } = require('./utils/email');
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
    } catch (err) {
        console.error('Expiry job error:', err);
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

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Remnant Exchange running at http://localhost:${PORT}`);
    });
}

start().catch(console.error);
