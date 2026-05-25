/**
 * outscraper-leads.js
 *
 * Pulls stone fabricator leads from Google Maps via Outscraper API.
 * Run: node outscraper-leads.js <state>
 * Example: node outscraper-leads.js CT
 *          node outscraper-leads.js RI
 *          node outscraper-leads.js MA
 *
 * Requires: OUTSCRAPER_API_KEY in .env
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const ExcelJS = require('exceljs');

const API_KEY = process.env.OUTSCRAPER_API_KEY;
if (!API_KEY) {
    console.error('Missing OUTSCRAPER_API_KEY in .env');
    process.exit(1);
}

const STATE = (process.argv[2] || '').toUpperCase();
const MODE = (process.argv[3] || 'fabricator').toLowerCase(); // 'fabricator' or 'contractor'

if (!STATE) {
    console.error('Usage: node outscraper-leads.js <state> [fabricator|contractor]');
    console.error('  e.g. node outscraper-leads.js CT');
    console.error('       node outscraper-leads.js CT contractor');
    process.exit(1);
}

const CONTRACTOR_QUERIES = {
    CT: [
        'kitchen remodeler Connecticut',
        'bathroom remodeler Connecticut',
        'general contractor Connecticut',
        'kitchen cabinet contractor Connecticut',
        'interior designer Connecticut',
        'home builder Connecticut',
    ],
    RI: [
        'kitchen remodeler Rhode Island',
        'bathroom remodeler Rhode Island',
        'general contractor Rhode Island',
        'interior designer Rhode Island',
        'home builder Rhode Island',
    ],
    MA: [
        'kitchen remodeler Massachusetts',
        'bathroom remodeler Massachusetts',
        'general contractor Massachusetts',
        'kitchen cabinet contractor Massachusetts',
        'interior designer Massachusetts',
        'home builder Massachusetts',
        'kitchen remodeler Boston',
        'kitchen remodeler Worcester Massachusetts',
    ],
    NH: [
        'kitchen remodeler New Hampshire',
        'bathroom remodeler New Hampshire',
        'general contractor New Hampshire',
    ],
    VT: [
        'kitchen remodeler Vermont',
        'general contractor Vermont',
    ],
    ME: [
        'kitchen remodeler Maine',
        'general contractor Maine',
    ],
    NY: [
        'kitchen remodeler New York City',
        'bathroom remodeler New York',
        'general contractor New York',
        'kitchen cabinet contractor New York',
        'interior designer Manhattan',
        'home builder Long Island',
    ],
    NJ: [
        'kitchen remodeler New Jersey',
        'bathroom remodeler New Jersey',
        'general contractor New Jersey',
        'interior designer New Jersey',
        'home builder New Jersey',
    ],
    PA: [
        'kitchen remodeler Pennsylvania',
        'bathroom remodeler Philadelphia',
        'general contractor Pittsburgh',
        'kitchen cabinet contractor Pennsylvania',
        'interior designer Pennsylvania',
    ],
    MD: [
        'kitchen remodeler Maryland',
        'bathroom remodeler Baltimore',
        'general contractor Maryland',
        'interior designer Maryland',
        'home builder Maryland',
    ],
    VA: [
        'kitchen remodeler Virginia',
        'bathroom remodeler Northern Virginia',
        'general contractor Virginia',
        'interior designer Virginia',
        'home builder Virginia',
    ],
    NC: [
        'kitchen remodeler North Carolina',
        'bathroom remodeler Charlotte',
        'general contractor North Carolina',
        'interior designer Raleigh',
        'home builder North Carolina',
    ],
};

// Search queries per state — multiple to maximize coverage
const FABRICATOR_QUERIES = {
    CT: [
        'granite countertop fabricator Connecticut',
        'marble granite countertop Connecticut',
        'stone countertop fabricator Connecticut',
        'quartz countertop fabricator Connecticut',
        'stone slab fabricator Connecticut',
    ],
    RI: [
        'granite countertop fabricator Rhode Island',
        'marble granite countertop Rhode Island',
        'stone countertop fabricator Rhode Island',
        'quartz countertop fabricator Rhode Island',
    ],
    MA: [
        'granite countertop fabricator Massachusetts',
        'marble granite countertop Massachusetts',
        'stone countertop fabricator Massachusetts',
        'quartz countertop fabricator Massachusetts',
        'stone slab fabricator Massachusetts',
        'granite fabricator Boston',
        'granite fabricator Worcester Massachusetts',
        'granite fabricator Springfield Massachusetts',
    ],
    NH: [
        'granite countertop fabricator New Hampshire',
        'marble granite countertop New Hampshire',
        'stone countertop fabricator New Hampshire',
    ],
    VT: [
        'granite countertop fabricator Vermont',
        'marble granite Vermont',
        'stone countertop fabricator Vermont',
    ],
    ME: [
        'granite countertop fabricator Maine',
        'stone countertop fabricator Maine',
        'marble granite Maine',
    ],
    NY: [
        'granite countertop fabricator New York City',
        'marble granite countertop New York',
        'stone countertop fabricator Long Island',
        'quartz countertop fabricator Brooklyn',
        'granite fabricator Buffalo New York',
        'granite fabricator Albany New York',
        'granite fabricator Rochester New York',
    ],
    NJ: [
        'granite countertop fabricator New Jersey',
        'marble granite countertop New Jersey',
        'stone countertop fabricator New Jersey',
        'quartz countertop fabricator New Jersey',
        'stone slab fabricator New Jersey',
    ],
    PA: [
        'granite countertop fabricator Pennsylvania',
        'marble granite countertop Philadelphia',
        'stone countertop fabricator Pittsburgh',
        'quartz countertop fabricator Pennsylvania',
        'granite fabricator Allentown Pennsylvania',
        'stone slab fabricator Pennsylvania',
    ],
    MD: [
        'granite countertop fabricator Maryland',
        'marble granite countertop Baltimore',
        'stone countertop fabricator Maryland',
        'quartz countertop fabricator Maryland',
        'granite fabricator Maryland',
    ],
    VA: [
        'granite countertop fabricator Virginia',
        'marble granite countertop Virginia',
        'stone countertop fabricator Northern Virginia',
        'quartz countertop fabricator Virginia',
        'granite fabricator Richmond Virginia',
        'stone slab fabricator Virginia',
    ],
    NC: [
        'granite countertop fabricator North Carolina',
        'marble granite countertop Charlotte',
        'stone countertop fabricator Raleigh',
        'quartz countertop fabricator North Carolina',
        'granite fabricator Greensboro North Carolina',
        'stone slab fabricator North Carolina',
    ],
};

const QUERIES = MODE === 'contractor' ? CONTRACTOR_QUERIES : FABRICATOR_QUERIES;
const queries = QUERIES[STATE];
if (!queries) {
    console.error(`No queries defined for state: ${STATE} (mode: ${MODE})`);
    console.error(`Supported states: ${Object.keys(QUERIES).join(', ')}`);
    process.exit(1);
}

const STATUS_OPTIONS = [
    'Not Called',
    'Follow Up',
    'Interested - Registered',
    'Interested - Follow Up',
    'Call Back',
    'Voicemail Left',
    'No Answer',
    'Not Interested',
];

// ------- Outscraper API -------

async function searchMaps(query) {
    console.log(`  Searching: "${query}"`);
    try {
        const res = await axios.get('https://api.app.outscraper.com/maps/search-v3', {
            headers: { 'X-API-KEY': API_KEY },
            params: {
                query,
                limit: 500,
                language: 'en',
                region: 'us',
                dropDuplicates: true,
            },
            timeout: 120000,
        });

        const data = res.data;

        // Outscraper may return async job — poll until done
        if (data.id && data.status !== 'Success') {
            return await pollJob(data.id);
        }

        return extractResults(data);
    } catch (err) {
        console.error(`  Error on "${query}":`, err.response?.data || err.message);
        return [];
    }
}

async function pollJob(jobId) {
    console.log(`  Job queued (${jobId}), polling...`);
    for (let i = 0; i < 30; i++) {
        await sleep(10000);
        try {
            const res = await axios.get(`https://api.app.outscraper.com/requests/${jobId}`, {
                headers: { 'X-API-KEY': API_KEY },
            });
            const data = res.data;
            if (data.status === 'Success') {
                console.log('  Done.');
                return extractResults(data);
            }
            if (data.status === 'Failed') {
                console.error('  Job failed:', data);
                return [];
            }
            process.stdout.write('.');
        } catch (err) {
            console.error('  Poll error:', err.message);
        }
    }
    console.error('  Timed out waiting for job.');
    return [];
}

function extractResults(data) {
    // Results may be nested: data.data[0] is an array of results
    const raw = Array.isArray(data.data) ? data.data : [];
    const flat = raw.flat();
    return flat.map(biz => ({
        name:    clean(biz.name),
        address: clean(biz.full_address || biz.address),
        city:    clean(biz.city || extractCity(biz.full_address)),
        state:   clean(biz.state),
        phone:   clean(biz.phone),
        website: clean(biz.website || biz.site),
        email:   clean(biz.email || biz.emails),
        rating:  biz.rating || '',
        reviews: biz.reviews || '',
    }));
}

function clean(val) {
    if (!val) return '';
    if (Array.isArray(val)) return val[0] || '';
    return String(val).trim();
}

function extractCity(address) {
    if (!address) return '';
    const parts = address.split(',');
    return parts.length >= 2 ? parts[parts.length - 2].trim() : '';
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ------- Deduplication -------

function dedup(results) {
    const seen = new Set();
    return results.filter(r => {
        // Deduplicate by phone first, then by normalized name
        const key = r.phone
            ? r.phone.replace(/\D/g, '')
            : r.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seen.has(key) || !key) return false;
        seen.add(key);
        return true;
    });
}

// ------- Excel output -------

async function writeXlsx(rows, state) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Remnant Exchange';
    const ws = wb.addWorksheet(`${state} Fabricator Leads`);

    ws.columns = [
        { header: 'Business Name', key: 'name',    width: 36 },
        { header: 'City',          key: 'city',    width: 18 },
        { header: 'Phone',         key: 'phone',   width: 16 },
        { header: 'Contact Name',  key: 'contact', width: 22 },
        { header: 'Email',         key: 'email',   width: 32 },
        { header: 'Website',       key: 'website', width: 30 },
        { header: 'Address',       key: 'address', width: 40 },
        { header: 'Rating',        key: 'rating',  width: 10 },
        { header: 'Reviews',       key: 'reviews', width: 10 },
        { header: 'Status',        key: 'status',  width: 22 },
        { header: 'Notes',         key: 'notes',   width: 40 },
    ];

    ws.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { vertical: 'middle' };
    });
    ws.getRow(1).height = 22;

    rows.forEach((r, i) => {
        const row = ws.addRow([
            r.name, r.city, r.phone, '', r.email,
            r.website, r.address, r.rating, r.reviews, 'Not Called', '',
        ]);

        if (i % 2 === 0) {
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            });
        }

        // Highlight rows with email in light green
        if (r.email) {
            row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
        }

        row.getCell(3).numFmt = '@';

        row.getCell(10).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${STATUS_OPTIONS.join(',')}"`],
            showDropDown: false,
            showErrorMessage: true,
            errorTitle: 'Invalid status',
            error: 'Please choose from the dropdown list.',
        };
    });

    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const outPath = `public/fabricator-leads-${state}-outscraper.xlsx`;
    await wb.xlsx.writeFile(outPath);
    return outPath;
}

// ------- CSV output -------

function writeCsv(rows, state) {
    const header = 'Business Name,City,Phone,Contact Name,Email,Website,Address,Rating,Reviews,Status,Notes\n';
    const lines = rows.map(r => [
        r.name, r.city, r.phone, '', r.email,
        r.website, r.address, r.rating, r.reviews, 'Not Called', ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const outPath = `public/fabricator-leads-${state}-outscraper.csv`;
    fs.writeFileSync(outPath, header + lines.join('\n'), 'utf8');
    return outPath;
}

// ------- Website email scraping -------

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Domains to skip (generic/unrelated emails)
const SKIP_DOMAINS = ['sentry.io', 'wix.com', 'wordpress.com', 'squarespace.com',
    'godaddy.com', 'example.com', 'yourdomain.com', 'email.com', 'domain.com',
    'google.com', 'facebook.com', 'instagram.com', 'yelp.com'];

function extractEmailsFromHtml(html, siteDomain) {
    const matches = html.match(EMAIL_REGEX) || [];
    return matches.filter(e => {
        const d = e.split('@')[1].toLowerCase();
        if (SKIP_DOMAINS.some(s => d.includes(s))) return false;
        // Prefer emails on same domain, but accept any non-generic
        return true;
    });
}

async function scrapeWebsiteEmail(url) {
    if (!url) return '';
    try {
        const res = await axios.get(url, {
            timeout: 6000,
            maxRedirects: 4,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadBot/1.0)' },
            validateStatus: s => s < 400,
        });
        const html = res.data || '';
        let emails = extractEmailsFromHtml(html, url);
        if (emails.length) return emails[0];

        // Try /contact page
        const base = new URL(url).origin;
        const contactRes = await axios.get(`${base}/contact`, {
            timeout: 5000,
            maxRedirects: 2,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadBot/1.0)' },
            validateStatus: s => s < 400,
        });
        emails = extractEmailsFromHtml(contactRes.data || '', url);
        return emails[0] || '';
    } catch {
        return '';
    }
}

async function scrapeEmailsBatch(rows, batchSize = 20) {
    console.log(`\nScraping websites for emails (${rows.filter(r => r.website).length} with websites)...`);
    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await Promise.all(batch.map(async r => {
            if (!r.website || r.email) return;
            r.email = await scrapeWebsiteEmail(r.website);
        }));
        const found = rows.filter(r => r.email).length;
        process.stdout.write(`\r  Scraped ${Math.min(i + batchSize, rows.length)}/${rows.length} — emails found: ${found}`);
    }
    console.log('');
}

// ------- Main -------

async function main() {
    const prefix = MODE === 'contractor' ? 'contractor-leads' : 'fabricator-leads';
    const cacheFile = `public/${prefix}-${STATE}-cache.json`;

    let deduped;

    if (fs.existsSync(cacheFile)) {
        console.log(`\nUsing cached Outscraper results from ${cacheFile}`);
        deduped = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        console.log(`Loaded ${deduped.length} businesses — re-running email scraping only\n`);
    } else {
        console.log(`\nFetching ${STATE} fabricator leads from Google Maps via Outscraper...`);
        console.log(`Queries: ${queries.length}\n`);

        let allResults = [];
        for (const query of queries) {
            const results = await searchMaps(query);
            console.log(`  → ${results.length} results`);
            allResults = allResults.concat(results);
            await sleep(1000);
        }

        console.log(`\nTotal before dedup: ${allResults.length}`);
        deduped = dedup(allResults);
        deduped.sort((a, b) => {
            if (a.city < b.city) return -1;
            if (a.city > b.city) return 1;
            return a.name.localeCompare(b.name);
        });

        fs.writeFileSync(cacheFile, JSON.stringify(deduped, null, 2), 'utf8');
        console.log(`Cached ${deduped.length} businesses to ${cacheFile}`);
    }

    console.log(`After dedup: ${deduped.length}`);
    console.log(`After dedup: ${deduped.length}`);

    // Phase 2: scrape websites for emails
    await scrapeEmailsBatch(deduped);

    const withEmail = deduped.filter(r => r.email).length;
    console.log(`\nWith email: ${withEmail} / ${deduped.length} (${Math.round(withEmail / deduped.length * 100)}%)`);

    const csvPath = writeCsv(deduped, `${STATE}-${MODE}`);
    const xlsxPath = await writeXlsx(deduped, `${STATE}-${MODE}`);

    console.log(`\nSaved:`);
    console.log(`  ${csvPath}`);
    console.log(`  ${xlsxPath}`);
    console.log(`\nDone.`);
}

main().catch(console.error);
