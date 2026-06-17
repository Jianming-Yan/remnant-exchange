// One-off campaign: remind existing no-listing fabricators to log in and post
// their first remnant. Only sends to VALIDATED-GOOD emails (pass the good list).
//
//   bulk-created accounts (source != self_registered): reset to temp password
//       12345678 + magic login link + "account is ready" email (sendUserReminderEmail)
//   self-registered (6): no password reset — the gentler nudge (sendActivationNudgeEmail)
//
// Skips anyone unsubscribed or already reminded (reminder_sent_at). Warm up with
// --limit=N per run; re-run to send the next batch.
//
// Usage:
//   node send-user-reminders.js <good-emails-file>                  (DRY RUN)
//   node send-user-reminders.js <good-emails-file> --commit --limit=15

if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { run, query } = require('./database/db');
const { sendUserReminderEmail, sendActivationNudgeEmail } = require('./utils/email');

const GOOD_FILE = process.argv[2];
const COMMIT = process.argv.includes('--commit');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;
const TEMP = '12345678';

function readEmails(file) {
    return new Set(fs.readFileSync(file, 'utf8').split(/\r?\n/)
        .map(l => l.split(',')[0].trim().replace(/^"|"$/g, '').toLowerCase())
        .filter(e => e && e.includes('@')));
}

async function main() {
    if (!GOOD_FILE) { console.error('Usage: node send-user-reminders.js <good-emails-file> [--commit] [--limit=N]'); process.exit(1); }

    // Self-ensure the marker column (idempotent; no deploy needed).
    try { await run(`ALTER TABLE users ADD COLUMN reminder_sent_at TEXT`); } catch (e) { /* exists */ }

    const good = readEmails(GOOD_FILE);

    const users = await query(`SELECT id, email, name, business_name, source FROM users u
        WHERE u.role='fabricator' AND u.approved=1
          AND (u.outreach_status IS NULL OR u.outreach_status != 'unsubscribed')
          AND u.reminder_sent_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM listings l WHERE l.user_id=u.id AND l.status='active')
        ORDER BY u.source IS NULL, u.id`);

    const tempHash = await bcrypt.hash(TEMP, 10);
    let sent = 0, bulk = 0, self = 0, skippedBad = 0, failed = 0, attempted = 0;

    for (const u of users) {
        const email = String(u.email || '').toLowerCase();
        if (!good.has(email)) { skippedBad++; continue; }
        if (attempted >= LIMIT) break;   // limit counts ATTEMPTS, not just successes
        attempted++;

        const isSelf = u.source === 'self_registered';
        const name = u.name || u.business_name || 'there';
        try {
            if (COMMIT) {
                if (isSelf) {
                    await sendActivationNudgeEmail(u.email, name, u.business_name);
                } else {
                    const magicToken = uuidv4();
                    const unsubToken = uuidv4();
                    await run(`UPDATE users SET password_hash=?, must_change_password=1 WHERE id=?`, [tempHash, u.id]);
                    await run(`DELETE FROM email_tokens WHERE user_id=? AND type IN ('magic-login','unsubscribe')`, [u.id]);
                    await run(`INSERT INTO email_tokens (id, user_id, token, type, expires_at) VALUES (?,?,?,?,?)`,
                        [uuidv4(), u.id, magicToken, 'magic-login', new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()]);
                    await run(`INSERT INTO email_tokens (id, user_id, token, type, expires_at) VALUES (?,?,?,?,?)`,
                        [uuidv4(), u.id, unsubToken, 'unsubscribe', new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString()]);
                    await sendUserReminderEmail(u.email, name, TEMP, magicToken, unsubToken);
                }
                await run(`UPDATE users SET reminder_sent_at=datetime('now') WHERE id=?`, [u.id]);
                await new Promise(r => setTimeout(r, 400)); // rate-limit
            }
            sent++; isSelf ? self++ : bulk++;
        } catch (e) {
            console.error(`Failed for ${u.email}:`, e.message);
            failed++;
        }
    }

    console.log(`${COMMIT ? 'SENT' : 'DRY RUN — would send'}: ${sent}  (bulk-created: ${bulk}, self-registered nudge: ${self})`);
    console.log(`  skipped (email not in good list): ${skippedBad}`);
    if (failed) console.log(`  failed: ${failed}`);
    if (!COMMIT) console.log(`\nDRY RUN — nothing sent. Add --commit (and --limit=N for warm-up batches).`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
