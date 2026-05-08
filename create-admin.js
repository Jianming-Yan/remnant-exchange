require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb, run, get } = require('./database/db');

async function createAdmin() {
    await getDb();

    const email = process.argv[2] || 'admin@remnantexchange.com';
    const password = process.argv[3] || 'Admin1234!';

    const existing = get(`SELECT id FROM users WHERE email = ?`, [email]);
    if (existing) {
        run(`UPDATE users SET role = 'admin', email_verified = 1, approved = 1 WHERE email = ?`, [email]);
        console.log(`Admin role set for ${email}`);
        return;
    }

    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    run(`INSERT INTO users (id, name, business_name, email, password_hash, role, email_verified, approved)
         VALUES (?, ?, ?, ?, ?, 'admin', 1, 1)`,
        [id, 'Admin', 'Remnant Exchange', email, hash]);

    console.log(`Admin created: ${email} / ${password}`);
    process.exit(0);
}

createAdmin().catch(console.error);
