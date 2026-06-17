// Re-derive each lead's state from its phone AREA CODE and correct mismatches.
// George's per-state tabs contain out-of-state shops (e.g. NY/NJ in the MA tab),
// so the tab-derived state is unreliable. The phone area code is a deterministic
// location signal. Leads with no phone / unknown area code are left untouched.
//
// Usage:
//   node clean-lead-states.js            (DRY RUN — report only)
//   node clean-lead-states.js --commit   (apply corrections)

if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const { query, run } = require('./database/db');
const COMMIT = process.argv.includes('--commit');

const MAP = {
    MA:['339','351','413','508','617','774','781','857','978'],
    NY:['212','315','332','347','516','518','585','607','631','646','680','716','718','838','845','914','917','929','934'],
    NJ:['201','551','609','640','732','848','856','862','908','973'],
    CT:['203','475','860','959'], RI:['401'], NH:['603'], VT:['802'], ME:['207'],
    PA:['215','223','267','272','412','445','484','570','610','717','724','814','835','878'],
    MD:['240','301','410','443','667'], DE:['302'], DC:['202'],
    VA:['276','434','540','571','703','757','804','826','948'],
    AL:['205','251','256','334','659','938'], AK:['907'],
    AZ:['480','520','602','623','928'], AR:['479','501','870'],
    CO:['303','719','720','970','983'],
    GA:['229','404','470','478','678','706','762','770','912','943'],
    IA:['319','515','563','641','712'],
    MI:['231','248','269','313','517','586','616','679','734','810','906','947','989'],
    MN:['218','320','507','612','651','763','952'],
    MO:['314','417','573','636','660','816','975'],
    NV:['702','725','775'],
    NC:['252','336','704','743','828','910','919','980','984'],
    OH:['216','220','234','330','380','419','440','513','567','614','740','937'],
    FL:['239','305','321','352','386','407','448','561','656','689','727','754','772','786','813','850','863','904','941','954'],
    CA:['209','213','279','310','323','408','415','424','442','510','530','559','562','619','626','628','650','657','661','669','707','714','747','760','805','818','820','831','858','909','916','925','949','951'],
    TX:['210','214','254','281','325','346','361','409','430','432','469','512','682','713','726','737','806','817','830','832','903','915','936','940','945','956','972','979'],
    IL:['217','224','309','312','331','447','464','618','630','708','773','779','815','847','872'],
    WA:['206','253','360','425','509','564'],
    IN:['219','260','317','463','574','765','812','930'],
    TN:['423','615','629','731','865','901','931'],
    WI:['262','274','414','534','608','715','920'],
    SC:['803','839','843','854','864'], KY:['270','364','502','606','859'],
    LA:['225','318','337','504','985'], OK:['405','539','572','580','918'],
    OR:['458','503','541','971'], KS:['316','620','785','913'],
    UT:['385','435','801'], NM:['505','575'], NE:['308','402','531'],
    MS:['228','601','662','769'], ID:['208','986'], WV:['304','681'],
    HI:['808'], MT:['406'], ND:['701'], SD:['605'], WY:['307'],
};
const AREA = {};
for (const [st, codes] of Object.entries(MAP)) for (const c of codes) AREA[c] = st;

function areaCode(phone) {
    if (!phone) return null;
    let d = String(phone).replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    if (d.length < 10) return null;
    return d.slice(0, 3);
}

async function main() {
    const leads = await query(`SELECT id, email, business_name, state, city, phone FROM fabricator_leads WHERE phone IS NOT NULL AND TRIM(phone) != ''`);
    let corrected = 0, noPhone = 0, unknownAc = 0;
    const byMove = {}, samples = [];

    for (const l of leads) {
        const ac = areaCode(l.phone);
        if (!ac) { noPhone++; continue; }
        const real = AREA[ac];
        if (!real) { unknownAc++; continue; }
        const cur = String(l.state || '').trim().toUpperCase();
        if (cur && cur !== real) {
            const key = `${cur} -> ${real}`;
            byMove[key] = (byMove[key] || 0) + 1;
            if (samples.length < 15) samples.push(`${l.email} | ${l.business_name} | ${l.city || '?'} | ${key} (area ${ac})`);
            corrected++;
            if (COMMIT) await run(`UPDATE fabricator_leads SET state=? WHERE id=?`, [real, l.id]);
        }
    }

    console.log(`${COMMIT ? 'CORRECTED' : 'DRY RUN — would correct'}: ${corrected} leads`);
    console.log(`(leads with unparseable phone: ${noPhone}, unknown area code: ${unknownAc})`);
    console.log('\nCorrections by move (current -> real):');
    Object.entries(byMove).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
    console.log('\nSamples:');
    samples.forEach(s => console.log('  ' + s));
    if (!COMMIT) console.log('\nDRY RUN — nothing changed. Add --commit to apply.');
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
