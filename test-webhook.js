// End-to-end test of the Resend bounce -> webhook -> suppression pipeline.
// Sends to Resend's hard-bounce simulator and polls to see if the webhook
// flips the lead to bounced=1. Cleans up the test lead on success.

require('dotenv').config();
const { Resend } = require('resend');
const { run, get } = require('./database/db');
const { v4: uuidv4 } = require('uuid');

const resend = new Resend(process.env.RESEND_API_KEY);
const TEST_EMAIL = 'bounced@resend.dev';

async function main() {
    // 1. (Re)create the test lead with bounced=0
    await run(`DELETE FROM fabricator_leads WHERE email=?`, [TEST_EMAIL]).catch(() => {});
    await run(`INSERT INTO fabricator_leads (id, business_name, email, state, unsubscribe_token, bounced) VALUES (?,?,?,?,?,0)`,
        [uuidv4(), 'WEBHOOK TEST (delete me)', TEST_EMAIL, 'TEST', uuidv4()]);
    console.log(`Inserted test lead ${TEST_EMAIL} (bounced=0).`);

    // 2. Send to the hard-bounce simulator
    await resend.emails.send({
        from: 'Remnant Exchange <info@remnantexchange.org>',
        to: TEST_EMAIL,
        subject: 'Webhook bounce test',
        html: '<p>Automated test — please ignore.</p>',
    });
    console.log('Sent to bounced@resend.dev. Waiting for bounce -> webhook...');

    // 3. Poll up to ~90s for the webhook to suppress it
    for (let i = 0; i < 9; i++) {
        await new Promise(r => setTimeout(r, 10000));
        const lead = await get(`SELECT bounced FROM fabricator_leads WHERE email=?`, [TEST_EMAIL]);
        console.log(`  [${(i + 1) * 10}s] bounced = ${lead ? lead.bounced : '(missing)'}`);
        if (lead && Number(lead.bounced) === 1) {
            console.log('\n✅ WEBHOOK WORKS — the hard bounce was auto-suppressed end to end.');
            await run(`DELETE FROM fabricator_leads WHERE email=?`, [TEST_EMAIL]);
            console.log('Cleaned up test lead.');
            process.exit(0);
        }
    }
    console.log('\n⚠️ NOT suppressed after 90s — the webhook is not firing or has a parsing bug.');
    console.log(`Leaving the test lead in place (email=${TEST_EMAIL}) for inspection.`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
