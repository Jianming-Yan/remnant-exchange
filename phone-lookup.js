/**
 * phone-lookup.js
 *
 * Reads all contractor lead CSV files, checks each phone number via Twilio Lookup,
 * and splits them into two xlsx files: mobile (SMS-able) and landline.
 *
 * Usage: node phone-lookup.js
 *
 * Requires: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env
 * Cost: ~$0.005 per number (~$3-4 for 740 leads)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ExcelJS = require('exceljs');

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

if (!ACCOUNT_SID || !AUTH_TOKEN || ACCOUNT_SID === 'your_account_sid_here') {
    console.error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN in .env');
    console.error('Sign up at twilio.com, go to Console > Account Info to get your credentials.');
    process.exit(1);
}

const CACHE_FILE = 'public/phone-lookup-cache.json';
const BATCH_SIZE = 10;
const DELAY_MS = 200;

// -------- Phone normalization --------

function normalizePhone(raw) {
    if (!raw) return null;
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
    if (digits.length > 11) return null; // international, skip
    return null;
}

// -------- Twilio Lookup --------

async function lookupPhone(e164) {
    try {
        const res = await axios.get(
            `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}`,
            {
                params: { Fields: 'line_type_intelligence' },
                auth: { username: ACCOUNT_SID, password: AUTH_TOKEN },
                timeout: 10000,
            }
        );
        const lineType = res.data?.line_type_intelligence?.type || 'unknown';
        return lineType; // 'mobile', 'landline', 'voip', 'nonFixedVoip', 'tollFree', etc.
    } catch (err) {
        if (err.response?.status === 404) return 'invalid';
        console.error(`  Lookup error for ${e164}:`, err.response?.data?.message || err.message);
        return 'error';
    }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// -------- Read all contractor CSVs --------

function readContractorCsvs() {
    const files = fs.readdirSync('public').filter(f => f.includes('contractor') && f.endsWith('.csv'));
    const rows = [];
    const seen = new Set();

    for (const file of files) {
        const content = fs.readFileSync(path.join('public', file), 'utf8');
        const lines = content.split('\n');
        if (lines.length < 2) continue;

        const header = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
        const phoneIdx = header.findIndex(h => h.toLowerCase() === 'phone');
        const nameIdx = header.findIndex(h => h.toLowerCase() === 'business name');
        const cityIdx = header.findIndex(h => h.toLowerCase() === 'city');
        const emailIdx = header.findIndex(h => h.toLowerCase() === 'email');
        const websiteIdx = header.findIndex(h => h.toLowerCase() === 'website');
        const stateCol = file.match(/leads-([A-Z]+)-contractor/)?.[1] || '';

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Parse CSV respecting quoted fields
            const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) || [];
            const clean = cols.map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());

            const phone = clean[phoneIdx] || '';
            const normalized = normalizePhone(phone);
            if (!normalized) continue;
            if (seen.has(normalized)) continue;
            seen.add(normalized);

            rows.push({
                business_name: clean[nameIdx] || '',
                city: clean[cityIdx] || '',
                state: stateCol,
                phone: normalized,
                email: clean[emailIdx] || '',
                website: clean[websiteIdx] || '',
                raw_phone: phone,
            });
        }
    }

    return rows;
}

// -------- Write xlsx --------

async function writeXlsx(rows, filename, sheetName) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Remnant Exchange';
    const ws = wb.addWorksheet(sheetName);

    ws.columns = [
        { header: 'Business Name', key: 'business_name', width: 36 },
        { header: 'City',          key: 'city',          width: 18 },
        { header: 'State',         key: 'state',         width: 8  },
        { header: 'Phone',         key: 'phone',         width: 18 },
        { header: 'Email',         key: 'email',         width: 32 },
        { header: 'Website',       key: 'website',       width: 30 },
        { header: 'Line Type',     key: 'line_type',     width: 14 },
        { header: 'Status',        key: 'status',        width: 18 },
        { header: 'Notes',         key: 'notes',         width: 36 },
    ];

    ws.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { vertical: 'middle' };
    });
    ws.getRow(1).height = 22;

    rows.forEach((r, i) => {
        const row = ws.addRow([r.business_name, r.city, r.state, r.phone, r.email, r.website, r.line_type, 'Not Contacted', '']);
        if (i % 2 === 0) {
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            });
        }
        // Green highlight for rows with email
        if (r.email) {
            row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        }
    });

    ws.views = [{ state: 'frozen', ySplit: 1 }];
    await wb.xlsx.writeFile(path.join('public', filename));
}

// -------- Main --------

async function main() {
    console.log('\nReading contractor CSV files...');
    const rows = readContractorCsvs();
    console.log(`Found ${rows.length} unique phone numbers across all contractor files\n`);

    // Load cache
    let cache = {};
    if (fs.existsSync(CACHE_FILE)) {
        cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        const cached = Object.keys(cache).length;
        console.log(`Loaded ${cached} cached lookups — skipping those\n`);
    }

    // Look up uncached numbers
    const uncached = rows.filter(r => !cache[r.phone]);
    const estimatedCost = (uncached.length * 0.005).toFixed(2);
    console.log(`Numbers to look up: ${uncached.length} (~$${estimatedCost})`);
    console.log('Starting lookups...\n');

    for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
        const batch = uncached.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async r => {
            cache[r.phone] = await lookupPhone(r.phone);
        }));
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
        const done = Math.min(i + BATCH_SIZE, uncached.length);
        const mobile = Object.values(cache).filter(v => v === 'mobile').length;
        process.stdout.write(`\r  Checked ${done}/${uncached.length} — mobile so far: ${mobile}`);
        await sleep(DELAY_MS);
    }
    console.log('\n');

    // Attach line types to rows
    rows.forEach(r => { r.line_type = cache[r.phone] || 'unknown'; });

    // Split
    const sms      = rows.filter(r => ['mobile', 'voip', 'nonFixedVoip'].includes(r.line_type));
    const landline = rows.filter(r => ['landline', 'tollFree'].includes(r.line_type));
    const other    = rows.filter(r => !['mobile', 'voip', 'nonFixedVoip', 'landline', 'tollFree'].includes(r.line_type));

    console.log(`Results:`);
    console.log(`  SMS-able (mobile + VoIP): ${sms.length}`);
    console.log(`  Landline:                 ${landline.length}`);
    console.log(`  Unknown/Invalid:          ${other.length}`);
    console.log('');

    await writeXlsx(sms,      'contractor-sms.xlsx',      'SMS Contractors');
    await writeXlsx(landline, 'contractor-landline.xlsx', 'Landline Contractors');

    console.log('Saved:');
    console.log('  public/contractor-sms.xlsx      ← upload this to SimpleTexting');
    console.log('  public/contractor-landline.xlsx ← call list for George');
    console.log('\nDone.');
}

main().catch(console.error);
