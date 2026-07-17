// State-targeted fabricator-lead broadcast (manual warm-up sends).
//
// Mirrors the daily auto-broadcast in server.js (touch-sequenced intro /
// follow-up 1 / follow-up 2 by touch_count, 300ms rate limit, admin monitor
// copy) but filters to a single state and only mailable, validated,
// not-registered leads. Dry-run by default — add --commit to send.
//
// Usage:
//   node send-fab-lead-broadcast.js MA                      (DRY RUN)
//   node send-fab-lead-broadcast.js MA --commit --limit=15
//
// Eligibility matches the server job: registered=0, unsubscribed=0,
// bounced=0, touch_count<3, plus state=? and a validated email.

if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { run, query, get } = require('./database/db');
const { sendFabLeadIntroEmail, sendFabLeadFollowUp1Email, sendFabLeadFollowUp2Email } = require('./utils/email');

const STATE = (process.argv[2] || '').toUpperCase();
const COMMIT = process.argv.includes('--commit');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;
// Optional: only target leads whose last touch went out on this date (YYYY-MM-DD).
// Lets you space a follow-up batch by intro date (e.g. send follow-up 1 only to
// the cohort intro'd 4+ days ago, not the ones touched yesterday).
const sentOnArg = process.argv.find(a => a.startsWith('--sent-on='));
const SENT_ON = sentOnArg ? sentOnArg.split('=')[1] : null;
// Guessed info@/contact@ emails bounce ~17% even after NeverBounce, so UNSENT
// guesses are excluded by default. But a guessed address that was already
// broadcast and did NOT bounce (last_sent_at set, bounced=0) is proven good and
// stays in the sequence. --include-guessed forces even never-sent guesses in
// (only in tiny monitored batches).
const INCLUDE_GUESSED = process.argv.includes('--include-guessed');
// Drip pacing: space out sends so a state doesn't go out as one bulk burst
// (a big Gmail Promotions signal). Default 0.3s (fast). Pass e.g. --gap=20 to put
// ~20s between sends so ~150 leads spread over ~45-60 min instead of ~1 min. A
// ±30% random jitter is applied so the cadence looks human, not machine-regular.
const gapArg = process.argv.find(a => a.startsWith('--gap='));
const GAP_MS = gapArg ? Math.max(0, parseFloat(gapArg.split('=')[1]) * 1000) : 300;

async function main() {
    if (!STATE || STATE.startsWith('--')) {
        console.error('Usage: node send-fab-lead-broadcast.js <STATE> [--commit] [--limit=N] [--gap=SECONDS]');
        process.exit(1);
    }

    // Safety guard, same as the server job: don't double-send in one UTC day.
    const alreadySent = await get(`SELECT COUNT(*) as cnt FROM fabricator_leads WHERE DATE(last_sent_at) = DATE('now')`);
    if (Number(alreadySent.cnt) > 0) {
        console.log(`NOTE: ${alreadySent.cnt} lead(s) already have last_sent_at = today. Proceeding would add to today's volume.`);
        if (COMMIT) { console.log('Refusing to --commit on top of today\'s sends. Re-run tomorrow, or remove this guard intentionally.'); process.exit(1); }
    }

    const leads = await query(
        `SELECT * FROM fabricator_leads
         WHERE state = ? AND touch_count < 3 AND unsubscribed = 0 AND registered = 0 AND bounced = 0
           AND email IS NOT NULL AND email != '' AND validated_at IS NOT NULL
           ${INCLUDE_GUESSED ? '' : 'AND (email_guessed IS NULL OR email_guessed = 0 OR last_sent_at IS NOT NULL)'}
           ${SENT_ON ? 'AND date(last_sent_at) = ?' : ''}
         ORDER BY touch_count ASC, id ASC`,
        SENT_ON ? [STATE, SENT_ON] : [STATE]
    );
    if (SENT_ON) console.log(`Filter: only leads last touched on ${SENT_ON}`);

    if (!leads.length) { console.log(`No eligible mailable leads for state ${STATE}.`); process.exit(0); }

    const emailFns = [sendFabLeadIntroEmail, sendFabLeadFollowUp1Email, sendFabLeadFollowUp2Email];
    const touchName = ['intro', 'follow-up 1', 'follow-up 2'];
    let sent = 0, attempted = 0, failed = 0;
    const byTouch = { 0: 0, 1: 0, 2: 0 };

    for (const lead of leads) {
        if (attempted >= LIMIT) break;
        attempted++;
        const touchIndex = Math.min(Number(lead.touch_count), 2);
        byTouch[touchIndex]++;

        if (!COMMIT) { sent++; continue; } // dry run: count only

        try {
            // Ensure a working unsubscribe link (CAN-SPAM) — generate if missing.
            let token = lead.unsubscribe_token;
            if (!token) {
                token = uuidv4();
                await run(`UPDATE fabricator_leads SET unsubscribe_token = ? WHERE id = ?`, [token, lead.id]);
            }
            await emailFns[touchIndex](lead.email, lead.business_name, token);
            await run(`UPDATE fabricator_leads SET touch_count = touch_count + 1, last_sent_at = datetime('now') WHERE id = ?`, [lead.id]);
            sent++;
            const jitter = GAP_MS * (0.7 + Math.random() * 0.6); // ±30% so cadence isn't machine-regular
            await new Promise(r => setTimeout(r, jitter));
        } catch (e) {
            console.error(`Failed for ${lead.email}:`, e.message);
            failed++;
        }
    }

    // Admin monitor copy (intro template), same as the server job.
    if (COMMIT && sent > 0 && process.env.ADMIN_EMAIL) {
        await sendFabLeadIntroEmail(process.env.ADMIN_EMAIL, 'Remnant Exchange', 'admin-monitor')
            .catch(e => console.error('Admin monitor email failed:', e.message));
    }

    console.log(`${COMMIT ? 'SENT' : 'DRY RUN — would send'} ${sent} to ${STATE}` +
        `  (intro: ${byTouch[0]}, follow-up 1: ${byTouch[1]}, follow-up 2: ${byTouch[2]})`);
    if (failed) console.log(`  failed: ${failed}`);
    if (!COMMIT) console.log(`\nDRY RUN — nothing sent. Add --commit (and --limit=N) to send.`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
