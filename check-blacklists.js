#!/usr/bin/env node
/**
 * check-blacklists.js — DNSBL reputation check for the sending domain.
 *
 * Run before a broadcast to confirm remnantexchange.org isn't on any
 * email blacklist. No signup, no API key — pure DNS lookups.
 *
 *   node check-blacklists.js
 *
 * IMPORTANT: DNSBL answers depend on the DNS resolver. Spamhaus (and some
 * others) refuse queries from large public resolvers (Google 8.8.8.8,
 * Cloudflare 1.1.1.1). This script runs a positive control first; if that
 * control does NOT come back "listed", the results are UNRELIABLE — run it
 * from a normal ISP resolver (e.g. a local machine), not a cloud host.
 *
 * What we own and can be listed on is the DOMAIN. The actual sending IPs are
 * Amazon SES's shared pool (via Resend) — not enumerable and managed by AWS.
 */

const dns = require('dns').promises;

// Domain-based blacklists (check the sending identity)
const DOMAIN_ZONES = ['dbl.spamhaus.org', 'multi.surbl.org', 'dbl.nordspam.com'];
// IP-based blacklists (check a given IPv4 address)
const IP_ZONES = ['zen.spamhaus.org', 'b.barracudacentral.org', 'bl.spamcop.net', 'dnsbl.sorbs.net'];

const DOMAINS = ['remnantexchange.org', 'send.remnantexchange.org'];

const reverseIp = (ip) => ip.split('.').reverse().join('.');

// Resolves to the listing code (e.g. "127.0.0.2") if listed, null if clean,
// or throws 'INCONCLUSIVE' on a resolver error that isn't a clean NXDOMAIN.
async function lookup(name) {
    try {
        const addrs = await dns.resolve4(name);
        return addrs[0] || '127.0.0.x';
    } catch (e) {
        if (e.code === 'ENOTFOUND' || e.code === 'ENODATA') return null; // not listed
        throw Object.assign(new Error('INCONCLUSIVE'), { code: e.code });
    }
}

async function checkZones(target, zones, buildName) {
    for (const zone of zones) {
        try {
            const code = await lookup(buildName(target, zone));
            if (code) console.log(`  [LISTED] ${zone} -> ${code}`);
            else console.log(`  [CLEAN]  ${zone}`);
        } catch (e) {
            console.log(`  [INCONCLUSIVE] ${zone} (${e.code})`);
        }
    }
}

(async () => {
    // Positive control — these MUST report listed for results to be trusted.
    console.log('=== Positive control (must be LISTED, else results are UNRELIABLE) ===');
    const ctlA = await lookup('2.0.0.127.zen.spamhaus.org').catch(() => null);
    const ctlB = await lookup('test.dbl.spamhaus.org').catch(() => null);
    const trustworthy = ctlA && ctlB;
    console.log(`  zen.spamhaus.org control -> ${ctlA || '<no answer>'}`);
    console.log(`  dbl.spamhaus.org control -> ${ctlB || '<no answer>'}`);
    console.log(`  => results are ${trustworthy ? 'TRUSTWORTHY' : 'UNRELIABLE (resolver blocks DNSBLs — use an ISP resolver)'}\n`);

    for (const d of DOMAINS) {
        console.log(`=== DOMAIN: ${d} ===`);
        await checkZones(d, DOMAIN_ZONES, (t, z) => `${t}.${z}`);
        console.log('');
    }

    // Check whatever IPs the apex currently resolves to (web host; secondary).
    let ips = [];
    try { ips = await dns.resolve4('remnantexchange.org'); } catch { /* ignore */ }
    for (const ip of ips) {
        console.log(`=== IP: ${ip} (apex web host) ===`);
        await checkZones(ip, IP_ZONES, (t, z) => `${reverseIp(t)}.${z}`);
        console.log('');
    }
})();
