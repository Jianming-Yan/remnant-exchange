const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('../database/db');
const { requireApprovedFabricator, requireAuth } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
    filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname)),
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, allowed.includes(ext));
    },
});

router.get('/', (req, res) => {
    const { state, metro, material, search, page = 1 } = req.query;
    const limit = 24;
    const offset = (parseInt(page) - 1) * limit;

    let sql = `
        SELECT l.*, u.name as seller_name, u.business_name, u.phone, u.email as seller_email,
               s.name as state_name, s.abbreviation as state_abbr, m.name as metro_name
        FROM listings l
        JOIN users u ON l.user_id = u.id
        JOIN states s ON l.state_id = s.id
        JOIN metros m ON l.metro_id = m.id
        WHERE l.status = 'active'
    `;
    const params = [];

    if (state) { sql += ` AND l.state_id = ?`; params.push(state); }
    if (metro) { sql += ` AND l.metro_id = ?`; params.push(metro); }
    if (material) { sql += ` AND l.material_type = ?`; params.push(material); }
    if (search) { sql += ` AND (l.material_type LIKE ? OR l.stone_name LIKE ? OR l.color LIKE ? OR l.description LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`); }

    sql += ` ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const listings = query(sql, params);

    for (const listing of listings) {
        listing.photos = query(`SELECT filename FROM listing_photos WHERE listing_id = ? ORDER BY display_order ASC`, [listing.id]);
    }

    const countSql = `SELECT count(*) as cnt FROM listings l WHERE l.status = 'active'` +
        (state ? ` AND l.state_id = '${state}'` : '') +
        (metro ? ` AND l.metro_id = '${metro}'` : '') +
        (material ? ` AND l.material_type = '${material}'` : '');

    const total = get(countSql);

    res.json({ listings, total: total?.cnt || 0, page: parseInt(page), pages: Math.ceil((total?.cnt || 0) / limit) });
});

router.get('/my', requireApprovedFabricator, (req, res) => {
    const listings = query(`
        SELECT l.*, s.name as state_name, s.abbreviation as state_abbr, m.name as metro_name
        FROM listings l
        JOIN states s ON l.state_id = s.id
        JOIN metros m ON l.metro_id = m.id
        WHERE l.user_id = ?
        ORDER BY l.created_at DESC
    `, [req.user.id]);

    for (const listing of listings) {
        listing.photos = query(`SELECT filename FROM listing_photos WHERE listing_id = ? ORDER BY display_order ASC`, [listing.id]);
    }

    res.json(listings);
});

router.post('/', requireApprovedFabricator, upload.array('photos', 5), (req, res) => {
    try {
        const { material_type, stone_name, length, width, thickness, state_id, metro_id, description,
                shape, length2, width2, vendor_name, bundle_number } = req.body;

        if (!material_type || !stone_name || !length || !width || !thickness || !state_id || !metro_id) {
            return res.status(400).json({ error: 'All required fields must be filled' });
        }

        const planSettings = get(`SELECT * FROM plan_settings WHERE plan = ?`, [req.user.plan]);
        const activeCount = get(`SELECT count(*) as cnt FROM listings WHERE user_id = ? AND status = 'active'`, [req.user.id]);

        if (activeCount.cnt >= planSettings.max_posts) {
            return res.status(403).json({ error: `Your ${req.user.plan} plan allows a maximum of ${planSettings.max_posts} active listings` });
        }

        const id = uuidv4();
        const expiresAt = new Date(Date.now() + planSettings.duration_days * 24 * 60 * 60 * 1000).toISOString();
        const slabShape = shape || 'rectangular';

        run(`INSERT INTO listings (id, user_id, material_type, color, stone_name, shape, length, width, thickness, length2, width2, vendor_name, bundle_number, state_id, metro_id, description, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, req.user.id, material_type, stone_name, stone_name, slabShape,
             parseFloat(length), parseFloat(width), thickness,
             length2 ? parseFloat(length2) : null, width2 ? parseFloat(width2) : null,
             vendor_name || null, bundle_number || null,
             state_id, metro_id, description || null, expiresAt]);

        if (req.files && req.files.length > 0) {
            req.files.forEach((file, index) => {
                run(`INSERT INTO listing_photos (id, listing_id, filename, display_order) VALUES (?, ?, ?, ?)`,
                    [uuidv4(), id, file.filename, index]);
            });
        }

        res.status(201).json({ id, message: 'Listing created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create listing' });
    }
});

const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
    },
});

router.post('/identify-stone', requireApprovedFabricator, uploadMemory.single('photo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No photo provided' });

        const Anthropic = require('@anthropic-ai/sdk');
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

        const message = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 256,
            messages: [{
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: { type: 'base64', media_type: req.file.mimetype, data: req.file.buffer.toString('base64') },
                    },
                    {
                        type: 'text',
                        text: 'This is a stone slab remnant photo. Identify the material type (one of: Granite, Marble, Quartz, Quartzite, Travertine, Limestone, Soapstone, Slate, Onyx, Other) and the stone name or color pattern. Respond in JSON only with no extra text: {"material_type": "...", "stone_name": "..."}',
                    },
                ],
            }],
        });

        const text = message.content[0].text.trim();
        let result = { material_type: '', stone_name: '' };
        try {
            const jsonMatch = text.match(/\{[\s\S]*?\}/);
            if (jsonMatch) result = JSON.parse(jsonMatch[0]);
        } catch {}

        res.json(result);
    } catch (err) {
        console.error('Identify stone error:', err);
        res.status(500).json({ error: 'Could not identify stone' });
    }
});

router.delete('/:id', requireApprovedFabricator, (req, res) => {
    const listing = get(`SELECT * FROM listings WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const photos = query(`SELECT filename FROM listing_photos WHERE listing_id = ?`, [listing.id]);
    photos.forEach(p => {
        const filePath = path.join(__dirname, '../uploads', p.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    run(`DELETE FROM listing_photos WHERE listing_id = ?`, [listing.id]);
    run(`DELETE FROM listings WHERE id = ?`, [listing.id]);

    res.json({ message: 'Listing deleted' });
});

router.get('/states', (req, res) => {
    const states = query(`SELECT * FROM states WHERE active = 1 ORDER BY name ASC`);
    res.json(states);
});

router.get('/states/:stateId/metros', (req, res) => {
    const metros = query(`SELECT * FROM metros WHERE state_id = ? AND active = 1 ORDER BY name ASC`, [req.params.stateId]);
    res.json(metros);
});

router.get('/materials', (req, res) => {
    res.json(['Granite', 'Marble', 'Quartz', 'Quartzite', 'Travertine', 'Limestone', 'Soapstone', 'Slate', 'Onyx', 'Other']);
});

module.exports = router;
