/**
 * build-george-guessed-phone.js
 *
 * Export the UN-BROADCAST GUESSED-email leads (email_guessed=1, mailable, and
 * never sent — last_sent_at IS NULL) for George to work by PHONE. Guessed
 * addresses that were already broadcast and did NOT bounce are proven good and
 * stay in the email sequence, so they are deliberately excluded here.
 * These info@/contact@ guesses bounce ~17% by email but a call never bounces.
 * Each has a WEBSITE (the guess came from their domain), so George can also
 * check the site's contact page for the real email.
 *
 * One tab per state (George's workflow), with street address pulled from the
 * per-source brand files, the guessed email for reference, and blank columns for
 * the real email + call outcome.
 *
 * Writes: public/george-guessed-phone.xlsx
 * Usage:  node build-george-guessed-phone.js
 */

require('dotenv').config();
const fs = require('fs');
const ExcelJS = require('exceljs');
const { query } = require('./database/db');

const normPhone = p => (p || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
const parse = l => { const o = []; let s = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { o.push(s); s = ''; } else s += ch; } o.push(s); return o; };
function loadAddresses() {
    const map = {};
    for (const f of fs.readdirSync('public')) {
        if (!/^fabricator-leads-[A-Z]{2}-(msi|cambria|caesarstone|corian)\.csv$/.test(f)) continue;
        const lines = fs.readFileSync('public/' + f, 'utf8').split(/\r?\n/).filter(Boolean);
        const H = parse(lines[0]); const pi = H.indexOf('Phone'), ai = H.indexOf('Address');
        if (pi < 0 || ai < 0) continue;
        for (const l of lines.slice(1)) { const c = parse(l); const p = normPhone(c[pi]); if (p && c[ai] && !map[p]) map[p] = c[ai]; }
    }
    return map;
}

const COLS = ['#', 'Business Name', 'Address', 'City', 'Phone', 'Website', 'Guessed Email (verify)', 'Real Email (fill in)', 'Call Outcome', 'Notes'];
const STATUS = ['Not Called', 'Left Voicemail', 'No Answer', 'Got Email', 'Interested', 'Registered', 'Not Interested'];

(async () => {
    const addr = loadAddresses();
    const leads = await query(`SELECT business_name, email, phone, city, UPPER(TRIM(state)) st, website
        FROM fabricator_leads WHERE email_guessed = 1 AND last_sent_at IS NULL AND bounced = 0 AND unsubscribed = 0 AND registered = 0`);
    const byState = {};
    for (const l of leads) (byState[l.st] = byState[l.st] || []).push(l);

    const wb = new ExcelJS.Workbook();
    for (const st of Object.keys(byState).sort()) {
        const ws = wb.addWorksheet(st);
        ws.columns = COLS.map(h => ({ header: h, key: h,
            width: h === 'Business Name' ? 30 : h === 'Address' ? 32 : h === 'Website' || h === 'Guessed Email (verify)' || h === 'Real Email (fill in)' ? 28 : h === '#' ? 5 : 14 }));
        ws.getRow(1).eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; });
        byState[st].sort((a, b) => (a.city || '').localeCompare(b.city) || (a.business_name || '').localeCompare(b.business_name));
        byState[st].forEach((l, i) => {
            const row = ws.addRow([i + 1, l.business_name, addr[normPhone(l.phone)] || '', l.city, l.phone, l.website, l.email, '', 'Not Called', '']);
            row.getCell(5).numFmt = '@';
            row.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }; // yellow real-email
            row.getCell(9).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${STATUS.join(',')}"`], showDropDown: false };
        });
        ws.views = [{ state: 'frozen', ySplit: 1 }];
    }
    await wb.xlsx.writeFile('public/george-guessed-phone.xlsx');

    console.log('George guessed-email phone worksheet built.');
    console.log('  leads:', leads.length, '| states:', Object.keys(byState).length, '| with website:', leads.filter(l => l.website).length, '| with address:', leads.filter(l => addr[normPhone(l.phone)]).length);
    console.log('  by state:', Object.entries(byState).map(([s, r]) => `${s}:${r.length}`).sort().join('  '));
    console.log('  saved: public/george-guessed-phone.xlsx');
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
