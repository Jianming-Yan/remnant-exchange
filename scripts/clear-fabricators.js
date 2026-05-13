require('dotenv').config();
const { query, run, get } = require('../database/db');

async function clearFabricators() {
    const all = await query(`SELECT id, email, role FROM users`);
    console.log('All users in DB:', all);

    const users = await query(`SELECT id FROM users WHERE role != 'admin'`);
    console.log(`Found ${users.length} non-admin user(s) to delete.`);

    for (const u of users) {
        const listings = await query(`SELECT id FROM listings WHERE user_id = ?`, [u.id]);
        for (const l of listings) {
            await run(`DELETE FROM listing_photos WHERE listing_id = ?`, [l.id]);
        }
        await run(`DELETE FROM listings WHERE user_id = ?`, [u.id]);
        await run(`DELETE FROM email_tokens WHERE user_id = ?`, [u.id]);
        await run(`DELETE FROM users WHERE id = ?`, [u.id]);
        console.log(`Deleted user ${u.id}`);
    }

    console.log('Done. All fabricator users and their data removed.');
    process.exit(0);
}

clearFabricators().catch(err => { console.error(err); process.exit(1); });
