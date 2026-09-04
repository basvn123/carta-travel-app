/**
 * destinationPdf.js, the printable destination guide.
 *
 * Renders from the SAME dossier contract the full-screen page reads
 * (public/dossier/{id}.json), so the PDF cannot drift from the app: one
 * contract, two renderers. Same delivery mechanism as dayPlanPdf.js, the
 * proven path in this codebase: build one standalone document, write it into
 * a window, wait for fonts and photographs, print. The reader saves it as
 * PDF from the print dialog.
 *
 * The window is opened by the CALLER, synchronously inside the tap, and
 * handed in as `win`: a window.open that follows an `await import()` is no
 * longer inside the user gesture and Safari blocks it. Opening it ourselves
 * remains the fallback for callers that did not.
 *
 * What the paper carries, and in what order, follows the page's decision
 * sequence: should I go (the verdict), what is it, how do I get there and
 * where do I sleep, what do I see, what do I do, what it costs and when,
 * then the practical tail. Sections with nothing to say do not print.
 *
 * Three rules shape the layout:
 *   - Dense on purpose. Two-column blocks wherever two short lists sit next
 *     to each other (costs beside the climate, tips beside festivals, the
 *     area map beside the remaining highlights), so a guide is four to six
 *     pages, not ten.
 *   - Links are links. Every URL prints as a short clickable label (the
 *     site's name), never as a wrapped line of mono characters: the saved
 *     PDF keeps the link, and a printed page still names the site.
 *   - The three-month rule decides what is on the paper: climate normals
 *     yes, this week's forecast no; the euro day cost with its provenance
 *     yes, live fares no. Where the app shows a live product the PDF prints
 *     the search link instead.
 *
 * The licence gate travels with the images: only photographs whose licence
 * allows redistribution WITH their author resolved (img.ok_print, decided in
 * pipeline/dossier/build_dossier.py) are embedded, and every one of them is
 * listed again in the closing credits with author, licence and source. An
 * uncredited photo does not ship, full stop.
 */

import { eur } from './format.js';
import { activityLink } from './activityAffiliates.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const okImg = (img) => img && img.url && img.ok_print;

// Only http(s) prints as a link; anything else is text.
const safeHref = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

/** A clickable link that reads as the site's name: "getyourguide.com". */
function link(url, label) {
  const href = safeHref(url);
  if (!href) return '';
  let text = label;
  if (!text) {
    try { text = new URL(href).hostname.replace(/^www\./, ''); } catch { text = href; }
  }
  return `<a class="lnk" href="${esc(href)}">${esc(text)}</a>`;
}

/** The bare arrow beside a name: the link with no label of its own. */
function arrow(url) {
  const href = safeHref(url);
  return href ? `<a class="lnk lnk-ico" href="${esc(href)}">↗</a>` : '';
}

// A hotlinked photograph that fails to load leaves its slot rather than a
// broken-image icon on the paper; the caption still names the place.
const IMG_FALLBACK = `onerror="this.remove()"`;

/** Month names in the reader's language, short form. */
function monthNames(lang) {
  const locale = lang === 'en' ? 'en-GB' : (lang || 'en-GB');
  try {
    const f = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    return Array.from({ length: 12 }, (_, i) => f.format(new Date(Date.UTC(2024, i, 1))).replace(/\.$/, ''));
  } catch {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  }
}

/** "May-Jul, Sep" from [5,6,7,9]. */
function monthRanges(months, M) {
  const ms = [...new Set(months || [])].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  if (!ms.length) return '';
  const out = [];
  let start = ms[0];
  let prev = ms[0];
  for (let i = 1; i <= ms.length; i++) {
    const m = ms[i];
    if (m === prev + 1) { prev = m; continue; }
    out.push(start === prev ? M[start - 1] : `${M[start - 1]}-${M[prev - 1]}`);
    start = m; prev = m;
  }
  return out.join(', ');
}

function creditRows(dossier) {
  const seen = new Set();
  const rows = [];
  const add = (img, caption) => {
    if (!okImg(img) || seen.has(img.url)) return;
    seen.add(img.url);
    rows.push({
      caption: caption || img.caption || '',
      author: img.author || '',
      licence: img.licence || '',
      page: img.page || '',
    });
  };
  for (const g of dossier.gallery || []) add(g);
  for (const h of dossier.highlights || []) add(h.image, h.name);
  return rows;
}

/** The twelve months as a strip: name, day high, night low, best months tinted. */
function monthTable(normals, best, M, t) {
  if (!Array.isArray(normals) || normals.length !== 12) return '';
  const bestSet = new Set(best || []);
  const cells = normals.map((row, i) => {
    const hi = Array.isArray(row) ? row[0] : null;
    const lo = Array.isArray(row) ? row[1] : null;
    return `<div class="mcol ${bestSet.has(i + 1) ? 'is-best' : ''}">
      <span class="mname">${esc(M[i])}</span>
      <span class="mhi mono">${hi != null ? `${Math.round(hi)}°` : ''}</span>
      <span class="mlo mono">${lo != null ? `${Math.round(lo)}°` : ''}</span>
    </div>`;
  }).join('');
  return `
    <div class="months">${cells}</div>
    <p class="note">${esc(t('pdf.monthsNote'))}${best?.length ? ` ${esc(t('pdf.bestMonths', { months: monthRanges(best, M) }))}` : ''}</p>`;
}

