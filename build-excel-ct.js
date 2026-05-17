const fs = require('fs');
const ExcelJS = require('exceljs');

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

function parseLine(line) {
    const cols = [];
    let cur = '', inQ = false;
    for (const c of line) {
        if (c === '"') inQ = !inQ;
        else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
        else cur += c;
    }
    cols.push(cur);
    return cols;
}

async function build() {
    const lines = fs.readFileSync('public/fabricator-leads-CT.csv', 'utf8').split('\n').filter(l => l.trim());
    const rows = lines.slice(1).map(line => {
        const c = parseLine(line);
        // CSV columns: Business Name, City, Phone, Email, Website, Region, Status, Notes
        return [c[0]||'', c[1]||'', c[2]||'', c[3]||'', c[4]||'', c[5]||'', c[6]||'', c[7]||''];
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Remnant Exchange';
    const ws = wb.addWorksheet('CT Fabricator Leads');

    // Header row
    ws.columns = [
        { header: 'Business Name', key: 'name',    width: 36 },
        { header: 'City',          key: 'city',    width: 18 },
        { header: 'Phone',         key: 'phone',   width: 16 },
        { header: 'Email',         key: 'email',   width: 30 },
        { header: 'Website',       key: 'website', width: 28 },
        { header: 'Region',        key: 'region',  width: 18 },
        { header: 'Status',        key: 'status',  width: 22 },
        { header: 'Notes',         key: 'notes',   width: 52 },
    ];

    // Style header row
    ws.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.alignment = { vertical: 'middle' };
    });
    ws.getRow(1).height = 22;

    // Add data rows
    rows.forEach((r, i) => {
        const row = ws.addRow(r);
        const isFollowUp = r[6] === 'Follow Up';

        // Highlight Follow Up rows in light yellow
        if (isFollowUp) {
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
            });
        }

        // Alternate row shading for non-follow-up rows
        if (!isFollowUp && i % 2 === 0) {
            row.eachCell(cell => {
                if (!cell.fill || cell.fill.fgColor?.argb === 'FFFFFFFF') {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
                }
            });
        }

        // Phone as text (prevent Excel from mangling leading zeros or treating as number)
        row.getCell(3).numFmt = '@';

        // Status dropdown for every data row
        row.getCell(7).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${STATUS_OPTIONS.join(',')}"`],
            showDropDown: false,
            showErrorMessage: true,
            errorTitle: 'Invalid status',
            error: 'Please choose from the dropdown list.',
        };
    });

    // Freeze top row
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    await wb.xlsx.writeFile('public/fabricator-leads-CT.xlsx');
    console.log(`Done — ${rows.length} rows with Status dropdown: ${STATUS_OPTIONS.join(' | ')}`);

    // Region summary
    const regionCount = {};
    rows.forEach(r => {
        const region = r[5] || 'Unknown';
        regionCount[region] = (regionCount[region] || 0) + 1;
    });
    console.log('\nRegion breakdown:');
    Object.entries(regionCount).sort((a, b) => b[1] - a[1]).forEach(([region, count]) => {
        console.log(`  ${region}: ${count}`);
    });
}

build().catch(console.error);
