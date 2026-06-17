// Reset touch_count to 0 on the clean mailable pool (run AFTER validation),
// so a warm-up send counts as a genuine first touch. Prints a summary.
//
// Usage: node reset-touch-count.js

if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const { run, get, query } = require('./database/db');

async function main() {
    await run(`UPDATE fabricator_leads SET touch_count = 0 WHERE registered = 0 AND unsubscribed = 0 AND bounced = 0`);

    const n = async (sql) => Number((await get(sql)).c);
    const total = await n(`SELECT COUNT(*) c FROM fabricator_leads`);
    const validated = await n(`SELECT COUNT(*) c FROM fabricator_leads WHERE validated_at IS NOT NULL`);
    const bounced = await n(`SELECT COUNT(*) c FROM fabricator_leads WHERE bounced = 1`);
    const registered = await n(`SELECT COUNT(*) c FROM fabricator_leads WHERE registered = 1`);
    const unsub = await n(`SELECT COUNT(*) c FROM fabricator_leads WHERE unsubscribed = 1`);
    const mailable = await n(`SELECT COUNT(*) c FROM fabricator_leads WHERE registered = 0 AND unsubscribed = 0 AND bounced = 0`);
    const touch0 = await n(`SELECT COUNT(*) c FROM fabricator_leads WHERE touch_count = 0 AND registered = 0 AND unsubscribed = 0 AND bounced = 0`);

    console.log('=== After validation + touch reset ===');
    console.log('total leads:        ', total);
    console.log('validated:          ', validated);
    console.log('suppressed (bounced):', bounced);
    console.log('registered (excl):  ', registered);
    console.log('unsubscribed (excl):', unsub);
    console.log('CLEAN MAILABLE POOL:', mailable, '(at touch 0:', touch0 + ')');

    const byState = await query(`SELECT COALESCE(NULLIF(TRIM(state),''),'(none)') st, COUNT(*) c FROM fabricator_leads WHERE registered=0 AND unsubscribed=0 AND bounced=0 GROUP BY st ORDER BY c DESC`);
    console.log('\n=== Clean mailable by state ===');
    byState.forEach(r => console.log('  ' + r.st + ': ' + Number(r.c)));

    process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
