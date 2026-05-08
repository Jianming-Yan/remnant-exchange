const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, 'remnant.db');

let db;

async function getDb() {
    if (db) return db;

    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        db = new SQL.Database(fileBuffer);
    } else {
        db = new SQL.Database();
    }

    initSchema();
    save();

    return db;
}

function save() {
    if (!db) return;
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function query(sql, params = []) {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

function run(sql, params = []) {
    db.run(sql, params);
    save();
}

function get(sql, params = []) {
    const rows = query(sql, params);
    return rows[0] || null;
}

function initSchema() {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
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
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS email_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            token TEXT NOT NULL,
            type TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS states (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            abbreviation TEXT NOT NULL UNIQUE,
            active INTEGER NOT NULL DEFAULT 1
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS metros (
            id TEXT PRIMARY KEY,
            state_id TEXT NOT NULL,
            name TEXT NOT NULL,
            active INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (state_id) REFERENCES states(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS listings (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            material_type TEXT NOT NULL,
            color TEXT NOT NULL,
            length REAL NOT NULL,
            width REAL NOT NULL,
            thickness TEXT NOT NULL,
            state_id TEXT NOT NULL,
            metro_id TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (state_id) REFERENCES states(id),
            FOREIGN KEY (metro_id) REFERENCES metros(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS listing_photos (
            id TEXT PRIMARY KEY,
            listing_id TEXT NOT NULL,
            filename TEXT NOT NULL,
            display_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (listing_id) REFERENCES listings(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS plan_settings (
            plan TEXT PRIMARY KEY,
            max_posts INTEGER NOT NULL,
            duration_days INTEGER NOT NULL
        )
    `);

    const planCount = query(`SELECT count(*) as cnt FROM plan_settings`);
    if (planCount[0].cnt === 0) {
        db.run(`INSERT INTO plan_settings VALUES ('free', 5, 90)`);
        db.run(`INSERT INTO plan_settings VALUES ('paid', 50, 730)`);
    }

    seedStates();
}

function seedStates() {
    const stateCount = query(`SELECT count(*) as cnt FROM states`);
    if (stateCount[0].cnt > 0) return;

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
        db.run(`INSERT INTO states (id, name, abbreviation) VALUES (?, ?, ?)`, [stateId, name, abbr]);

        const metros = defaultMetros[abbr] || ['Metro Area', 'Others'];
        for (const metro of metros) {
            db.run(`INSERT INTO metros (id, state_id, name) VALUES (?, ?, ?)`, [uuidv4(), stateId, metro]);
        }
    }
}

module.exports = { getDb, query, run, get, save };
