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
        cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
    },
});

const uploadMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
        cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
    },
});

router.get('/', async (req, res) => {
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
    if (search) {
        sql += ` AND (l.material_type LIKE ? OR l.stone_name LIKE ? OR l.color LIKE ? OR l.description LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    const listings = await query(sql, params);

    for (const listing of listings) {
        listing.photos = await query(`SELECT filename FROM listing_photos WHERE listing_id = ? ORDER BY display_order ASC`, [listing.id]);
    }

    let countSql = `SELECT count(*) as cnt FROM listings l WHERE l.status = 'active'`;
    const countParams = [];
    if (state) { countSql += ` AND l.state_id = ?`; countParams.push(state); }
    if (metro) { countSql += ` AND l.metro_id = ?`; countParams.push(metro); }
    if (material) { countSql += ` AND l.material_type = ?`; countParams.push(material); }

    const total = await get(countSql, countParams);

    res.json({ listings, total: Number(total?.cnt) || 0, page: parseInt(page), pages: Math.ceil((Number(total?.cnt) || 0) / limit) });
});

router.get('/my', requireApprovedFabricator, async (req, res) => {
    const listings = await query(`
        SELECT l.*, s.name as state_name, s.abbreviation as state_abbr, m.name as metro_name
        FROM listings l
        JOIN states s ON l.state_id = s.id
        JOIN metros m ON l.metro_id = m.id
        WHERE l.user_id = ?
        ORDER BY l.created_at DESC
    `, [req.user.id]);

    for (const listing of listings) {
        listing.photos = await query(`SELECT filename FROM listing_photos WHERE listing_id = ? ORDER BY display_order ASC`, [listing.id]);
    }

    res.json(listings);
});

router.post('/', requireApprovedFabricator, upload.array('photos', 5), async (req, res) => {
    try {
        const { material_type, stone_name, length, width, thickness, state_id, metro_id, description,
                shape, length2, width2, vendor_name, bundle_number } = req.body;

        if (!material_type || !stone_name || !length || !width || !thickness || !state_id || !metro_id) {
            return res.status(400).json({ error: 'All required fields must be filled' });
        }

        const planSettings = await get(`SELECT * FROM plan_settings WHERE plan = ?`, [req.user.plan]);
        const activeCount = await get(`SELECT count(*) as cnt FROM listings WHERE user_id = ? AND status = 'active'`, [req.user.id]);

        const maxPosts = Number(planSettings.max_posts);
        const durationDays = Number(planSettings.duration_days);

        if (Number(activeCount.cnt) >= maxPosts) {
            return res.status(403).json({ error: `Your ${req.user.plan} plan allows a maximum of ${maxPosts} active listings` });
        }

        const id = uuidv4();
        const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
        const slabShape = shape || 'rectangular';

        await run(`INSERT INTO listings (id, user_id, material_type, color, stone_name, shape, length, width, thickness, length2, width2, vendor_name, bundle_number, state_id, metro_id, description, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, req.user.id, material_type, stone_name, stone_name, slabShape,
             parseFloat(length), parseFloat(width), thickness,
             length2 ? parseFloat(length2) : null, width2 ? parseFloat(width2) : null,
             vendor_name || null, bundle_number || null,
             state_id, metro_id, description || null, expiresAt]);

        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                await run(`INSERT INTO listing_photos (id, listing_id, filename, display_order) VALUES (?, ?, ?, ?)`,
                    [uuidv4(), id, req.files[i].filename, i]);
            }
        }

        res.status(201).json({ id, message: 'Listing created successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create listing' });
    }
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

router.put('/:id', requireApprovedFabricator, upload.array('photos', 5), async (req, res) => {
    try {
        const listing = await get(`SELECT * FROM listings WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
        if (!listing) return res.status(404).json({ error: 'Listing not found' });

        const { material_type, stone_name, shape, length, width, thickness, length2, width2,
                vendor_name, bundle_number, state_id, metro_id, description } = req.body;

        if (!material_type || !stone_name || !length || !width || !thickness || !state_id || !metro_id) {
            return res.status(400).json({ error: 'All required fields must be filled' });
        }

        const slabShape = shape || 'rectangular';

        await run(`UPDATE listings SET
            material_type = ?, color = ?, stone_name = ?, shape = ?,
            length = ?, width = ?, thickness = ?,
            length2 = ?, width2 = ?,
            vendor_name = ?, bundle_number = ?,
            state_id = ?, metro_id = ?, description = ?
            WHERE id = ?`,
            [material_type, stone_name, stone_name, slabShape,
             parseFloat(length), parseFloat(width), thickness,
             length2 ? parseFloat(length2) : null, width2 ? parseFloat(width2) : null,
             vendor_name || null, bundle_number || null,
             state_id, metro_id, description || null,
             req.params.id]);

        if (req.files && req.files.length > 0) {
            const oldPhotos = await query(`SELECT filename FROM listing_photos WHERE listing_id = ?`, [req.params.id]);
            oldPhotos.forEach(p => {
                const filePath = path.join(__dirname, '../uploads', p.filename);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            });
            await run(`DELETE FROM listing_photos WHERE listing_id = ?`, [req.params.id]);

            for (let i = 0; i < req.files.length; i++) {
                await run(`INSERT INTO listing_photos (id, listing_id, filename, display_order) VALUES (?, ?, ?, ?)`,
                    [uuidv4(), req.params.id, req.files[i].filename, i]);
            }
        }

        res.json({ message: 'Listing updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update listing' });
    }
});

router.delete('/:id', requireApprovedFabricator, async (req, res) => {
    const listing = await get(`SELECT * FROM listings WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const photos = await query(`SELECT filename FROM listing_photos WHERE listing_id = ?`, [listing.id]);
    photos.forEach(p => {
        const filePath = path.join(__dirname, '../uploads', p.filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    await run(`DELETE FROM listing_photos WHERE listing_id = ?`, [listing.id]);
    await run(`DELETE FROM listings WHERE id = ?`, [listing.id]);

    res.json({ message: 'Listing deleted' });
});

router.get('/states', async (req, res) => {
    const states = await query(`SELECT * FROM states WHERE active = 1 ORDER BY name ASC`);
    res.json(states);
});

router.get('/states/:stateId/metros', async (req, res) => {
    const metros = await query(`SELECT * FROM metros WHERE state_id = ? AND active = 1 ORDER BY name ASC`, [req.params.stateId]);
    res.json(metros);
});

router.get('/materials', (req, res) => {
    res.json(['Granite', 'Marble', 'Quartz', 'Quartzite', 'Travertine', 'Limestone', 'Soapstone', 'Slate', 'Onyx', 'Other']);
});

module.exports = router;
