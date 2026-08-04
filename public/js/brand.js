// Hostname-aware branding. On remnanttrading.com the pages read "Remnant Trading"
// (and ".com"); on remnantexchange.org they keep their built-in "Remnant Exchange"
// (".org"). Same app, two brands — driven purely by the domain the visitor is on.
// Full-phrase matching only, so lowercase domains/emails like remnantexchange.org
// are never touched.
(function () {
    if (!/remnanttrading\./i.test(location.hostname)) return; // trading domain only

    function apply() {
        // 1) Nav wordmark: "Remnant<span>Exchange</span><span>.org</span>" -> Trading/.com
        document.querySelectorAll('.nav-logo').forEach(function (logo) {
            logo.querySelectorAll('span').forEach(function (s) {
                s.textContent = s.textContent.replace(/Exchange/g, 'Trading').replace(/\.org/g, '.com');
            });
            logo.childNodes.forEach(function (n) {
                if (n.nodeType === 3 && /Exchange/.test(n.nodeValue)) {
                    n.nodeValue = n.nodeValue.replace(/Exchange/g, 'Trading');
                }
            });
        });

        // 2) Wordmark images. The nav icon (logo-icon.svg) has no text so it serves both
        //    brands, but the full logos spell out EXCHANGE and can't be rewritten as text.
        document.querySelectorAll('img').forEach(function (img) {
            var src = img.getAttribute('src') || '';
            if (/logo-white\.svg$/.test(src)) img.setAttribute('src', src.replace(/logo-white\.svg$/, 'logo-trading-white.svg'));
            else if (/logo\.svg$/.test(src)) img.setAttribute('src', src.replace(/logo\.svg$/, 'logo-trading.svg'));
            var alt = img.getAttribute('alt');
            if (alt && alt.indexOf('Remnant Exchange') !== -1) {
                img.setAttribute('alt', alt.replace(/Remnant Exchange/g, 'Remnant Trading'));
            }
        });

        // 3) Document title
        document.title = document.title.replace(/Remnant Exchange/g, 'Remnant Trading');

        // 4) Body copy — only the full phrase "Remnant Exchange", so email/domain
        //    strings (remnantexchange.org, info@remnantexchange.org) stay intact.
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        var hits = [];
        while (walker.nextNode()) {
            if (walker.currentNode.nodeValue.indexOf('Remnant Exchange') !== -1) hits.push(walker.currentNode);
        }
        hits.forEach(function (n) { n.nodeValue = n.nodeValue.replace(/Remnant Exchange/g, 'Remnant Trading'); });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
    else apply();
})();
