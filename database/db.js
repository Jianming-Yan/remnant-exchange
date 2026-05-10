const { createClient } = require('@libsql/client');
const { v4: uuidv4 } = require('uuid');

let client;

function getDb() {
    if (!client) {
        client = createClient({
            url: process.env.TURSO_DATABASE_URL,
            authToken: process.env.TURSO_AUTH_TOKEN,
        });
    }
    return client;
}

async function query(sql, params = []) {
    const db = getDb();
    const result = await db.execute({ sql, args: params });
    return result.rows.map(row =>
        Object.fromEntries(result.columns.map((col, i) => [col, row[i]]))
    );
}

async function run(sql, params = []) {
    const db = getDb();
    await db.execute({ sql, args: params });
}

async function get(sql, params = []) {
    const rows = await query(sql, params);
    return rows[0] || null;
}

async function initSchema() {
    await run(`CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        business_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        phone TEXT,
        role TEXT NOT NULL DEFAULT 'fabricator',
        email_verified INTEGER NOT NULL DEFAULT 0,
        approved INTEGER NOT NULL DEFAULT 0,
        plan TEXT NOT NULL DEFAULT 'free',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);

    await run(`CREATE TABLE IF NOT EXISTS email_tokens (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token TEXT NOT NULL,
        type TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS states (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        abbreviation TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1
    )`);

    await run(`CREATE TABLE IF NOT EXISTS metros (
        id TEXT PRIMARY KEY,
        state_id TEXT NOT NULL,
        name TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (state_id) REFERENCES states(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        material_type TEXT NOT NULL,
        color TEXT,
        stone_name TEXT,
        shape TEXT NOT NULL DEFAULT 'rectangular',
        length REAL NOT NULL,
        width REAL NOT NULL,
        thickness TEXT NOT NULL,
        length2 REAL,
        width2 REAL,
        vendor_name TEXT,
        bundle_number TEXT,
        state_id TEXT NOT NULL,
        metro_id TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (state_id) REFERENCES states(id),
        FOREIGN KEY (metro_id) REFERENCES metros(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS listing_photos (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        display_order INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (listing_id) REFERENCES listings(id)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS plan_settings (
        plan TEXT PRIMARY KEY,
        max_posts INTEGER NOT NULL,
        duration_days INTEGER NOT NULL
    )`);

    const planCount = await get(`SELECT count(*) as cnt FROM plan_settings`);
    if (Number(planCount.cnt) === 0) {
        await run(`INSERT INTO plan_settings VALUES ('free', 5, 90)`);
        await run(`INSERT INTO plan_settings VALUES ('paid', 50, 730)`);
    }

    await seedStates();
}

async function seedStates() {
    const stateCount = await get(`SELECT count(*) as cnt FROM states`);
    if (Number(stateCount.cnt) > 0) return;

    const states = [
        ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
        ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
        ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
        ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
        ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
        ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
        ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
        ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
        ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
        ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
    ];

    const defaultMetros = {
        MA: ['Boston', 'Worcester', 'Springfield', 'South Shore', 'Others'],
        NY: ['New York City', 'Buffalo', 'Rochester', 'Albany', 'Others'],
        CA: ['Los Angeles', 'San Francisco', 'San Diego', 'Sacramento', 'Others'],
        TX: ['Houston', 'Dallas', 'Austin', 'San Antonio', 'Others'],
        FL: ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Others'],
        IL: ['Chicago', 'Rockford', 'Springfield', 'Peoria', 'Others'],
        PA: ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Others'],
        OH: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Others'],
        GA: ['Atlanta', 'Savannah', 'Augusta', 'Columbus', 'Others'],
        NC: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Others'],
    };

    for (const [abbr, name] of states) {
        const stateId = uuidv4();
        await run(`INSERT INTO states (id, name, abbreviation) VALUES (?, ?, ?)`, [stateId, name, abbr]);
        const metros = defaultMetros[abbr] || ['Metro Area', 'Others'];
        for (const metro of metros) {
            await run(`INSERT INTO metros (id, state_id, name) VALUES (?, ?, ?)`, [uuidv4(), stateId, metro]);
        }
    }
}

module.exports = { getDb, query, run, get, initSchema };
