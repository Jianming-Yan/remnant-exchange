// warmup-send.js — send a short PERSONAL note from ming@remnanttrading.com to a
// friends list, to warm the new sending domain's reputation. Engaged recipients
// (opens + replies + add-to-contacts) teach Gmail that this sender = Primary.
//
// This is PERSONAL mail, not marketing: no buttons, no links, no unsubscribe
// footer, plain-text feel, and it simply asks for a reply (the strongest signal).
//
// List format — one recipient per line in warmup-list.csv (or a file you pass):
//   friend@gmail.com
//   friend2@gmail.com,Dave        <- optional first name after a comma
//   # lines starting with # are ignored
//
// Usage:
//   node warmup-send.js                         (DRY RUN, uses warmup-list.csv)
//   node warmup-send.js --commit                (send)
//   node warmup-send.js friends.csv --commit --gap=30 --limit=8
//
// Tips: ramp gradually (a handful/day, growing). Ask friends beforehand to REPLY,
// add ming@remnanttrading.com to Contacts, and drag it to Primary if it lands in
// Promotions — those actions build the reputation fastest.

if (process.env.NODE_ENV !== 'production') require('dotenv').config();
const fs = require('fs');
const { Resend } = require('resend');

const FROM = 'Ming Yan <ming@remnanttrading.com>';
const REPLY_TO = 'ming@remnanttrading.com';

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const fileArg = args.find(a => !a.startsWith('--')) || 'warmup-list.csv';
const gapArg = args.find(a => a.startsWith('--gap='));
const GAP_MS = gapArg ? Math.max(0, parseFloat(gapArg.split('=')[1]) * 1000) : 20000; // default 20s
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity;

// A few natural subject variants so a batch doesn't look mass-templated.
const SUBJECTS = ['quick favor', 'testing my new email', 'mind replying?', 'does this land in your inbox?'];

const opener = name => (name ? `Hi ${name},` : 'Hi,');
const bodyText = name => `${opener(name)}

I'm setting up a new email for my stone-remnant startup and I'm trying to make sure it actually lands in people's inboxes. Would you mind just hitting reply so I know it came through? Even one word is perfect.

Thanks a lot — really appreciate it.

Ming`;
const bodyHtml = name => `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1a1a1a;line-height:1.6;">
    <p>${opener(name)}</p>
    <p>I'm setting up a new email for my stone-remnant startup and I'm trying to make sure it actually lands in people's inboxes. Would you mind just hitting reply so I know it came through? Even one word is perfect.</p>
    <p>Thanks a lot — really appreciate it.</p>
    <p>Ming</p>
</div>`;

function parseList(file) {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8').split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#') && l.includes('@'))
        .map(l => {
            const [email, name] = l.split(',').map(s => s && s.trim());
            return { email: email.toLowerCase(), name: name || '' };
        });
}

async function sendWithRetry(fn, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try { return await fn(); }
        catch (e) { lastErr = e; if (i < tries - 1) await new Promise(r => setTimeout(r, 4000 * (i + 1))); }
    }
    throw lastErr;
}

async function main() {
    let list = parseList(fileArg);
    if (!list) { console.error(`List file not found: ${fileArg}\nCreate it with one recipient per line (email or email,Name).`); process.exit(1); }
    if (!list.length) { console.error(`No valid recipients in ${fileArg}.`); process.exit(1); }
    if (LIMIT < list.length) list = list.slice(0, LIMIT);

    console.log(`${COMMIT ? 'SENDING' : 'DRY RUN — would send'} ${list.length} warm-up note(s) from ${FROM}, ~${GAP_MS / 1000}s apart:`);
    list.forEach(r => console.log(`  ${r.email}${r.name ? '  (' + r.name + ')' : ''}`));
    if (!COMMIT) { console.log('\nDRY RUN — nothing sent. Add --commit to send.'); return; }

    const resend = new Resend(process.env.RESEND_API_KEY);
    let sent = 0, failed = 0;
    for (const r of list) {
        const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
        try {
            await sendWithRetry(() => resend.emails.send({ from: FROM, replyTo: REPLY_TO, to: r.email, subject, text: bodyText(r.name), html: bodyHtml(r.name) }));
            sent++;
            console.log(`  sent -> ${r.email}  ["${subject}"]`);
            const jitter = GAP_MS * (0.7 + Math.random() * 0.6);
            await new Promise(res => setTimeout(res, jitter));
        } catch (e) {
            failed++;
            console.error(`  FAILED -> ${r.email}: ${e.message}`);
        }
    }
    console.log(`\nDone. sent: ${sent}, failed: ${failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
