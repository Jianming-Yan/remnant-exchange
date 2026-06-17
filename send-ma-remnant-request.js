// One-off buyer request: ask validated MA fabricators if they have a specific
// remnant. Sends to validated-good, non-bounced, non-unsubscribed MA leads.
// Tracks who's been sent (Downloads/ma-remnant-sent.txt) so a later "widen"
// run hits the NEXT batch, not repeats.
//
// Usage:
//   node send-ma-remnant-request.js                 (DRY RUN, default limit 50)
//   node send-ma-remnant-request.js --commit --limit=50

if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const fs = require('fs');
const { Resend } = require('resend');
const { query } = require('./database/db');

const resend = new Resend(process.env.RESEND_API_KEY);
const COMMIT = process.argv.includes('--commit');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 50;
const SENT_FILE = 'C:/Users/Shane/Downloads/ma-remnant-sent.txt';
const FROM = 'Remnant Exchange <info@remnantexchange.org>';
const SUBJECT = 'Looking for an MSI Midnight Corvo remnant (84x37.5 or 90x26) — Massachusetts';

function html(unsubUrl) {
    return `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;line-height:1.6;">
            <p>Hi there,</p>
            <p>I'm helping a fabricator who needs a specific remnant, and I'm hoping one of you has it sitting in your shop:</p>
            <ul style="line-height:2;margin:12px 0 12px 20px;">
                <li><strong>Stone:</strong> MSI Midnight Corvo</li>
                <li><strong>Ideal size:</strong> ~84" &times; 37&frac12;", or ~90" &times; 26" (or larger)</li>
                <li><strong>Location:</strong> Massachusetts</li>
            </ul>
            <p><strong>If you have this slab as a remnant and would sell it, just reply to this email</strong> with the size, price, and a photo — I'll connect you with the buyer directly.</p>
            <p>This is exactly what Remnant Exchange is for — turning leftover slabs into cash. You can list any of your remnants free anytime at <a href="https://remnantexchange.org" style="color:#2563eb;">remnantexchange.org</a>.</p>
            <p>Thanks!<br>— Jianming Yan<br><span style="color:#64748b;font-size:0.9rem;">Founder, Remnant Exchange | (617) 606-5840</span></p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
            <p style="color:#94a3b8;font-size:0.75rem;margin:0;">Remnant Exchange &middot; 105 Chapman Street, Canton, MA 02021<br>
            <a href="${unsubUrl}" style="color:#94a3b8;">Unsubscribe</a></p>
        </div>`;
}

async function main() {
    let sentSet = new Set();
    if (fs.existsSync(SENT_FILE)) {
        sentSet = new Set(fs.readFileSync(SENT_FILE, 'utf8').split(/\r?\n/).map(e => e.trim().toLowerCase()).filter(Boolean));
    }

    const leads = await query(`SELECT email, business_name, unsubscribe_token FROM fabricator_leads
        WHERE UPPER(TRIM(state))='MA' AND validated_at IS NOT NULL AND bounced=0 AND unsubscribed=0 ORDER BY id`);
    const eligible = leads.filter(l => l.email && !sentSet.has(String(l.email).toLowerCase()));
    const batch = eligible.slice(0, LIMIT);

    let sent = 0, failed = 0;
    const newlySent = [];
    for (const l of batch) {
        try {
            if (COMMIT) {
                const unsubUrl = `${process.env.BASE_URL}/api/fab-leads/unsubscribe?token=${l.unsubscribe_token}`;
                await resend.emails.send({ from: FROM, replyTo: 'jianming@remnantexchange.org', to: l.email, subject: SUBJECT, html: html(unsubUrl) });
                newlySent.push(String(l.email).toLowerCase());
                await new Promise(r => setTimeout(r, 400));
            }
            sent++;
        } catch (e) { console.error(`Failed ${l.email}:`, e.message); failed++; }
    }
    if (COMMIT && newlySent.length) fs.appendFileSync(SENT_FILE, newlySent.join('\n') + '\n');

    console.log(`${COMMIT ? 'SENT' : 'DRY RUN — would send'}: ${sent}`);
    console.log(`  MA validated mailable: ${leads.length} | not yet sent this request: ${eligible.length}`);
    if (failed) console.log(`  failed: ${failed}`);
    if (!COMMIT) console.log('DRY RUN — add --commit to actually send.');
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
