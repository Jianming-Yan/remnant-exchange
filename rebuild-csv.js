const fs = require('fs');

const lines = fs.readFileSync('public/phone-leads.csv', 'utf8').split('\n').filter(l => l.trim());
const header = 'Business Name,City,Phone,Email,Website,Region,Status,Notes';

const data = lines.slice(1).map(line => {
    const cols = [];
    let cur = '', inQ = false;
    for (const c of line) {
        if (c === '"') inQ = !inQ;
        else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
        else cur += c;
    }
    cols.push(cur);
    cols.splice(3, 0, ''); // insert empty Email after Phone
    return cols.map(c => c.includes(',') ? '"' + c + '"' : c).join(',');
});

fs.writeFileSync('public/fabricator-leads-MA.csv', [header, ...data].join('\r\n'), 'utf8');
console.log('Done. Rows: ' + data.length);
