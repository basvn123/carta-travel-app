/**
 * A small, safe Markdown renderer for the data blog (ROADMAP K14, T1178).
 *
 * Posts are written by a script and edited by the owner, so the subset is
 * small on purpose and everything is escaped first: no raw HTML, no scripts,
 * links only to https:// or to a path on the site.
 *
 *   # heading (dropped: the page prints the post title as its h1)
 *   ## h2   ### h3
 *   paragraphs, - lists, 1. lists, | tables | (first row is the header)
 *   **bold**  *emphasis*  [text](https://... or /path)  ![alt](src)
 *   {{chart}} on its own line: the bar chart from the post's data file
 *
 * Plain JS, no dependency, runs in Node (the build) and in a browser.
 */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const SAFE_URL = /^(https:\/\/|\/(?!\/))/;

/** Inline Markdown to HTML. `resolveSrc` maps an image path to its URL. */
export function inline(text, resolveSrc = (s) => s) {
  let s = escapeHtml(text);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, src) => {
    const url = resolveSrc(src.replace(/&amp;/g, '&'));
    return url ? `<img src="${escapeHtml(url)}" alt="${alt}" loading="lazy" decoding="async">` : alt;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) => {
    const url = href.replace(/&amp;/g, '&');
    return SAFE_URL.test(url) ? `<a href="${escapeHtml(url)}">${label}</a>` : label;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=$|[\s).,;:])/g, '$1<em>$2</em>');
  return s;
}

const NUMERIC = /^[\d.,]+$/;

function table(lines, resolveSrc) {
  const cells = (ln) => ln.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(lines[0]);
  const body = lines.slice(2).map(cells);
  const th = head.map((h) => `<th scope="col">${inline(h, resolveSrc)}</th>`).join('');
  const rows = body.map((r) => `<tr>${r.map((c, i) => (i === 0
    ? `<th scope="row">${inline(c, resolveSrc)}</th>`
    : `<td${NUMERIC.test(c) ? ' class="n"' : ''}>${inline(c, resolveSrc)}</td>`)).join('')}</tr>`).join('');
  return `<div class="bl-table"><table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** The bar chart of a data file's `chart` ({title, unit, bars:[{label,value}]}). */
export function chartHtml(chart) {
  if (!chart?.bars?.length) return '';
  const max = Math.max(...chart.bars.map((b) => b.value), 1);
  const items = chart.bars.map((b) => `<li><span class="bl-lab">${escapeHtml(b.label)}</span>`
    + `<span class="bl-bar" aria-hidden="true"><i style="width:${Math.max(2, Math.round((b.value / max) * 100))}%"></i></span>`
    + `<span class="bl-val n">${escapeHtml(b.value)} ${escapeHtml(chart.unit || '')}</span></li>`).join('');
  return `<figure class="bl-chart"><figcaption>${escapeHtml(chart.title)}</figcaption><ol>${items}</ol></figure>`;
}

/** Markdown body to HTML. `data` is the post's data file, for {{chart}}. */
export function renderMarkdown(md, { data = null, resolveSrc } = {}) {
  const lines = String(md).replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (!ln.trim()) { i += 1; continue; }
    if (/^# /.test(ln)) { i += 1; continue; }
    const h = /^(#{2,3}) (.+)$/.exec(ln);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2], resolveSrc)}</h${h[1].length}>`); i += 1; continue; }
    if (ln.trim() === '{{chart}}') { out.push(chartHtml(data?.chart)); i += 1; continue; }
    if (/^\s*\|/.test(ln) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const t = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { t.push(lines[i]); i += 1; }
      out.push(table(t, resolveSrc));
      continue;
    }
    const list = /^(\s*)([-*]|\d+\.) /.exec(ln);
    if (list) {
      const ordered = /\d/.test(list[2]);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.) /.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*([-*]|\d+\.) /, ''), resolveSrc)}</li>`);
        i += 1;
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |\s*\||\s*([-*]|\d+\.) )/.test(lines[i]) && lines[i].trim() !== '{{chart}}') {
      para.push(lines[i].trim());
      i += 1;
    }
    const only = /^!\[[^\]]*\]\([^)\s]+\)$/.test(para.join(' '));
    out.push(only ? `<figure class="bl-fig">${inline(para.join(' '), resolveSrc)}</figure>` : `<p>${inline(para.join(' '), resolveSrc)}</p>`);
  }
  return out.join('\n');
}
