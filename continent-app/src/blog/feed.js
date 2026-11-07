/**
 * The blog's machine-readable parts (ROADMAP K14, T1178): the RSS 2.0 feed,
 * the sitemap file and the BlogPosting structured data. Pure functions over
 * post records, so the build, the tests and the verify script share them.
 *
 * A post record: { slug, title, description, date (YYYY-MM-DD), author,
 * image?: { src (absolute), w, h, alt } }.
 */
export const ORIGIN = 'https://www.carta-europetravel.com';
const X = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
const xml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => X[c]);
export const postPath = (slug) => `/blog/${slug}`;

const rfc822 = (d) => new Date(`${d}T09:00:00Z`).toUTCString();

/** Newest first. Date then slug, so the order is stable. */
export const byNewest = (posts) => [...posts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));

export function rssFeed(posts, { title, description }) {
  const sorted = byNewest(posts);
  const items = sorted.map((p) => `    <item>
      <title>${xml(p.title)}</title>
      <link>${ORIGIN}${postPath(p.slug)}</link>
      <guid isPermaLink="true">${ORIGIN}${postPath(p.slug)}</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <description>${xml(p.description)}</description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(title)}</title>
    <link>${ORIGIN}/blog/</link>
    <description>${xml(description)}</description>
    <language>en</language>
    <atom:link href="${ORIGIN}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${sorted.length ? `    <lastBuildDate>${rfc822(sorted[0].date)}</lastBuildDate>\n` : ''}${items}
  </channel>
</rss>
`;
}

/** The sitemap file for the blog group: the index page and each post. */
export function blogSitemap(posts) {
  const sorted = byNewest(posts);
  const entries = [{ path: '/blog/', lastmod: sorted[0]?.date || null }, ...sorted.map((p) => ({ path: postPath(p.slug), lastmod: p.date }))];
  const rows = entries.map((e) => `  <url><loc>${xml(ORIGIN + e.path)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows}\n</urlset>\n`;
}

/** JSON-LD graph of a post page: Blog post, author, publisher, breadcrumb. */
export function postGraph(p) {
  const url = `${ORIGIN}${postPath(p.slug)}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${ORIGIN}/#site`, url: `${ORIGIN}/`, name: 'Carta' },
      {
        '@type': 'BlogPosting',
        '@id': `${url}#post`,
        mainEntityOfPage: url,
        url,
        headline: p.title.slice(0, 110),
        description: p.description,
        datePublished: p.date,
        dateModified: p.modified || p.date,
        inLanguage: 'en',
        author: { '@type': 'Organization', name: p.author || 'Carta', url: `${ORIGIN}/` },
        publisher: { '@type': 'Organization', name: 'Carta', url: `${ORIGIN}/` },
        isPartOf: { '@id': `${ORIGIN}/blog/#blog` },
        ...(p.image ? { image: [p.image.src] } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Carta', item: `${ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${ORIGIN}/blog/` },
          { '@type': 'ListItem', position: 3, name: p.title, item: url },
        ],
      },
    ],
  };
}

export function indexGraph(posts) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${ORIGIN}/#site`, url: `${ORIGIN}/`, name: 'Carta' },
      {
        '@type': 'Blog', '@id': `${ORIGIN}/blog/#blog`, url: `${ORIGIN}/blog/`, name: 'Carta blog', inLanguage: 'en',
        blogPost: byNewest(posts).map((p) => ({ '@type': 'BlogPosting', headline: p.title.slice(0, 110), url: `${ORIGIN}${postPath(p.slug)}`, datePublished: p.date })),
      },
    ],
  };
}
