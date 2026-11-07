/* "Ask the docs" box for the Carta docs site (T1168, ROADMAP B8). Loads the
 * passages (index.js) and the shared core (core.js, a copy of
 * scripts/docs/ask_docs_core.js), answers in the browser, nothing leaves the page. */
(function () {
  function mount() {
    if (!window.CARTA_DOCS_PASSAGES || !window.CartaAskDocs || document.getElementById('ask-docs')) return;
    var core = window.CartaAskDocs;
    var index = core.buildIndex(window.CARTA_DOCS_PASSAGES);
    var base = (document.querySelector('link[rel=canonical]') || {}).href;
    var root = document.querySelector('.md-content__inner') || document.body;
    var box = document.createElement('section');
    box.id = 'ask-docs';
    box.className = 'ask-docs';
    box.innerHTML = '<form role="search"><label for="ask-docs-q"><strong>Ask the docs</strong></label> <input id="ask-docs-q" type="search" placeholder="How do I restore a backup?" autocomplete="off"> <button type="submit">Ask</button></form><div id="ask-docs-out" aria-live="polite"></div>';
    root.insertBefore(box, root.firstChild);
    var out = box.querySelector('#ask-docs-out');
    var siteRoot = (document.querySelector('script[src*="assets/ask-docs/widget.js"]') || {}).src;
    siteRoot = siteRoot ? siteRoot.replace(/assets\/ask-docs\/widget\.js.*$/, '') : (base || '/');
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function url(c) { return siteRoot + c.path.replace(/\.md$/, '/').replace(/(^|\/)index\/$/, '$1').replace(/README\/$/, '') + (c.anchor ? '#' + c.anchor : ''); }
    box.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var q = box.querySelector('input').value.trim();
      if (!q) { out.textContent = ''; return; }
      var a = core.answer(index, q);
      if (a.abstained) { out.innerHTML = '<p>' + esc(a.text) + '</p>'; return; }
      var html = '<p>' + esc(a.text) + '</p><ol>';
      a.citations.forEach(function (c) { html += '<li><a href="' + esc(url(c)) + '">' + esc(c.label) + '</a></li>'; });
      out.innerHTML = html + '</ol>';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  if (window.document$) window.document$.subscribe(function () { setTimeout(mount, 0); });
})();
