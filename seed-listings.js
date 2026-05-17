require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { run, get, query, initSchema } = require('./database/db');

const SEED_EMAIL = 'seed@remnantexchange.org';

const LISTINGS = [
    // ── BOSTON (15) ──────────────────────────────────────────────────────────
    { metro: 'Boston', material_type: 'granite',   stone_name: 'Calacatta Gold',       color: 'White/Gold',   length: 48, width: 72, thickness: '3cm', description: 'Gorgeous gold veining, polished finish. Cut from a full slab. Perfect for a kitchen island or master bath vanity.' },
    { metro: 'Boston', material_type: 'granite',   stone_name: 'Black Galaxy',         color: 'Black',        length: 36, width: 60, thickness: '3cm', description: 'Classic black with gold flecks. No chips or cracks. Great for a bathroom vanity or bar top.' },
    { metro: 'Boston', material_type: 'marble',    stone_name: 'Carrara White',        color: 'White/Grey',   length: 54, width: 84, thickness: '2cm', description: 'Soft grey veining on white background. Light etching on one edge — not visible when installed. Ideal for bathroom.' },
    { metro: 'Boston', material_type: 'granite',   stone_name: 'New Venetian Gold',    color: 'Gold/Brown',   length: 42, width: 66, thickness: '3cm', description: 'Warm gold and brown tones. Excellent condition, polished both sides. Enough for a small kitchen counter or two vanities.' },
    { metro: 'Boston', material_type: 'quartz',    stone_name: 'Silestone White Storm', color: 'White',       length: 30, width: 48, thickness: '3cm', description: 'Engineered quartz, like-new condition. Works well for laundry room, powder room, or small bathroom.' },
    { metro: 'Boston', material_type: 'granite',   stone_name: 'Ubatuba',             color: 'Black/Green',  length: 36, width: 48, thickness: '3cm', description: 'Dark green with gold and silver flecks. Ready to pick up. Good for fireplace surround or accent countertop.' },
    { metro: 'Boston', material_type: 'quartzite', stone_name: 'Taj Mahal',           color: 'Cream/Gold',   length: 48, width: 60, thickness: '3cm', description: 'Warm cream with soft gold veining. One of the most popular quartzites. Pristine condition, no cracks.' },
    { metro: 'Boston', material_type: 'granite',   stone_name: 'Steel Grey',          color: 'Grey',         length: 24, width: 60, thickness: '2cm', description: 'Uniform steel grey with subtle speckle. Thin piece ideal for a bathroom vanity top or window sill.' },
    { metro: 'Boston', material_type: 'quartz',    stone_name: 'Calacatta Nuvo',      color: 'White/Gold',   length: 40, width: 72, thickness: '3cm', description: 'Bold gold veining on bright white. Engineered quartz, scratch and stain resistant. Excellent for kitchen use.' },
    { metro: 'Boston', material_type: 'granite',   stone_name: 'Bianco Romano',       color: 'White/Grey',   length: 54, width: 78, thickness: '3cm', description: 'Light background with grey and burgundy speckles. Classic look, great condition. Heavy — call ahead for pickup.' },
    { metro: 'Boston', material_type: 'marble',    stone_name: 'Statuario',           color: 'White/Grey',   length: 30, width: 60, thickness: '3cm', description: 'High-end Italian marble with dramatic grey veining. One small corner chip, priced accordingly. Ideal for a statement vanity.' },
    { metro: 'Boston', material_type: 'quartzite', stone_name: 'Sea Pearl',           color: 'Cream/Green',  length: 42, width: 54, thickness: '3cm', description: 'Soft green and cream movement. Natural quartzite, very durable. Would make a beautiful kitchen island or bathroom top.' },
    { metro: 'Boston', material_type: 'granite',   stone_name: 'Santa Cecilia',       color: 'Gold/Brown',   length: 48, width: 84, thickness: '3cm', description: 'Gold background with dark brown and burgundy spots. Very popular, consistent demand. Great condition.' },
    { metro: 'Boston', material_type: 'marble',    stone_name: 'Nero Marquina',       color: 'Black/White',  length: 24, width: 48, thickness: '2cm', description: 'Striking black marble with crisp white veining. Polished finish. Perfect for a powder room vanity or decorative shelf.' },
    { metro: 'Boston', material_type: 'quartzite', stone_name: 'Fantasy Brown',       color: 'Brown/Beige',  length: 36, width: 66, thickness: '3cm', description: 'Warm brown and cream flowing movement. Classified as quartzite but sometimes sold as marble. No chips, clean cut edges.' },

    // ── WORCESTER (10) ──────────────────────────────────────────────────────
    { metro: 'Worcester', material_type: 'granite',   stone_name: 'Baltic Brown',     color: 'Brown/Black',  length: 36, width: 54, thickness: '3cm', description: 'Dark brown with large black and silver crystals. Great condition. Works well for a kitchen island or bathroom vanity.' },
    { metro: 'Worcester', material_type: 'granite',   stone_name: 'Giallo Ornamental', color: 'Gold/White',  length: 48, width: 72, thickness: '3cm', description: 'Popular light gold background with dark veining. Polished. Enough for a small kitchen countertop.' },
    { metro: 'Worcester', material_type: 'marble',    stone_name: 'Crema Marfil',     color: 'Cream/Beige',  length: 24, width: 54, thickness: '2cm', description: 'Warm cream Italian marble. Minor veining, very clean look. Excellent for bathroom applications.' },
    { metro: 'Worcester', material_type: 'granite',   stone_name: 'White Ice',        color: 'White/Grey',   length: 42, width: 60, thickness: '3cm', description: 'Bright white with subtle grey and silver speckle. Very clean, consistent pattern. Great for modern kitchens.' },
    { metro: 'Worcester', material_type: 'granite',   stone_name: 'Tiger Skin White', color: 'White/Black',  length: 30, width: 48, thickness: '3cm', description: 'Bold black and white streaking. Eye-catching piece. Would make a dramatic island top or fireplace surround.' },
    { metro: 'Worcester', material_type: 'granite',   stone_name: 'Alaska White',     color: 'White/Grey',   length: 54, width: 72, thickness: '3cm', description: 'Consistent white and grey speckle. Very versatile. One of our most popular remnants. Pickup available weekdays.' },
    { metro: 'Worcester', material_type: 'granite',   stone_name: 'Absolute Black',   color: 'Black',        length: 36, width: 72, thickness: '3cm', description: 'Pure jet black granite, honed finish. Very sleek, modern look. No visible inclusions. Great for a waterfall island edge.' },
    { metro: 'Worcester', material_type: 'quartzite', stone_name: 'Fusion Mist',      color: 'Grey/White',   length: 48, width: 60, thickness: '3cm', description: 'Soft grey and white layering. Natural quartzite with excellent durability. Ideal for a busy kitchen countertop.' },
    { metro: 'Worcester', material_type: 'granite',   stone_name: 'Colonial White',   color: 'White/Gold',   length: 24, width: 48, thickness: '3cm', description: 'Light background with gold and burgundy accents. Classic choice. Small piece ideal for bathroom vanity.' },
    { metro: 'Worcester', material_type: 'granite',   stone_name: 'Verde Butterfly',  color: 'Green/Brown',  length: 30, width: 54, thickness: '3cm', description: 'Unique green with butterfly pattern. Great for accent countertops, bar tops, or outdoor kitchens.' },

    // ── SOUTH SHORE (10) ────────────────────────────────────────────────────
    { metro: 'South Shore', material_type: 'quartzite', stone_name: 'White Macaubas',    color: 'White/Blue',   length: 48, width: 72, thickness: '3cm', description: 'White background with soft blue-grey movement. Premium quartzite from Brazil. Great condition, ready to go.' },
    { metro: 'South Shore', material_type: 'granite',   stone_name: 'Venetian Ice',      color: 'White/Grey',   length: 36, width: 60, thickness: '3cm', description: 'Light and airy with soft grey and gold movement. Very elegant look. Enough for a bathroom vanity or small island.' },
    { metro: 'South Shore', material_type: 'granite',   stone_name: 'Tan Brown',         color: 'Brown/Black',  length: 42, width: 66, thickness: '3cm', description: 'Deep brown background with large black and silver crystals. Bold, dramatic look. Popular for dark kitchen designs.' },
    { metro: 'South Shore', material_type: 'granite',   stone_name: 'Cashmere White',    color: 'White/Gold',   length: 30, width: 54, thickness: '3cm', description: 'Soft white with warm gold and grey speckle. Versatile and timeless. Great condition, just cleared from the shop floor.' },
    { metro: 'South Shore', material_type: 'granite',   stone_name: 'Ivory Fantasy',     color: 'Ivory/Brown',  length: 54, width: 84, thickness: '3cm', description: 'Warm ivory background with soft brown and grey veining. Large piece. Could do a full small bathroom or large island.' },
    { metro: 'South Shore', material_type: 'marble',    stone_name: 'Carrara White',     color: 'White/Grey',   length: 24, width: 48, thickness: '2cm', description: 'Classic Italian Carrara. Light grey veining. Perfect for a powder room vanity or decorative shelf.' },
    { metro: 'South Shore', material_type: 'granite',   stone_name: 'Black Pearl',       color: 'Black/Silver', length: 36, width: 72, thickness: '3cm', description: 'Near-black background with shimmering silver flecks. Leathered finish. Dramatic and unique.' },
    { metro: 'South Shore', material_type: 'quartzite', stone_name: 'Blue Sodalite',     color: 'Blue/White',   length: 42, width: 60, thickness: '3cm', description: 'Rare blue sodalite quartzite. Collector piece. Deep blue with white and gold veining. One-of-a-kind.' },
    { metro: 'South Shore', material_type: 'granite',   stone_name: 'Crema Bordeaux',    color: 'Cream/Burgundy', length: 48, width: 78, thickness: '3cm', description: 'Warm cream with burgundy and gold accents. Very popular in traditional-style kitchens. Excellent condition.' },
    { metro: 'South Shore', material_type: 'granite',   stone_name: 'Giallo Veneziano',  color: 'Gold/Brown',   length: 30, width: 60, thickness: '3cm', description: 'Deep gold background with black and brown veining. Rich, warm look. Great for a kitchen island or bathroom.' },

    // ── SPRINGFIELD (8) ─────────────────────────────────────────────────────
    { metro: 'Springfield', material_type: 'granite',   stone_name: 'Silver Cloud',      color: 'Grey/White',   length: 36, width: 54, thickness: '3cm', description: 'Soft grey and white background with subtle silver speckle. Clean, modern look. Pickup at our Springfield shop.' },
    { metro: 'Springfield', material_type: 'granite',   stone_name: 'Labrador Antique',  color: 'Black/Blue',   length: 48, width: 60, thickness: '3cm', description: 'Dark background with striking blue labradorescence. Makes a dramatic statement on any countertop.' },
    { metro: 'Springfield', material_type: 'granite',   stone_name: 'Giallo Fiorito',    color: 'Gold/Brown',   length: 42, width: 72, thickness: '3cm', description: 'Bright gold with floral-like brown and black veining. Beautiful, distinctive piece. Good for accent areas.' },
    { metro: 'Springfield', material_type: 'granite',   stone_name: 'White Spring',      color: 'White/Grey',   length: 54, width: 78, thickness: '3cm', description: 'Light white background with subtle grey and gold movement. Consistent pattern. One of our fastest-moving remnants.' },
    { metro: 'Springfield', material_type: 'quartzite', stone_name: 'Andes Dream',       color: 'Grey/White',   length: 30, width: 48, thickness: '3cm', description: 'Soft grey and white flowing movement. Natural quartzite. More durable than marble, easier to maintain.' },
    { metro: 'Springfield', material_type: 'granite',   stone_name: 'Titanium',          color: 'Grey/Silver',  length: 36, width: 66, thickness: '3cm', description: 'Modern grey with silver and white movement. Leathered finish available. Contemporary look, very popular right now.' },
    { metro: 'Springfield', material_type: 'quartzite', stone_name: 'Mountain White',    color: 'White/Grey',   length: 24, width: 54, thickness: '3cm', description: 'Crisp white quartzite with fine grey veining. Very clean, almost marble-like appearance but much more durable.' },
    { metro: 'Springfield', material_type: 'granite',   stone_name: 'Soapstone',         color: 'Dark Grey',    length: 48, width: 72, thickness: '3cm', description: 'Authentic soapstone, dark charcoal grey. Matte finish. Great for traditional farmhouse kitchens. Very rare piece.' },

    // ── OTHERS — North Shore / Cape / MetroWest (7) ─────────────────────────
    { metro: 'Others', material_type: 'granite',   stone_name: 'River White',         color: 'White/Grey',   length: 36, width: 60, thickness: '3cm', description: 'White background with grey and burgundy river-like veining. Elegant and timeless. Clean cut edges, no chips.' },
    { metro: 'Others', material_type: 'marble',    stone_name: 'Calacatta Classique', color: 'White/Gold',   length: 42, width: 66, thickness: '3cm', description: 'Dramatic gold veining on bright white background. Premium Italian marble. Would make a showstopping bathroom vanity.' },
    { metro: 'Others', material_type: 'granite',   stone_name: 'Juparana Gold',       color: 'Gold/Brown',   length: 48, width: 72, thickness: '3cm', description: 'Swirling gold, brown, and black movement. No two pieces alike. Great for a kitchen island centerpiece.' },
    { metro: 'Others', material_type: 'granite',   stone_name: 'Persa Pearl',         color: 'Cream/Brown',  length: 30, width: 54, thickness: '3cm', description: 'Cream base with scattered burgundy and black speckle. Subtle and warm. Good for bathrooms or laundry rooms.' },
    { metro: 'Others', material_type: 'granite',   stone_name: 'Crema Pearl',         color: 'Cream/Brown',  length: 54, width: 84, thickness: '3cm', description: 'Light cream with subtle brown and gold speckle. Large piece — good for a full kitchen countertop run.' },
    { metro: 'Others', material_type: 'granite',   stone_name: 'Antique Brown',       color: 'Brown/Gold',   length: 36, width: 48, thickness: '3cm', description: 'Rich brown background with gold and black movement. Warm, inviting look. Good for a kitchen island or bar top.' },
    { metro: 'Others', material_type: 'granite',   stone_name: 'Verde Peacock',       color: 'Green/Gold',   length: 42, width: 60, thickness: '3cm', description: 'Deep forest green with gold and black veining. Unique color, not often available. Great for an accent piece.' },
];

