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

        // 2) Document title
        document.title = document.title.replace(/Remnant Exchange/g, 'Remnant Trading');

        // 3) Body copy — only the full phrase "Remnant Exchange", so email/domain
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
