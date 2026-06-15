// Apply a list-validation result to the database.
//
// Usage:  node mark-bounced.js invalid-emails.txt
//
// Reads a file of email addresses (one per line, OR a CSV with the email in the
// first column) and marks every matching fabricator_lead as bounced = 1 so the
// daily/admin broadcasts skip them. Run this with the "invalid" / "undeliverable"
// export from a validation service (ZeroBounce, NeverBounce, Bouncer, etc.) to
// clean out the dead scraped addresses that are hurting your sender reputation.
//
// The webhook in server.js handles FUTURE bounces automatically; this script is
// for cleaning the EXISTING dirty list in one pass.

if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const fs = require('fs');
const { run, get } = require('./database/db');

async function main() {
    const file = process.argv[2];
    if (!file) {
        console.error('Usage: node mark-bounced.js <file-of-emails>');
        process.exit(1);
    }

    const raw = fs.readFileSync(file, 'utf8');
    const emails = raw
        .split(/\r?\n/)
        .map(line => line.split(',')[0].trim().replace(/^"|"$/g, '').toLowerCase())
        .filter(e => e && e.includes('@'));

    if (!emails.length) {
        console.error('No email addresses found in', file);
        process.exit(1);
    }

    let marked = 0, missing = 0;
    for (const email of emails) {
        const lead = await get(`SELECT id, bounced FROM fabricator_leads WHERE lower(email) = ?`, [email]);
        if (lead) {
            if (Number(lead.bounced) !== 1) {
                await run(`UPDATE fabricator_leads SET bounced = 1 WHERE id = ?`, [lead.id]);
                marked++;
            }
        } else {
            missing++;
        }
    }

    console.log(`Done. Marked ${marked} lead(s) as bounced; ${missing} address(es) not found in fabricator_leads (already removed or never imported).`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
