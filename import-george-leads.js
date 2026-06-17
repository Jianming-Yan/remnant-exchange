// Load George's "Master List Outreach" workbook into fabricator_leads.
// Pulls each "<ST> Fabricators" tab, adds the State (from the tab name), and:
//   - inserts brand-new leads (same validation + dedupe as the admin importer)
//   - backfills the State column onto existing leads that George's sheet covers
//     but that are currently stateless (earlier imports didn't save state)
//
// Usage:
//   node import-george-leads.js "<path to .xlsx>"            (DRY RUN — counts only)
//   node import-george-leads.js "<path to .xlsx>" --commit   (actually write)

if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const XLSX = require('xlsx');
const { run, query } = require('./database/db');
const { v4: uuidv4 } = require('uuid');

const FILE = process.argv[2];
const COMMIT = process.argv.includes('--commit');

// Confirmed processed states that have a finished "<ST> Fabricators" tab.
// (ME has no tab; NJ is only "NJ WIP" — both intentionally excluded.)
const STATES = ['AL','AK','AZ','AR','CO','CT','GA','IA','MA','MD','MI','MN','MO','NC','NV','NY','OH'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function leadsFromTab(wb, tab) {
    const ws = wb.Sheets[tab];
    if (!ws) return null;
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const hi = aoa.findIndex(r => r.map(c => String(c).trim().toLowerCase()).includes('email'));
    if (hi < 0) return null;
    const headers = aoa[hi].map(c => String(c).trim());
    const idx = name => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());
    const ci = { bn: idx('Business Name'), cn: idx('Contact Name'), em: idx('Email'), ph: idx('Phone'), city: idx('City'), web: idx('Website'), rat: idx('Rating'), rev: idx('Reviews') };
    const out = [];
    for (let i = hi + 1; i < aoa.length; i++) {
        const r = aoa[i];
        out.push({
            businessName: String(r[ci.bn] ?? '').trim(),
            contactName: ci.cn >= 0 ? String(r[ci.cn] ?? '').trim() : '',
            email: String(r[ci.em] ?? '').trim().toLowerCase(),
            phone: ci.ph >= 0 ? String(r[ci.ph] ?? '').trim() : '',
            city: ci.city >= 0 ? String(r[ci.city] ?? '').trim() : '',
            website: ci.web >= 0 ? String(r[ci.web] ?? '').trim() : '',
            rating: ci.rat >= 0 ? (parseFloat(r[ci.rat]) || null) : null,
            reviews: ci.rev >= 0 ? (parseInt(r[ci.rev]) || null) : null,
        });
    }
    return out;
}

async function main() {
    if (!FILE) { console.error('Usage: node import-george-leads.js "<file.xlsx>" [--commit]'); process.exit(1); }
    const wb = XLSX.readFile(FILE);

    // Preload existing leads (email -> current state) and user emails.
    const existingState = new Map(
        (await query(`SELECT email, state FROM fabricator_leads`))
            .map(r => [String(r.email || '').toLowerCase(), String(r.state || '').trim()])
    );
    const existingUsers = new Set((await query(`SELECT email FROM users`)).map(r => String(r.email || '').toLowerCase()));

    let imported = 0, backfilled = 0, skipped = 0, duplicate = 0, registeredFlag = 0;
    const processed = new Set(); // emails handled this run (avoid double-processing across tabs)

    for (const st of STATES) {
        const tab = `${st} Fabricators`;
        const rows = leadsFromTab(wb, tab);
        if (!rows) { console.log(`!! missing/unreadable tab: ${tab}`); continue; }
        let stNew = 0, stFill = 0;
        for (const row of rows) {
            if (!row.email || !EMAIL_RE.test(row.email)) { skipped++; continue; }
            if (!row.businessName) { skipped++; continue; }
            if (processed.has(row.email)) { duplicate++; continue; }
            processed.add(row.email);

            if (existingState.has(row.email)) {
                duplicate++;
                if (!existingState.get(row.email)) { // stateless existing lead -> backfill state
                    if (COMMIT) await run(`UPDATE fabricator_leads SET state = ? WHERE email = ?`, [st, row.email]);
                    existingState.set(row.email, st);
                    backfilled++; stFill++;
                }
                continue;
            }

            const alreadyUser = existingUsers.has(row.email);
            if (alreadyUser) registeredFlag++;
            if (COMMIT) {
                await run(
                    `INSERT INTO fabricator_leads (id, business_name, contact_name, email, phone, city, state, website, rating, reviews, unsubscribe_token, registered) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
                    [uuidv4(), row.businessName, row.contactName || null, row.email, row.phone || null, row.city || null, st, row.website || null, row.rating, row.reviews, uuidv4(), alreadyUser ? 1 : 0]
                );
            }
            existingState.set(row.email, st);
            imported++; stNew++;
        }
        console.log(`${tab}: ${stNew} new, ${stFill} state-filled`);
    }

    console.log(`\n${COMMIT ? 'DONE' : 'DRY RUN — would write'}:`);
    console.log(`  new leads inserted: ${imported}`);
    console.log(`  existing leads given a state: ${backfilled}`);
    console.log(`  skipped (invalid/blank email or no business name): ${skipped}`);
    console.log(`  duplicate emails (already in DB / repeated in file): ${duplicate}`);
    console.log(`  new leads already having an account (flagged registered): ${registeredFlag}`);
    if (!COMMIT) console.log(`\nDRY RUN — nothing written. Re-run with --commit to apply.`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