async function main() {
    await initSchema();

    const maState = await get(`SELECT * FROM states WHERE abbreviation = 'MA'`);
    if (!maState) { console.error('MA state not found in DB'); process.exit(1); }

    const metros = await query(`SELECT * FROM metros WHERE state_id = ?`, [maState.id]);
    const metroMap = Object.fromEntries(metros.map(m => [m.name, m]));

    // Remove existing seeded listings if --force passed
    if (process.argv.includes('--force')) {
        const seeded = await query(`SELECT id FROM listings WHERE is_seeded = 1`);
        for (const l of seeded) {
            await run(`DELETE FROM listing_photos WHERE listing_id = ?`, [l.id]);
        }
        await run(`DELETE FROM listings WHERE is_seeded = 1`);
        await run(`DELETE FROM users WHERE email = ?`, [SEED_EMAIL]);
        console.log('Cleared existing seeded listings and seed user.');
    }

    // Check if already seeded
    const existing = await get(`SELECT count(*) as cnt FROM listings WHERE is_seeded = 1`);
    if (Number(existing.cnt) > 0) {
        console.log(`Already have ${existing.cnt} seeded listings. Run with --force to re-seed.`);
        process.exit(0);
    }

    // Create seed user
    let seedUser = await get(`SELECT * FROM users WHERE email = ?`, [SEED_EMAIL]);
    if (!seedUser) {
        const id = uuidv4();
        const passwordHash = await bcrypt.hash(uuidv4(), 10); // random unguessable password
        await run(
            `INSERT INTO users (id, name, business_name, email, password_hash, phone, role, email_verified, approved, plan)
             VALUES (?, ?, ?, ?, ?, ?, 'fabricator', 1, 1, 'paid')`,
            [id, 'Demo Account', 'Northeast Stone Works', SEED_EMAIL, passwordHash, '6175550100']
        );
        seedUser = await get(`SELECT * FROM users WHERE id = ?`, [id]);
        console.log('Created seed user:', seedUser.id);
    }

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 2);
    const expiresStr = expiresAt.toISOString().replace('T', ' ').slice(0, 19);

    let count = 0;
    for (const l of LISTINGS) {
        const metro = metroMap[l.metro] || metros[metros.length - 1];
        const id = uuidv4();
        await run(
            `INSERT INTO listings
                (id, user_id, material_type, color, stone_name, shape, length, width, thickness,
                 state_id, metro_id, description, status, expires_at, is_seeded)
             VALUES (?, ?, ?, ?, ?, 'rectangular', ?, ?, ?, ?, ?, ?, 'active', ?, 1)`,
            [id, seedUser.id, l.material_type, l.color, l.stone_name,
             l.length, l.width, l.thickness,
             maState.id, metro.id, l.description, expiresStr]
        );
        count++;
        console.log(`  [${count}/50] ${l.stone_name} ${l.length}"×${l.width}" — ${l.metro}`);
    }

    console.log(`\nDone! Created ${count} seeded listings under "${seedUser.business_name}" (${SEED_EMAIL})`);
    console.log('To remove all seeded listings later, use the admin panel or run: node seed-listings.js --force --remove-only');
    process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
