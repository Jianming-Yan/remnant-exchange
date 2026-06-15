// Apply a validation run back to the database.
//
// Usage:  node apply-validation.js <exported-file> [invalid-file]
//
//   <exported-file>  The file you uploaded to the validation service — the one
//                    export-unvalidated.js produced. EVERY address in it is
//                    stamped validated_at = now, so it is never re-validated
//                    (and never re-charged) again.
//
//   [invalid-file]   The "invalid / undeliverable" list the service returns.
//                    Every address in it is marked bounced = 1 so broadcasts
//                    skip it. Omit if the run found nothing bad.
//
// Both files may be plain (one email per line) or CSV (email in first column).
// Addresses already marked bounced (e.g. by the Resend webhook) are never
// un-suppressed, even if a validator calls them valid.

if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const fs = require('fs');
const { run, get } = require('./database/db');

function readEmails(file) {
    return fs.readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map(line => line.split(',')[0].trim().replace(/^"|"$/g, '').toLowerCase())
        .filter(e => e && e.includes('@'));
}

async function main() {
    const exportedFile = process.argv[2];
    const invalidFile = process.argv[3];
    if (!exportedFile) {
        console.error('Usage: node apply-validation.js <exported-file> [invalid-file]');
        process.exit(1);
    }

    const exported = readEmails(exportedFile);
    const invalid = new Set(invalidFile ? readEmails(invalidFile) : []);

    let validated = 0, bounced = 0, missing = 0;
    for (const email of exported) {
        const lead = await get(`SELECT id FROM fabricator_leads WHERE lower(email) = ?`, [email]);
        if (!lead) { missing++; continue; }

        if (invalid.has(email)) {
            await run(`UPDATE fabricator_leads SET validated_at = datetime('now'), bounced = 1 WHERE id = ?`, [lead.id]);
            bounced++;
        } else {
            // Stamp validated, but never clear an existing bounce flag.
            await run(`UPDATE fabricator_leads SET validated_at = datetime('now') WHERE id = ?`, [lead.id]);
        }
        validated++;
    }

    console.log(`Validated ${validated} lead(s); marked ${bounced} as bounced; ${missing} not found in fabricator_leads.`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