export function openDestinationPdf({
  dossier, destination, cost, t, lang, lifestyleLabel, mapSnapshot, win = null,
}) {
  if (!dossier || !destination) { try { win?.close(); } catch { /* fine */ } return; }
  const d = dossier;
  const M = monthNames(lang);
  const city = (destination.city || d.place?.name || '').replace(/\s*\([^)]*\)\s*$/, '');
  const country = destination.country || d.place?.country || '';
  const heroes = (d.gallery || []).filter(okImg).slice(0, 4);
  const credits = creditRows(d);
  const links = d.practical?.links || {};
  const getting = d.practical?.getting_there || null;
  const sleep = d.sleep || null;
  const verdict = d.verdict || destination.rating || null;
  const locale = lang === 'en' ? 'en-GB' : lang;
  const today = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date());
  const unesco = (d.place?.designations || destination.designations || [])
    .some((g) => g.kind === 'unesco_whc');

  const sec = (title, body, cls = '') => (body ? `
    <section class="sec ${cls}">
      <h2>${esc(title)}</h2>
      ${body}
    </section>` : '');

  // -------------------------------------------------- verdict line
  const rankLine = verdict?.country_rank === 1
    ? t('card.topOf', { country })
    : verdict?.country_badge
      ? t('card.rankIn', { n: verdict.country_rank, country })
      : '';
  const verdictLine = verdict?.score != null ? `
    <div class="verdict">
      <span class="vscore mono tier-${verdict.tier ?? 0}">${verdict.score.toFixed(1)}</span>
      ${verdict.label ? `<span class="vlabel">${esc(verdict.label)}</span>` : ''}
      ${rankLine ? `<span class="vrank">${esc(rankLine)}</span>` : ''}
      ${verdict.hidden_gem ? `<span class="vgem">${esc(t('legend.gem'))}</span>` : ''}
    </div>` : '';

  // -------------------------------------------------- cover facts
  const crowd = d.when?.crowding?.label || '';
  const facts = [
    d.place?.visit_h != null ? [t('pdf.factVisit'), `${Math.round(d.place.visit_h)} h`] : null,
    d.when?.best?.length ? [t('pdf.factBest'), monthRanges(d.when.best, M)] : null,
    cost?.dayEur != null ? [t('pdf.factDay'), eur(cost.dayEur)] : null,
    crowd ? [t('pdf.crowd'), crowd] : null,
    d.intro?.facts?.population ? [t('pdf.factPop'), Number(d.intro.facts.population).toLocaleString(locale)] : null,
  ].filter(Boolean);

  // -------------------------------------------------- practical: there and sleep
  const gettingRows = [];
  if (getting?.airport) {
    gettingRows.push(getting.transfer_min != null
      ? t('dest.flyToWithTransfer', {
        iata: getting.airport, n: getting.transfer_min,
        mode: t(`mode.${getting.transfer_mode || 'train'}`),
      })
      : t('dest.flyTo', { iata: getting.airport }));
  }
  if (getting?.transit) {
    gettingRows.push(`${t(`dest.transit.${getting.transit}`)}${getting.why ? ` ${getting.why}` : ''}`);
  }
  if (getting?.car_needed != null) {
    gettingRows.push(`${getting.car_needed ? t('dest.carYes') : t('dest.carNo')}${
      getting.car_needed && getting.rental_eur_day != null ? ` ${t('dest.carRental', { eur: getting.rental_eur_day })}` : ''}`);
  }
  const sleepRows = [];
  if (sleep?.per_person_night_eur != null) sleepRows.push(t('pdf.sleepPp', { eur: sleep.per_person_night_eur }));
  if (sleep?.tiers) {
    const tiers = [
      sleep.tiers.dorm_pp_night_eur != null ? t('dest.tierDorm', { eur: Math.round(sleep.tiers.dorm_pp_night_eur) }) : null,
      sleep.tiers.private_room_night_eur != null ? t('dest.tierPrivate', { eur: Math.round(sleep.tiers.private_room_night_eur) }) : null,
      sleep.tiers.hotel_night_eur != null ? t('dest.tierHotel', { eur: Math.round(sleep.tiers.hotel_night_eur) }) : null,
    ].filter(Boolean);
    if (tiers.length) sleepRows.push(tiers.join(' · '));
  }
  if (Array.isArray(sleep?.seasonality) && sleep.seasonality.length === 12) {
    const min = Math.min(...sleep.seasonality);
    const idx = sleep.seasonality.indexOf(min);
    if (idx >= 0) sleepRows.push(t('dest.cheapestMonth', { month: M[idx] }));
  }
  const bookAhead = d.practical?.book_ahead || [];
  const rhythm = d.practical?.rhythm || '';
  const practicalBody = (gettingRows.length || sleepRows.length || bookAhead.length || rhythm) ? `
    <div class="two">
      ${gettingRows.length ? `<div class="keep"><ul class="plain">${gettingRows.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
      ${sleepRows.length ? `<div class="keep"><h3>${esc(t('dest.sleepTitle'))}</h3><ul class="plain">${sleepRows.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>` : ''}
    </div>
    ${rhythm ? `<p class="rhythm">${esc(rhythm)}</p>` : ''}
    ${bookAhead.length ? `<p class="bookahead"><b>!</b> ${esc(t('dest.bookAhead', { names: bookAhead.join(', ') }))}</p>` : ''}` : '';

  // -------------------------------------------------- highlights
  // The picture cards go to the highest-ranked highlights that HAVE a
  // printable photograph, in rank order; everything else keeps its place in
  // the list beside the area map. Both halves matter: ordering by rank
  // alone gave Valbona three grey rectangles where its peaks have no photo,
  // and ordering by photo alone buried the Eiffel Tower under Pere Lachaise.
  const hl = [...(d.highlights || [])].sort((a, b) => (b.rank_score || 0) - (a.rank_score || 0));
  const rankOf = new Map(hl.map((h, i) => [h, i + 1]));
  const hlLead = hl.filter((h) => okImg(h.image)).slice(0, 6);
  const leadSet = new Set(hlLead);
  const hlRest = hl.filter((h) => !leadSet.has(h)).slice(0, 12);
  const hlSub = (h) => `${esc(h.kind || '')}${h.dist_km != null ? ` · <span class="mono">${h.dist_km < 0.95 ? `${Math.round(h.dist_km * 100) * 10} m` : `${Math.round(h.dist_km)} km`}</span>` : ''}`;
  const hlBody = hl.length ? `
    ${hlLead.length ? `<div class="hl-grid">
      ${hlLead.map((h) => `
        <figure class="hl-card keep">
          <img src="${esc(h.image.url)}" alt="" loading="eager" ${IMG_FALLBACK}>
          <figcaption>
            <div class="hl-name"><span class="n mono">${rankOf.get(h)}</span>${esc(h.name)}${arrow(h.wikipedia)}</div>
            <div class="hl-sub">${hlSub(h)}</div>
            ${h.fact ? `<div class="hl-fact">${esc(h.fact)}</div>` : ''}
          </figcaption>
        </figure>`).join('')}
    </div>` : ''}
    ${(hlRest.length || mapSnapshot) ? `
    <div class="hl-tail ${mapSnapshot ? 'has-map' : ''}">
      ${mapSnapshot ? `<figure class="hl-map keep"><img src="${esc(mapSnapshot)}" alt=""><figcaption class="note">${esc(t('pdf.mapCaption'))}</figcaption></figure>` : ''}
      ${hlRest.length ? `<ul class="hl-more">
        ${hlRest.map((h) => `
          <li class="keep"><span class="n mono">${rankOf.get(h)}</span><b>${esc(h.name)}</b><span class="hl-sub">${hlSub(h)}</span></li>`).join('')}
      </ul>` : ''}
    </div>` : ''}
    <p class="note">${esc(t('pdf.contentsNote'))}</p>` : '';

  // -------------------------------------------------- things to do
  // Grouped exactly as the page groups them: the consensus count is the most
  // trustworthy signal on the page, so it structures the list. Fewer than
  // three evidenced items, the flat list stands.
  const doItems = d.do || [];
  const nOf = (x) => x.evidence?.n_sources ?? 0;
  const evidenced = doItems.filter((x) => x.evidence?.n_sources != null);
  const buckets = evidenced.length >= 3 ? [
    ['dest.doEssential', doItems.filter((x) => nOf(x) >= 5)],
    ['dest.doIfTime', doItems.filter((x) => nOf(x) >= 2 && nOf(x) < 5)],
    ['dest.doOffTrail', doItems.filter((x) => nOf(x) < 2)],
  ].filter(([, xs]) => xs.length > 0) : [[null, doItems]];
  let doN = 0;
  const doBody = doItems.length ? `
    ${buckets.map(([key, items]) => `
      ${key ? `<h3>${esc(t(key))} <span class="mono">${items.length}</span></h3>` : ''}
      <ol class="dos">
        ${items.map((item) => {
          doN += 1;
          const evidence = item.evidence?.n_sources != null
            ? (item.evidence.method === 'open'
              ? (item.evidence.curated ? t('dest.evidenceCurated') : t('dest.evidenceOpen', { n: item.evidence.n_sources }))
              : t('dest.evidence', { n: item.evidence.n_sources, of: item.evidence.of }))
            : '';
          return `
          <li class="keep">
            <span class="do-n mono">${doN}</span>
            <div class="do-body">
              <div class="do-name">${esc(item.name)}
                <span class="do-type">${esc(t(`dest.doType.${item.type}`) || item.type)}</span>
              </div>
              ${item.detail ? `<div class="do-detail">${esc(item.detail)}</div>` : ''}
              <div class="do-meta">
                ${item.season?.length ? `<span class="do-season mono">${esc(monthRanges(item.season, M))}</span>` : ''}
                ${evidence ? `<span>${esc(evidence)}</span>` : ''}
                ${safeHref(item.link) ? link(activityLink(item.link, 'pdf')) : ''}
              </div>
            </div>
          </li>`;
        }).join('')}
      </ol>`).join('')}
    ${(links.getyourguide || links.viator) ? `<p class="note">${esc(t('pdf.bookNote'))} ${[
      links.getyourguide ? link(activityLink(links.getyourguide, 'pdf'), 'GetYourGuide') : '',
      links.viator ? link(activityLink(links.viator, 'pdf'), 'Viator') : '',
    ].filter(Boolean).join(' · ')}</p>` : ''}` : '';

  // -------------------------------------------------- trips
  // A day trip is a recommendation, so each card carries the reason: what
  // the place scores, what it is in one line, and how long the ride takes.
  const tripsBody = (d.trips || []).length ? `
    <div class="trips">
      ${d.trips.map((tr) => `
        <div class="trip keep">
          ${tr.image?.url ? `<img src="${esc(tr.image.url)}" alt="" ${IMG_FALLBACK}>` : '<span class="trip-noimg"></span>'}
          <div class="trip-body">
            <div class="trip-head">
              <span class="trip-name">${esc(tr.name)}</span>
              ${tr.rating?.score != null ? `<span class="trip-score mono">${tr.rating.score.toFixed(1)}</span>` : ''}
            </div>
            <div class="trip-sub">
              ${tr.kind === 'composed_trip'
                ? esc(t('dest.tripDays', { n: tr.days || 0 }))
                : tr.travel?.minutes != null
                  ? `<span class="mono">${tr.travel.minutes} min</span> ${esc(t(`mode.${tr.travel.mode}`) || tr.travel.mode)}${tr.dist_km != null ? ` · <span class="mono">${tr.dist_km} km</span>` : ''}`
                  : ''}
              ${tr.rating?.label ? ` · ${esc(tr.rating.label)}` : ''}
            </div>
            ${tr.blurb ? `<div class="trip-why">${esc(tr.blurb)}</div>` : ''}
          </div>
        </div>`).join('')}
    </div>` : '';

  // -------------------------------------------------- nearby nature
  const layers = ['trails', 'beaches', 'lakes', 'mountains'];
  const natRows = layers.flatMap((l) => (d.nearby?.[l] || []).slice(0, 4)
    .map((f) => ({ ...f, layer: l })));
  const natureBody = natRows.length ? `
    <div class="nat-grid">
      ${natRows.map((f) => `
        <div class="nat keep">
          ${f.thumb ? `<img src="${esc(f.thumb)}" alt="" ${IMG_FALLBACK}>` : '<span class="nat-noimg"></span>'}
          <div class="nat-body">
            <div class="nat-name">${esc(f.name)}</div>
            <div class="nat-sub">${esc(t(`dest.layerKind.${f.layer}`))}${
              f.km_len != null ? ` · ${f.km_len} km` : ''}${
              f.elev_m != null ? ` · ${f.elev_m} m` : ''}</div>
          </div>
          <span class="nat-km mono">${f.km} km ${esc(f.bearing || '')}</span>
        </div>`).join('')}
    </div>` : '';

  // -------------------------------------------------- festivals
  const festBody = (d.festivals || []).length ? `
    <div class="fests">
      ${d.festivals.slice(0, 8).map((f) => `
        <div class="fest keep">
          <span class="fest-when mono ${f.months?.length ? '' : 'is-undated'}">${f.months?.length
            ? esc(monthRanges(f.months, M))
            : esc(t('pdf.dateVaries'))}</span>
          <div class="fest-body">
            <div class="fest-name">${esc(f.name)}${arrow(f.url)}</div>
            ${f.what ? `<div class="fest-what">${esc(f.what)}</div>` : ''}
          </div>
        </div>`).join('')}
    </div>` : '';

  // -------------------------------------------------- costs
  const costBody = cost?.dayEur != null ? `
    <table class="receipt">
      <tr><td>${esc(t('cost.bed'))}</td><td class="mono">${esc(eur(cost.stayEur))}</td></tr>
      <tr><td>${esc(t('cost.food'))}</td><td class="mono">${esc(eur(cost.foodEur))}</td></tr>
      <tr class="sum"><td>${esc(t('cost.dayTotal'))}</td><td class="mono">${esc(eur(cost.dayEur))}</td></tr>
    </table>
    <p class="note">${esc(lifestyleLabel || '')} ${esc(t('pdf.costNote'))}</p>` : '';

  // -------------------------------------------------- when
  const whenBody = monthTable(d.when?.normals, d.when?.best, M, t)
    + (crowd ? `<p class="note">${esc(t('explore.whenCrowds', { label: crowd }))}</p>` : '');

  // -------------------------------------------------- parking
  const parkBody = (d.parking?.spots?.length || d.parking?.park_ride) ? `
    <ul class="parks">
      ${(d.parking.spots || []).slice(0, 6).map((s) => `
        <li class="keep">
          <div class="park-main">
            <div class="park-name">${esc(s.name || t('explore.parkUnnamed'))}</div>
            <div class="park-sub">${esc(t(s.fee === 'no' ? 'explore.parkFree' : s.fee === 'yes' ? 'explore.parkPaid' : 'explore.parkFeeUnknown'))}${s.capacity != null ? ` · <span class="mono">${s.capacity}</span>` : ''} · ${esc(t('dest.walkMin', { n: s.walk_min }))}</div>
          </div>
          <div class="park-links">${[link(s.nav?.gmaps, t('dest.navGmaps')), link(s.nav?.waze, t('dest.navWaze'))].filter(Boolean).join(' · ')}</div>
        </li>`).join('')}
      ${d.parking.park_ride ? `
        <li class="keep">
          <div class="park-main">
            <div class="park-name">${esc(d.parking.park_ride.name || t('explore.park.park_ride'))}</div>
            <div class="park-sub">${esc(t('explore.park.park_ride'))}${d.parking.park_ride.walk_min != null ? ` · ${esc(t('dest.walkMin', { n: d.parking.park_ride.walk_min }))}` : ''}</div>
          </div>
          <div class="park-links">${[link(d.parking.park_ride.nav?.gmaps, t('dest.navGmaps')), link(d.parking.park_ride.nav?.waze, t('dest.navWaze'))].filter(Boolean).join(' · ')}</div>
        </li>` : ''}
    </ul>
    <p class="note">${esc(t('explore.parkCredit'))}</p>` : '';

  // -------------------------------------------------- tips
  const tipArgs = (tip) => {
    const args = { ...(tip.args || {}) };
    if (args.from_m) args.from = M[args.from_m - 1];
    if (args.to_m) args.to = M[args.to_m - 1];
    if (args.month) args.month = M[args.month - 1];
    return args;
  };
  const tipsBody = (d.tips || []).length ? `
    <ul class="tips">
      ${d.tips.map((tip) => `<li>${esc(t(`tip.${tip.code}`, tipArgs(tip)))}</li>`).join('')}
    </ul>` : '';

  // -------------------------------------------------- practical links
  const linkRow = (label, url) => (safeHref(url) ? `<tr><td>${esc(label)}</td><td>${link(url)}</td></tr>` : '');
  const linkRows = [
    linkRow(t('dest.linkGflights'), links.flights_google),
    linkRow(t('dest.linkSkyscanner'), links.skyscanner),
    linkRow(t('dest.linkBooking'), links.booking),
    linkRow(t('dest.linkAirbnb'), links.airbnb),
    linkRow('GetYourGuide', links.getyourguide && activityLink(links.getyourguide, 'pdf')),
    linkRow('Viator', links.viator && activityLink(links.viator, 'pdf')),
  ].filter(Boolean);
  const linksBody = linkRows.length ? `
    <table class="linktable">${linkRows.join('')}</table>
    <p class="note">${esc(t('explore.furtherNote'))}</p>` : '';

  // -------------------------------------------------- credits
  const creditsBody = `
    ${credits.length ? `
      <h3>${esc(t('pdf.photoCredits'))}</h3>
      <ul class="credit-list">
        ${credits.map((c) => `
          <li>${c.caption ? `<b>${esc(c.caption)}</b>: ` : ''}${esc(c.author)}, ${esc(c.licence)}${safeHref(c.page) ? `, ${link(c.page)}` : ''}</li>`).join('')}
      </ul>` : ''}
    ${(d.credits || []).length ? `
    <h3>${esc(t('pdf.dataCredits'))}</h3>
    <ul class="credit-list">
      ${d.credits.map((c) => `<li>${esc(c.name)}, ${esc(c.licence)}${safeHref(c.url) ? `, ${link(c.url)}` : ''}</li>`).join('')}
    </ul>` : ''}
    <p class="note">${esc(t('pdf.generatedNote', { date: today }))}</p>`;

  // Two short sections share a row; a lone one takes the full width.
  const pair = (a, b) => {
    if (a && b) return `<div class="two two-secs">${a}${b}</div>`;
    return a || b || '';
  };

  const html = `<!doctype html><html lang="${esc(lang || 'en')}"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(city)} · Carta</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
    <style>
      /* Carta's own tokens, so a printed guide looks like the app that made
         it: warm alabaster ground on screen (white on paper), deep slate
         ink, terracotta for actions, ochre for measures, Fraunces on display
         and mono on every figure. */
      :root {
        --paper:#f8f6f0; --panel:#efece2; --card:#ffffff;
        --ink:#0f172a; --ink-soft:#414b5e; --ink-mute:#7d8393;
        --rule:#ccc7b8; --rule-soft:#e2ded1;
        --accent:#e05a47; --accent-bg:#f7dcd4;
        --rate:#8f5a0c; --rate-bg:#f6e6cb; --gem:#2c6e63; --gem-bg:#d9eae5;
        --display:'Fraunces','Iowan Old Style',Georgia,'Times New Roman',serif;
        --ui:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
        --mono:'JetBrains Mono',ui-monospace,'Cascadia Mono',Consolas,monospace;
      }
      * { box-sizing:border-box; margin:0; padding:0; }
      html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      body { font-family:var(--ui); color:var(--ink); background:var(--paper); line-height:1.5; font-size:10.5px; }
      .page { max-width:760px; margin:0 auto; padding:34px 40px 40px; }
      img { max-width:100%; }
      .mono { font-family:var(--mono); font-variant-numeric:tabular-nums; }
      .note { font-size:8.8px; color:var(--ink-mute); margin-top:6px; line-height:1.45; }
      .lnk { color:var(--accent); text-decoration:none; font-weight:600; white-space:nowrap; }
      .lnk::after { content:' ↗'; font-size:.85em; }
      .lnk-ico { margin-left:4px; font-size:.9em; }
      .lnk-ico::after { content:none; }
      .keep { break-inside:avoid; page-break-inside:avoid; }
      h3 { font-family:var(--mono); font-size:8.5px; font-weight:500; text-transform:uppercase; letter-spacing:.13em; color:var(--ink-mute); margin:0 0 5px; break-after:avoid; }
      h3 .mono { color:var(--ink-mute); }
      ul.plain { list-style:none; }
      ul.plain li { padding:2px 0 2px 11px; position:relative; font-size:10.5px; line-height:1.45; }
      ul.plain li::before { content:''; position:absolute; left:0; top:8px; width:4px; height:4px; border-radius:50%; background:var(--rate); }

      /* ---- cover ---- */
      .kicker { font-family:var(--mono); font-size:8.5px; letter-spacing:.2em; text-transform:uppercase; color:var(--accent); font-weight:500; }
      h1 { font-family:var(--display); font-size:40px; font-weight:600; line-height:1.02; letter-spacing:-.018em; margin:8px 0 2px; }
      .cover-country { font-size:12.5px; color:var(--ink-soft); margin-bottom:8px; }
      .cover-unesco { color:var(--rate); font-weight:600; }
      .verdict { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin:6px 0 10px; }
      .vscore { font-size:14px; font-weight:600; padding:3px 7px; border-radius:4px; background:var(--panel); color:var(--ink-soft); }
      .vscore.tier-3 { background:var(--rate); color:#fff; }
      .vscore.tier-2 { background:var(--rate-bg); color:var(--rate); }
      .vlabel { font-family:var(--display); font-size:15px; font-weight:600; color:var(--rate); }
      .vrank { font-size:10.5px; font-weight:600; color:var(--ink-soft); }
      .vgem { font-size:9px; font-weight:700; color:var(--gem); background:var(--gem-bg); border-radius:999px; padding:2px 8px; }
      .cover-lead { font-family:var(--display); font-size:14px; line-height:1.5; color:var(--ink-soft); max-width:600px; margin-bottom:12px; }
      .cover-strip { display:flex; gap:4px; margin:10px 0 4px; }
      .cover-strip img { height:138px; flex:1 1 0; object-fit:cover; min-width:0; border-radius:5px; }
      .cover-facts { display:flex; gap:22px; flex-wrap:wrap; margin-top:10px; padding-top:9px; border-top:1px solid var(--rule); }
      .cover-fact b { display:block; font-family:var(--mono); font-size:7.5px; font-weight:500; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-mute); }
      .cover-fact span { font-family:var(--mono); font-size:12.5px; font-weight:500; }

      /* ---- sections ---- */
      .sec { margin-top:20px; }
      .sec h2 { font-family:var(--display); font-size:17px; font-weight:600; letter-spacing:-.01em; border-bottom:1px solid var(--rule); padding-bottom:4px; margin-bottom:9px; break-after:avoid; page-break-after:avoid; }
      .about { font-size:10.8px; line-height:1.6; color:var(--ink-soft); columns:2; column-gap:22px; }
      .two { display:grid; grid-template-columns:1fr 1fr; gap:10px 22px; }
      .two-secs { align-items:start; }
      .two-secs .sec { margin-top:20px; min-width:0; }
      .rhythm { font-size:10.5px; color:var(--ink-soft); line-height:1.55; margin-top:8px; }
      .bookahead { font-size:10.5px; margin-top:6px; padding:6px 9px; background:var(--accent-bg); border-radius:5px; }
      .bookahead b { color:var(--accent); margin-right:3px; }

      /* ---- highlights: photograph first, the rest beside the map ---- */
      .n { display:inline-flex; align-items:center; justify-content:center; min-width:15px; height:15px; padding:0 4px; border-radius:8px; background:var(--accent); color:#fff; font-size:8.5px; font-weight:500; margin-right:5px; vertical-align:1px; }
      .hl-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:11px 10px; }
      .hl-card img { width:100%; height:104px; object-fit:cover; border-radius:5px; display:block; background:var(--panel); }
      .hl-card figcaption { padding-top:5px; }
      .hl-name { font-weight:600; font-size:10.8px; line-height:1.3; }
      .hl-sub { font-family:var(--mono); font-size:8px; color:var(--ink-mute); text-transform:uppercase; letter-spacing:.06em; margin:1px 0 2px; }
      .hl-fact { font-size:9.3px; color:var(--ink-soft); line-height:1.45; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
      .hl-tail { margin-top:11px; padding-top:9px; border-top:1px solid var(--rule-soft); }
      .hl-tail.has-map { display:grid; grid-template-columns:240px 1fr; gap:0 18px; align-items:start; }
      .hl-map img { width:100%; border-radius:5px; border:1px solid var(--rule-soft); display:block; }
      .hl-map .note { margin-top:4px; }
      .hl-more { list-style:none; columns:2; column-gap:18px; }
      .hl-tail.has-map .hl-more { columns:1; }
      .hl-more li { display:flex; align-items:baseline; gap:6px; font-size:10px; padding:2.5px 0; }
      .hl-more li b { flex:1; min-width:0; }
      .hl-more .hl-sub { margin:0; white-space:nowrap; }

      /* ---- things to do ---- */
      .dos { list-style:none; margin-bottom:6px; }
      .dos li { display:flex; gap:9px; padding:6px 0; border-bottom:1px solid var(--rule-soft); }
      .dos li:last-child { border-bottom:none; }
      .do-n { flex:none; width:17px; height:17px; border-radius:50%; background:var(--accent); color:#fff; font-size:8.8px; font-weight:500; display:flex; align-items:center; justify-content:center; margin-top:1px; }
      .do-body { min-width:0; flex:1; }
      .do-name { font-weight:600; font-size:11px; }
      .do-type { font-family:var(--mono); font-size:7px; font-weight:500; text-transform:uppercase; letter-spacing:.1em; color:var(--ink-mute); border:1px solid var(--rule); border-radius:3px; padding:1px 4px; margin-left:6px; vertical-align:2px; }
      .do-detail { font-size:10px; color:var(--ink-soft); line-height:1.5; margin-top:1px; }
      .do-meta { font-size:8.8px; color:var(--ink-mute); margin-top:2px; display:flex; gap:10px; flex-wrap:wrap; align-items:baseline; }
      .do-season { color:var(--rate); font-weight:500; }

      /* ---- day trips: the reason to go, not just the ride ---- */
      .trips { display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; }
      .trip { display:flex; gap:9px; padding-bottom:7px; border-bottom:1px solid var(--rule-soft); }
      .trip img, .trip-noimg { width:64px; height:50px; object-fit:cover; border-radius:4px; flex:none; background:var(--panel); }
      .trip-body { min-width:0; flex:1; }
      .trip-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
      .trip-name { font-weight:600; font-size:10.8px; }
      .trip-score { flex:none; font-size:9.3px; font-weight:500; color:var(--rate); background:var(--rate-bg); border-radius:3px; padding:1px 5px; }
      .trip-sub { font-size:8.8px; color:var(--ink-mute); margin-top:1px; }
      .trip-why { font-size:9.3px; color:var(--ink-soft); line-height:1.45; margin-top:2px; }

      /* ---- nature ---- */
      .nat-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; }
      .nat { display:flex; align-items:center; gap:8px; padding-bottom:6px; border-bottom:1px solid var(--rule-soft); }
      .nat img, .nat-noimg { width:46px; height:36px; object-fit:cover; border-radius:4px; flex:none; background:var(--panel); }
      .nat-body { flex:1; min-width:0; }
      .nat-name { font-weight:600; font-size:10px; }
      .nat-sub { font-family:var(--mono); font-size:7.5px; color:var(--ink-mute); text-transform:uppercase; letter-spacing:.05em; }
      .nat-km { flex:none; font-size:8.8px; color:var(--ink-soft); }

      /* ---- festivals: the date is the headline ---- */
      .fest { display:flex; gap:10px; padding:6px 0; border-bottom:1px solid var(--rule-soft); }
      .fest:last-child { border-bottom:none; }
      .fest-when { flex:none; width:64px; font-size:9px; font-weight:500; color:var(--rate); background:var(--rate-bg); border-radius:4px; padding:3px 5px; text-align:center; height:fit-content; }
      .fest-when.is-undated { color:var(--ink-mute); background:var(--panel); font-weight:400; }
      .fest-body { min-width:0; }
      .fest-name { font-weight:600; font-size:10.5px; }
      .fest-what { font-size:9.3px; color:var(--ink-soft); line-height:1.45; }

      /* ---- costs and climate ---- */
      .receipt { border-collapse:collapse; width:100%; }
      .receipt td { padding:5px 0; font-size:10.5px; border-bottom:1px solid var(--rule-soft); }
      .receipt td:last-child { text-align:right; padding-left:24px; font-family:var(--mono); }
      .receipt .sum td { border-top:1.5px solid var(--ink); border-bottom:none; font-weight:600; font-size:13.5px; padding-top:7px; }
      .months { display:flex; gap:2px; }
      .mcol { flex:1; text-align:center; padding:5px 0 6px; border-radius:4px; min-width:0; }
      .mcol.is-best { background:var(--rate-bg); }
      .mname { display:block; font-family:var(--mono); font-size:7px; text-transform:uppercase; letter-spacing:.04em; color:var(--ink-mute); }
      .mhi { display:block; font-size:10px; font-weight:600; margin-top:2px; }
      .mlo { display:block; font-size:8px; color:var(--ink-mute); }

      /* ---- parking, tips, links ---- */
      .parks { list-style:none; }
      .parks li { display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:5px 0; border-bottom:1px solid var(--rule-soft); }
      .parks li:last-child { border-bottom:none; }
      .park-main { min-width:0; }
      .park-name { font-weight:600; font-size:10.3px; }
      .park-sub { font-size:8.8px; color:var(--ink-mute); }
      .park-links { flex:none; font-size:9.3px; }
      .tips { list-style:none; background:var(--rate-bg); border-radius:7px; padding:10px 13px; }
      .tips li { font-size:10.3px; padding:3px 0 3px 13px; position:relative; line-height:1.5; }
      .tips li::before { content:''; position:absolute; left:0; top:9px; width:4px; height:4px; border-radius:50%; background:var(--rate); }
      .linktable { border-collapse:collapse; width:100%; }
      .linktable td { padding:4px 0; font-size:10px; border-bottom:1px solid var(--rule-soft); vertical-align:top; }
      .linktable td:first-child { font-weight:600; width:120px; }

      /* ---- credits ---- */
      .credits { margin-top:22px; padding-top:9px; border-top:1px solid var(--rule); }
      .credit-list { list-style:none; columns:2; column-gap:18px; }
      .credit-list li { font-size:7.8px; color:var(--ink-mute); padding:1.5px 0; line-height:1.45; break-inside:avoid; }
      .credit-list .lnk { font-weight:500; color:var(--ink-mute); }
      footer { margin-top:16px; padding-top:8px; border-top:1px solid var(--rule); font-size:8.5px; color:var(--ink-mute); display:flex; justify-content:space-between; gap:12px; }

      @page { size:A4; margin:12mm 12mm 14mm; }
      @media print {
        body { background:#fff; }
        .page { max-width:none; padding:0; }
        .sec { margin-top:16px; }
        a { color:var(--accent); }
      }
      @media (max-width:640px) {
        .page { padding:22px 18px 30px; }
        .about, .credit-list { columns:1; }
        .two, .trips, .nat-grid { grid-template-columns:1fr; }
        .hl-grid { grid-template-columns:1fr 1fr; }
        .hl-tail.has-map { grid-template-columns:1fr; }
        .hl-more { columns:1; }
      }
    </style></head><body><div class="page">
    <header class="cover">
      <div class="kicker">Carta · ${esc(t('pdf.guide'))}</div>
      <h1>${esc(city)}</h1>
      <div class="cover-country">${esc(country)}${unesco ? ` · <span class="cover-unesco">${esc(t('dest.unesco'))}</span>` : ''}</div>
      ${verdictLine}
      ${d.intro?.lead ? `<p class="cover-lead">${esc(d.intro.lead)}</p>` : ''}
      ${heroes.length ? `<div class="cover-strip">${heroes.map((g) => `<img src="${esc(g.url)}" alt="" loading="eager" ${IMG_FALLBACK}>`).join('')}</div>` : ''}
      ${facts.length ? `<div class="cover-facts">${facts.map(([k, v]) => `<div class="cover-fact"><b>${esc(k)}</b><span>${esc(v)}</span></div>`).join('')}</div>` : ''}
    </header>

    ${sec(t('dest.aboutTitle'), d.intro?.body ? `<p class="about">${esc(d.intro.body)}</p>` : '')}
    ${sec(t('dest.gettingTitle'), practicalBody, 'sec-practical')}
    ${sec(t('pdf.mustSee'), hlBody, 'sec-hl')}
    ${sec(t('dest.doTitle'), doBody, 'sec-do')}
    ${sec(t('dest.tripsTitle'), tripsBody, 'sec-trips')}
    ${pair(sec(t('cost.title'), costBody, 'sec-cost'), sec(t('explore.whenTitle'), whenBody, 'sec-when'))}
    ${sec(t('dest.natureTitle'), natureBody, 'sec-nature')}
    ${pair(sec(t('dest.tipsTitle'), tipsBody, 'sec-tips'), sec(t('dest.festivalsTitle'), festBody, 'sec-fests'))}
    ${pair(sec(t('explore.parkTitle'), parkBody, 'sec-park'), sec(t('pdf.practical'), linksBody, 'sec-links'))}
    <section class="credits">
      <h3>${esc(t('pdf.credits'))}</h3>
      ${creditsBody}
    </section>
    <footer><span>Carta · carta-europetravel.com</span><span class="mono">${esc(today)}</span></footer>
    </div></body></html>`;

  let w = win;
  if (!w || w.closed) {
    try { w = window.open('', '_blank'); } catch { w = null; }
  }
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();

  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    try { w.focus(); w.print(); } catch { /* window closed */ }
  };
  // Photographs are hotlinked from Commons: wait for them (and the fonts)
  // before printing, or the first print preview ships grey rectangles. Two
  // caps keep a stalled image from holding the whole document hostage: a
  // stalled photo has 3.5 s once the fonts are in, the whole thing 5 s.
  const waitImages = () => {
    const imgs = Array.from(w.document.images || []);
    const pending = imgs.filter((im) => !im.complete);
    if (!pending.length) { fire(); return; }
    let left = pending.length;
    const one = () => { left -= 1; if (left <= 0) fire(); };
    pending.forEach((im) => {
      im.addEventListener('load', one, { once: true });
      im.addEventListener('error', one, { once: true });
    });
    setTimeout(fire, 3500);
  };
  if (w.document.fonts?.ready) {
    w.document.fonts.ready.then(waitImages, waitImages);
  } else {
    setTimeout(waitImages, 300);
  }
  setTimeout(fire, 5000);
}
