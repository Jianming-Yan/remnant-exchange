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
    SC: [
        'kitchen remodeler South Carolina',
        'bathroom remodeler Charleston',
        'general contractor South Carolina',
        'interior designer Greenville South Carolina',
        'home builder South Carolina',
    ],
    GA: [
        'kitchen remodeler Georgia',
        'bathroom remodeler Atlanta',
        'general contractor Georgia',
        'interior designer Atlanta',
        'home builder Georgia',
    ],
    FL: [
        'kitchen remodeler Florida',
        'bathroom remodeler Miami',
        'general contractor Orlando',
        'interior designer Tampa',
        'home builder Jacksonville Florida',
        'kitchen remodeler Fort Lauderdale',
    ],
    AL: [
        'kitchen remodeler Alabama',
        'bathroom remodeler Birmingham',
        'general contractor Alabama',
        'interior designer Huntsville Alabama',
    ],
    MS: [
        'kitchen remodeler Mississippi',
        'general contractor Mississippi',
        'home builder Mississippi',
    ],
    TN: [
        'kitchen remodeler Tennessee',
        'bathroom remodeler Nashville',
        'general contractor Tennessee',
        'interior designer Memphis',
        'home builder Tennessee',
    ],
    KY: [
        'kitchen remodeler Kentucky',
        'bathroom remodeler Louisville',
        'general contractor Kentucky',
        'interior designer Lexington Kentucky',
    ],
    WV: [
        'kitchen remodeler West Virginia',
        'general contractor West Virginia',
        'home builder West Virginia',
    ],
    DE: [
        'kitchen remodeler Delaware',
        'bathroom remodeler Wilmington',
        'general contractor Delaware',
    ],
    OH: [
        'kitchen remodeler Ohio',
        'bathroom remodeler Columbus',
        'general contractor Cleveland',
        'interior designer Cincinnati',
        'home builder Ohio',
    ],
    IN: [
        'kitchen remodeler Indiana',
        'bathroom remodeler Indianapolis',
        'general contractor Indiana',
        'interior designer Fort Wayne Indiana',
    ],
    MI: [
        'kitchen remodeler Michigan',
        'bathroom remodeler Detroit',
        'general contractor Michigan',
        'interior designer Grand Rapids Michigan',
        'home builder Michigan',
    ],
    IL: [
        'kitchen remodeler Illinois',
        'bathroom remodeler Chicago',
        'general contractor Illinois',
        'interior designer Chicago',
        'home builder Illinois',
    ],
    WI: [
        'kitchen remodeler Wisconsin',
        'bathroom remodeler Milwaukee',
        'general contractor Wisconsin',
        'interior designer Madison Wisconsin',
    ],
    MN: [
        'kitchen remodeler Minnesota',
        'bathroom remodeler Minneapolis',
        'general contractor Minnesota',
        'interior designer Minneapolis',
        'home builder Minnesota',
    ],
    IA: [
        'kitchen remodeler Iowa',
        'general contractor Iowa',
        'home builder Iowa',
    ],
    MO: [
        'kitchen remodeler Missouri',
        'bathroom remodeler Kansas City Missouri',
        'general contractor Missouri',
        'interior designer St Louis',
        'home builder Missouri',
    ],
    AR: [
        'kitchen remodeler Arkansas',
        'general contractor Arkansas',
        'home builder Arkansas',
    ],
    LA: [
        'kitchen remodeler Louisiana',
        'bathroom remodeler New Orleans',
        'general contractor Louisiana',
        'interior designer Baton Rouge',
    ],
    TX: [
        'kitchen remodeler Texas',
        'bathroom remodeler Houston',
        'general contractor Dallas',
        'interior designer San Antonio',
        'home builder Austin Texas',
        'kitchen remodeler Fort Worth Texas',
    ],
    OK: [
        'kitchen remodeler Oklahoma',
        'bathroom remodeler Oklahoma City',
        'general contractor Tulsa',
        'home builder Oklahoma',
    ],
    KS: [
        'kitchen remodeler Kansas',
        'bathroom remodeler Wichita',
        'general contractor Kansas',
    ],
    NE: [
        'kitchen remodeler Nebraska',
        'bathroom remodeler Omaha',
        'general contractor Nebraska',
    ],
    SD: [
        'kitchen remodeler South Dakota',
        'general contractor Sioux Falls',
        'home builder South Dakota',
    ],
    ND: [
        'kitchen remodeler North Dakota',
        'general contractor Fargo',
        'home builder North Dakota',
    ],
    MT: [
        'kitchen remodeler Montana',
        'general contractor Billings Montana',
        'home builder Montana',
    ],
    WY: [
        'kitchen remodeler Wyoming',
        'general contractor Wyoming',
        'home builder Cheyenne Wyoming',
    ],
    CO: [
        'kitchen remodeler Colorado',
        'bathroom remodeler Denver',
        'general contractor Colorado',
        'interior designer Colorado Springs',
        'home builder Colorado',
    ],
    NM: [
        'kitchen remodeler New Mexico',
        'bathroom remodeler Albuquerque',
        'general contractor New Mexico',
        'interior designer Santa Fe',
    ],
    AZ: [
        'kitchen remodeler Arizona',
        'bathroom remodeler Phoenix',
        'general contractor Tucson',
        'interior designer Scottsdale',
        'home builder Arizona',
    ],
    UT: [
        'kitchen remodeler Utah',
        'bathroom remodeler Salt Lake City',
        'general contractor Utah',
        'interior designer Provo Utah',
    ],
    NV: [
        'kitchen remodeler Nevada',
        'bathroom remodeler Las Vegas',
        'general contractor Nevada',
        'interior designer Reno Nevada',
    ],
    ID: [
        'kitchen remodeler Idaho',
        'bathroom remodeler Boise',
        'general contractor Idaho',
    ],
    WA: [
        'kitchen remodeler Washington',
        'bathroom remodeler Seattle',
        'general contractor Washington',
        'interior designer Tacoma Washington',
        'home builder Spokane Washington',
    ],
    OR: [
        'kitchen remodeler Oregon',
        'bathroom remodeler Portland',
        'general contractor Oregon',
        'interior designer Eugene Oregon',
    ],
    CA: [
        'kitchen remodeler California',
        'bathroom remodeler Los Angeles',
        'general contractor San Francisco',
        'interior designer San Diego',
        'home builder Sacramento',
        'kitchen remodeler San Jose California',
    ],
    AK: [
        'kitchen remodeler Alaska',
        'general contractor Anchorage',
        'home builder Alaska',
    ],
    HI: [
        'kitchen remodeler Hawaii',
        'bathroom remodeler Honolulu',
        'general contractor Hawaii',
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
    SC: [
        'granite countertop fabricator South Carolina',
        'marble granite countertop Charleston',
        'stone countertop fabricator Columbia South Carolina',
        'quartz countertop fabricator Greenville South Carolina',
        'stone slab fabricator South Carolina',
    ],
    GA: [
        'granite countertop fabricator Georgia',
        'marble granite countertop Atlanta',
        'stone countertop fabricator Georgia',
        'quartz countertop fabricator Atlanta',
        'granite fabricator Savannah Georgia',
        'stone slab fabricator Georgia',
    ],
    FL: [
        'granite countertop fabricator Florida',
        'marble granite countertop Miami',
        'stone countertop fabricator Orlando',
        'quartz countertop fabricator Tampa',
        'granite fabricator Jacksonville Florida',
        'granite fabricator Fort Lauderdale Florida',
    ],
    AL: [
        'granite countertop fabricator Alabama',
        'marble granite countertop Birmingham',
        'stone countertop fabricator Alabama',
        'quartz countertop fabricator Huntsville Alabama',
    ],
    MS: [
        'granite countertop fabricator Mississippi',
        'stone countertop fabricator Mississippi',
        'marble granite Mississippi',
    ],
    TN: [
        'granite countertop fabricator Tennessee',
        'marble granite countertop Nashville',
        'stone countertop fabricator Memphis',
        'quartz countertop fabricator Tennessee',
        'granite fabricator Knoxville Tennessee',
    ],
    KY: [
        'granite countertop fabricator Kentucky',
        'marble granite countertop Louisville',
        'stone countertop fabricator Lexington Kentucky',
        'quartz countertop fabricator Kentucky',
    ],
    WV: [
        'granite countertop fabricator West Virginia',
        'stone countertop fabricator West Virginia',
        'marble granite West Virginia',
    ],
    DE: [
        'granite countertop fabricator Delaware',
        'stone countertop fabricator Wilmington Delaware',
        'quartz countertop fabricator Delaware',
    ],
    OH: [
        'granite countertop fabricator Ohio',
        'marble granite countertop Columbus',
        'stone countertop fabricator Cleveland',
        'quartz countertop fabricator Cincinnati',
        'granite fabricator Akron Ohio',
        'stone slab fabricator Ohio',
    ],
    IN: [
        'granite countertop fabricator Indiana',
        'marble granite countertop Indianapolis',
        'stone countertop fabricator Indiana',
        'quartz countertop fabricator Fort Wayne Indiana',
    ],
    MI: [
        'granite countertop fabricator Michigan',
        'marble granite countertop Detroit',
        'stone countertop fabricator Grand Rapids Michigan',
        'quartz countertop fabricator Michigan',
        'granite fabricator Lansing Michigan',
    ],
    IL: [
        'granite countertop fabricator Illinois',
        'marble granite countertop Chicago',
        'stone countertop fabricator Illinois',
        'quartz countertop fabricator Chicago',
        'granite fabricator Rockford Illinois',
        'stone slab fabricator Illinois',
    ],
    WI: [
        'granite countertop fabricator Wisconsin',
        'marble granite countertop Milwaukee',
        'stone countertop fabricator Madison Wisconsin',
        'quartz countertop fabricator Wisconsin',
    ],
    MN: [
        'granite countertop fabricator Minnesota',
        'marble granite countertop Minneapolis',
        'stone countertop fabricator Minnesota',
        'quartz countertop fabricator Minnesota',
        'granite fabricator St Paul Minnesota',
    ],
    IA: [
        'granite countertop fabricator Iowa',
        'stone countertop fabricator Iowa',
        'marble granite Des Moines Iowa',
    ],
    MO: [
        'granite countertop fabricator Missouri',
        'marble granite countertop Kansas City Missouri',
        'stone countertop fabricator St Louis',
        'quartz countertop fabricator Missouri',
        'granite fabricator Springfield Missouri',
    ],
    AR: [
        'granite countertop fabricator Arkansas',
        'stone countertop fabricator Little Rock Arkansas',
        'marble granite Arkansas',
    ],
    LA: [
        'granite countertop fabricator Louisiana',
        'marble granite countertop New Orleans',
        'stone countertop fabricator Baton Rouge',
        'quartz countertop fabricator Louisiana',
    ],
    TX: [
        'granite countertop fabricator Texas',
        'marble granite countertop Houston',
        'stone countertop fabricator Dallas',
        'quartz countertop fabricator San Antonio',
        'granite fabricator Austin Texas',
        'granite fabricator Fort Worth Texas',
    ],
    OK: [
        'granite countertop fabricator Oklahoma',
        'marble granite countertop Oklahoma City',
        'stone countertop fabricator Tulsa',
        'quartz countertop fabricator Oklahoma',
    ],
    KS: [
        'granite countertop fabricator Kansas',
        'stone countertop fabricator Wichita',
        'marble granite Kansas City Kansas',
    ],
    NE: [
        'granite countertop fabricator Nebraska',
        'stone countertop fabricator Omaha',
        'marble granite Nebraska',
    ],
    SD: [
        'granite countertop fabricator South Dakota',
        'stone countertop fabricator Sioux Falls',
        'marble granite South Dakota',
    ],
    ND: [
        'granite countertop fabricator North Dakota',
        'stone countertop fabricator Fargo',
        'marble granite North Dakota',
    ],
    MT: [
        'granite countertop fabricator Montana',
        'stone countertop fabricator Billings Montana',
        'marble granite Montana',
    ],
    WY: [
        'granite countertop fabricator Wyoming',
        'stone countertop fabricator Cheyenne Wyoming',
        'marble granite Wyoming',
    ],
    CO: [
        'granite countertop fabricator Colorado',
        'marble granite countertop Denver',
        'stone countertop fabricator Colorado Springs',
        'quartz countertop fabricator Colorado',
        'granite fabricator Fort Collins Colorado',
        'stone slab fabricator Colorado',
    ],
    NM: [
        'granite countertop fabricator New Mexico',
        'marble granite countertop Albuquerque',
        'stone countertop fabricator Santa Fe',
        'quartz countertop fabricator New Mexico',
    ],
    AZ: [
        'granite countertop fabricator Arizona',
        'marble granite countertop Phoenix',
        'stone countertop fabricator Tucson',
        'quartz countertop fabricator Scottsdale',
        'granite fabricator Mesa Arizona',
        'stone slab fabricator Arizona',
    ],
    UT: [
        'granite countertop fabricator Utah',
        'marble granite countertop Salt Lake City',
        'stone countertop fabricator Provo Utah',
        'quartz countertop fabricator Utah',
    ],
    NV: [
        'granite countertop fabricator Nevada',
        'marble granite countertop Las Vegas',
        'stone countertop fabricator Reno',
        'quartz countertop fabricator Nevada',
    ],
    ID: [
        'granite countertop fabricator Idaho',
        'marble granite countertop Boise',
        'stone countertop fabricator Idaho',
    ],
    WA: [
        'granite countertop fabricator Washington',
        'marble granite countertop Seattle',
        'stone countertop fabricator Tacoma',
        'quartz countertop fabricator Washington',
        'granite fabricator Spokane Washington',
        'stone slab fabricator Washington',
    ],
    OR: [
        'granite countertop fabricator Oregon',
        'marble granite countertop Portland',
        'stone countertop fabricator Oregon',
        'quartz countertop fabricator Eugene Oregon',
    ],
    CA: [
        'granite countertop fabricator California',
        'marble granite countertop Los Angeles',
        'stone countertop fabricator San Francisco',
        'quartz countertop fabricator San Diego',
        'granite fabricator Sacramento California',
        'granite fabricator San Jose California',
    ],
    AK: [
        'granite countertop fabricator Alaska',
        'stone countertop fabricator Anchorage',
        'marble granite Alaska',
    ],
    HI: [
        'granite countertop fabricator Hawaii',
        'marble granite countertop Honolulu',
        'stone countertop fabricator Hawaii',
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

// ------- State filtering (keep only results whose real address is in the target state) -------

const FULL_TO_ABBR = {
    'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA','colorado':'CO',
    'connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA','hawaii':'HI','idaho':'ID',
    'illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS','kentucky':'KY','louisiana':'LA',
    'maine':'ME','maryland':'MD','massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS',
    'missouri':'MO','montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
    'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
    'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC','south dakota':'SD',
    'tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT','virginia':'VA','washington':'WA',
    'west virginia':'WV','wisconsin':'WI','wyoming':'WY','district of columbia':'DC',
};

// Determine a business's real state from the Outscraper state field, falling back to the address.
function realState(r) {
    const s = (r.state || '').trim();
    if (s.length === 2) return s.toUpperCase();
    if (s && FULL_TO_ABBR[s.toLowerCase()]) return FULL_TO_ABBR[s.toLowerCase()];
    const m = (r.address || '').match(/,\s*([A-Za-z]{2})\s+\d{5}/);
    return m ? m[1].toUpperCase() : '';
}

// Keep only results whose real state matches STATE; drop out-of-state and unknown-location.
function filterToState(results) {
    let kept = 0, out = 0, unknown = 0;
    const filtered = results.filter(r => {
        const rs = realState(r);
        if (rs === STATE) { kept++; return true; }
        if (rs) { out++; return false; }
        unknown++; return false;
    });
    console.log(`State filter: kept ${kept} in ${STATE}; dropped ${out} out-of-state + ${unknown} unknown-location`);
    return filtered;
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
        { header: 'State',         key: 'state',   width: 8 },
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
            r.website, r.address, r.rating, r.reviews, 'Not Called', '', STATE,
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
    const header = 'Business Name,City,Phone,Contact Name,Email,Website,Address,Rating,Reviews,Status,Notes,State\n';
    const lines = rows.map(r => [
        r.name, r.city, r.phone, '', r.email,
        r.website, r.address, r.rating, r.reviews, 'Not Called', '', STATE
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
    deduped = filterToState(deduped);
    console.log(`After state filter: ${deduped.length}`);

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
