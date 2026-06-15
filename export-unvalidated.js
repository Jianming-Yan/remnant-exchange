// Export lead emails that have NOT been validated yet, so you only pay to
// validate NEW addresses. George keeps adding lists; this skips everything
// already checked in a prior run.
//
// Usage:  node export-unvalidated.js [output.csv]
//         (default output file: to-validate.csv)
//
// Then upload the file to your validation service (ZeroBounce / NeverBounce /
// Bouncer). When it finishes, run:
//     node apply-validation.js to-validate.csv invalid.txt
// to stamp them validated and suppress the bad ones.

if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const fs = require('fs');
const { query } = require('./database/db');

async function main() {
    const out = process.argv[2] || 'to-validate.csv';

    // Only addresses we've never validated and that are still mailable.
    const leads = await query(
        `SELECT email FROM fabricator_leads
         WHERE validated_at IS NULL AND bounced = 0 AND unsubscribed = 0 AND registered = 0`
    );

    const emails = leads.map(l => l.email).filter(Boolean);
    fs.writeFileSync(out, emails.length ? emails.join('\n') + '\n' : '');

    console.log(`Wrote ${emails.length} un-validated address(es) to ${out}.`);
    if (!emails.length) console.log('Nothing new to validate — you are caught up.');
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
