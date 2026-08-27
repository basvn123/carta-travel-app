/**
 * destinationPdf.js, the printable destination guide.
 *
 * Renders from the SAME dossier contract the full-screen page reads
 * (public/dossier/{id}.json), so the PDF cannot drift from the app: one
 * contract, two renderers. Same delivery mechanism as dayPlanPdf.js, the
 * proven path in this codebase: build one standalone document, open it in a
 * new window, wait for fonts and photographs, print. The reader saves it as
 * PDF from the print dialog.
 *
 * The three-month rule decides what is on the paper: climate normals yes,
 * this week's forecast no; the euro day cost with its provenance yes, live
 * fares no. Where the app shows a live product the PDF prints the search
 * link instead.
 *
 * The licence gate travels with the images: only photographs whose licence
 * allows redistribution WITH their author resolved (img.ok_print, decided in
 * pipeline/dossier/build_dossier.py) are embedded, and every one of them is
 * listed again on the closing credits page with author, licence and source.
 * An uncredited photo does not ship, full stop.
 */

import { eur } from './format.js';
import { activityLink } from './activityAffiliates.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const okImg = (img) => img && img.url && img.ok_print;

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

function monthTable(normals, best, t) {
  if (!normals?.length) return '';
  const bestSet = new Set(best || []);
  const cells = normals.map((m, i) => `
    <div class="mcol ${bestSet.has(i + 1) ? 'is-best' : ''}">
      <span class="mname">${MONTHS[i]}</span>
      <span class="mhi mono">${Math.round(m[0])}°</span>
      <span class="mlo mono">${Math.round(m[1])}°</span>
    </div>`).join('');
  return `
    <div class="months">${cells}</div>
    <p class="note">${esc(t('pdf.monthsNote'))}${best?.length ? ` ${esc(t('pdf.bestMonths', { months: best.map((m) => MONTHS[m - 1]).join(', ') }))}` : ''}</p>`;
}

export function openDestinationPdf({
  dossier, destination, cost, t, lang, lifestyleLabel, mapSnapshot,
}) {
  if (!dossier || !destination) return;
  const d = dossier;
  const city = (destination.city || d.place?.name || '').replace(/\s*\([^)]*\)\s*$/, '');
  const country = destination.country || d.place?.country || '';
  const heroes = (d.gallery || []).filter(okImg).slice(0, 5);
  const credits = creditRows(d);
  const links = d.practical?.links || {};
  const today = new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { dateStyle: 'long' }).format(new Date());

  const sec = (title, body, cls = '') => (body ? `
    <section class="sec ${cls}">
      <h2>${esc(title)}</h2>
      ${body}
    </section>` : '');

  // -------------------------------------------------- highlights
  // The must-sees, big, with room for the fact sentence. The printed map is
  // gone on purpose: a static basemap crop with a few dots told a reader
  // nothing they could act on, and it cost a third of a page that the
  // photographs earn back.
  const hl = (d.highlights || []);
  // The picture cards go to the highest-ranked highlights that HAVE a
  // printable photograph, in rank order; everything else keeps its place in
  // the list underneath. Both halves matter: ordering by rank alone gave
  // Valbona three grey rectangles where its peaks have no photo, and
  // ordering by photo alone (an earlier cut) buried the Eiffel Tower under
  // Pere Lachaise. Nothing is hidden either way, only laid out differently.
  const hlLead = hl.filter((h) => okImg(h.image)).slice(0, 6);
  const leadSet = new Set(hlLead);
  const hlRest = hl.filter((h) => !leadSet.has(h)).slice(0, 10);
  const hlBody = hl.length ? `
    <div class="hl-grid">
      ${hlLead.map((h, i) => `
        <figure class="hl-card">
          <img src="${esc(h.image.url)}" alt="">
          <figcaption>
            <div class="hl-name"><span class="hl-n mono">${i + 1}</span>${esc(h.name)}</div>
            <div class="hl-sub">${esc(h.kind || '')}${h.dist_km != null ? ` · <span class="mono">${h.dist_km} km</span>` : ''}</div>
            ${h.fact ? `<div class="hl-fact">${esc(h.fact)}</div>` : ''}
          </figcaption>
        </figure>`).join('')}
    </div>
    ${hlRest.length ? `
      <ul class="hl-more">
        ${hlRest.map((h) => `
          <li><b>${esc(h.name)}</b><span>${esc(h.kind || '')}${h.dist_km != null ? ` · ${h.dist_km} km` : ''}</span></li>`).join('')}
      </ul>` : ''}` : '';

  // -------------------------------------------------- things to do
  const doBody = (d.do || []).length ? `
    <ol class="dos">
      ${(d.do || []).map((item, i) => `
        <li>
          <span class="do-n mono">${i + 1}</span>
          <div class="do-body">
            <div class="do-name">${esc(item.name)}
              <span class="do-type">${esc(t(`dest.doType.${item.type}`) || item.type)}</span>
            </div>
            ${item.detail ? `<div class="do-detail">${esc(item.detail)}</div>` : ''}
            <div class="do-meta">
              ${item.season?.length ? `<span class="do-season mono">${item.season.map((m) => MONTHS[m - 1]).join(', ')}</span>` : ''}
              ${item.evidence?.n_sources != null ? `<span>${esc(
                item.evidence.method === 'open'
                  ? (item.evidence.curated
                    ? t('dest.evidenceCurated')
                    : t('dest.evidenceOpen', { n: item.evidence.n_sources }))
                  : t('dest.evidence', { n: item.evidence.n_sources, of: item.evidence.of })
              )}</span>` : ''}
              ${item.link ? `<span class="link">${esc(activityLink(item.link, 'pdf'))}</span>` : ''}
            </div>
          </div>
        </li>`).join('')}
    </ol>
    <p class="note">${esc(t('pdf.bookNote'))}<br>
      ${links.getyourguide ? `GetYourGuide: <span class="link">${esc(activityLink(links.getyourguide, 'pdf'))}</span><br>` : ''}
      ${links.viator ? `Viator: <span class="link">${esc(activityLink(links.viator, 'pdf'))}</span>` : ''}
    </p>` : '';

  // -------------------------------------------------- trips
  // A day trip is a recommendation, so each card carries the reason: what the
  // place scores, what it is in one line, and how long the ride takes.
  const tripsBody = (d.trips || []).length ? `
    <div class="trips">
      ${(d.trips || []).map((tr) => `
        <div class="trip">
          ${tr.image?.url ? `<img src="${esc(tr.image.url)}" alt="">` : '<span class="trip-noimg"></span>'}
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
        <div class="nat">
          ${f.thumb ? `<img src="${esc(f.thumb)}" alt="">` : '<span class="nat-noimg"></span>'}
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
  // Its own section, and the date leads: "there is a film festival" answers
  // nothing without a month, so undated ones say so rather than implying one.
  const festBody = (d.festivals || []).length ? `
    <div class="fests">
      ${d.festivals.map((f) => `
        <div class="fest">
          <span class="fest-when mono">${f.months?.length
            ? esc(f.months.map((m) => MONTHS[m - 1]).join(', '))
            : `<span class="fest-nodate">${esc(t('pdf.dateVaries'))}</span>`}</span>
          <div class="fest-body">
            <div class="fest-name">${esc(f.name)}</div>
            ${f.what ? `<div class="fest-what">${esc(f.what)}</div>` : ''}
            ${f.url ? `<div class="link">${esc(f.url)}</div>` : ''}
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

  // -------------------------------------------------- parking
  const parkBody = (d.parking?.spots?.length || d.parking?.park_ride) ? `
    <ul class="parks">
      ${(d.parking.spots || []).map((s) => `
        <li>
          <div class="park-name">${esc(s.name || t('explore.parkUnnamed'))}</div>
          <div class="park-sub">${esc(t(s.fee === 'no' ? 'explore.parkFree' : s.fee === 'yes' ? 'explore.parkPaid' : 'explore.parkFeeUnknown'))}${s.capacity != null ? ` · <span class="mono">${s.capacity}</span>` : ''} · ${esc(t('dest.walkMin', { n: s.walk_min }))}</div>
          <div class="park-links">
            <span class="link">${esc(s.nav.gmaps)}</span><br>
            <span class="link">${esc(s.nav.waze)}</span>
          </div>
        </li>`).join('')}
      ${d.parking.park_ride ? `
        <li>
          <div class="park-name">${esc(d.parking.park_ride.name || t('explore.park.park_ride'))} (${esc(t('explore.park.park_ride'))})</div>
          <div class="park-links"><span class="link">${esc(d.parking.park_ride.nav.gmaps)}</span></div>
        </li>` : ''}
    </ul>
    <p class="note">${esc(t('explore.parkCredit'))}</p>` : '';

  // -------------------------------------------------- tips
  const tipArgs = (tip) => {
    const args = { ...(tip.args || {}) };
    if (args.from_m) args.from = MONTHS[args.from_m - 1];
    if (args.to_m) args.to = MONTHS[args.to_m - 1];
    if (args.month) args.month = MONTHS[args.month - 1];
    return args;
  };
  const tipsBody = (d.tips || []).length ? `
    <ul class="tips">
      ${d.tips.map((tip) => `<li>${esc(t(`tip.${tip.code}`, tipArgs(tip)))}</li>`).join('')}
    </ul>` : '';

  // -------------------------------------------------- practical links
  const linkRow = (label, url) => (url ? `<tr><td>${esc(label)}</td><td class="link">${esc(url)}</td></tr>` : '');
  const practicalBody = `
    <table class="linktable">
      ${linkRow(t('dest.linkGflights'), links.flights_google)}
      ${linkRow(t('dest.linkSkyscanner'), links.skyscanner)}
      ${linkRow(t('dest.linkBooking'), links.booking)}
      ${linkRow(t('dest.linkAirbnb'), links.airbnb)}
      ${linkRow('GetYourGuide', links.getyourguide && activityLink(links.getyourguide, 'pdf'))}
      ${linkRow('Viator', links.viator && activityLink(links.viator, 'pdf'))}
    </table>
    <p class="note">${esc(t('explore.furtherNote'))}</p>`;

  // -------------------------------------------------- credits page
  const creditsBody = `
    ${credits.length ? `
      <h3>${esc(t('pdf.photoCredits'))}</h3>
      <ul class="credit-list">
        ${credits.map((c) => `
          <li>${c.caption ? `<b>${esc(c.caption)}</b>: ` : ''}${esc(c.author)}, ${esc(c.licence)}${c.page ? `, <span class="link">${esc(c.page)}</span>` : ''}</li>`).join('')}
      </ul>` : ''}
    <h3>${esc(t('pdf.dataCredits'))}</h3>
    <ul class="credit-list">
      ${(d.credits || []).map((c) => `<li>${esc(c.name)}, ${esc(c.licence)}, <span class="link">${esc(c.url)}</span></li>`).join('')}
    </ul>
    <p class="note">${esc(t('pdf.generatedNote', { date: today }))}</p>`;

  const html = `<!doctype html><html lang="${esc(lang || 'en')}"><head><meta charset="utf-8">
    <title>${esc(city)}, ${esc(t('pdf.guide'))}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
    <style>
      /* Carta's own tokens, so a printed guide looks like the app that made
         it: warm alabaster ground, deep slate ink, terracotta for actions,
         ochre for measures, Fraunces on display and mono on every figure. */
      :root {
        --paper:#f8f6f0; --panel:#efece2; --card:#ffffff;
        --ink:#0f172a; --ink-soft:#414b5e; --ink-mute:#7d8393;
        --rule:#ccc7b8; --rule-soft:#e2ded1;
        --accent:#e05a47; --accent-bg:#f7dcd4;
        --rate:#8f5a0c; --rate-bg:#f6e6cb;
        --display:'Fraunces','Iowan Old Style',Georgia,'Times New Roman',serif;
        --ui:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
        --mono:'JetBrains Mono',ui-monospace,'Cascadia Mono',Consolas,monospace;
      }
      * { box-sizing:border-box; margin:0; padding:0; }
      html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
      body { font-family:var(--ui); color:var(--ink); background:var(--paper); padding:38px 44px; line-height:1.55; font-size:11.5px; }
      .mono { font-family:var(--mono); font-variant-numeric:tabular-nums; }
      .link { font-family:var(--mono); font-size:8.5px; color:var(--ink-mute); word-break:break-all; }
      .note { font-size:9.5px; color:var(--ink-mute); margin-top:8px; line-height:1.5; }
      a { color:inherit; text-decoration:none; }

      /* ---- cover ---- */
      .cover { page-break-after:avoid; }
      .kicker { font-family:var(--mono); font-size:9px; letter-spacing:.2em; text-transform:uppercase; color:var(--accent); font-weight:500; }
      h1 { font-family:var(--display); font-size:44px; font-weight:600; line-height:1.02; letter-spacing:-.018em; margin:12px 0 3px; }
      .cover-country { font-size:13px; color:var(--ink-soft); margin-bottom:14px; }
      .cover-unesco { color:var(--rate); font-weight:600; }
      .cover-lead { font-family:var(--display); font-size:15px; line-height:1.5; color:var(--ink-soft); max-width:600px; margin-bottom:16px; }
      .cover-strip { display:flex; gap:5px; margin:16px 0 4px; }
      .cover-strip img { height:158px; flex:1 1 0; object-fit:cover; min-width:0; border-radius:6px; }
      .cover-facts { display:flex; gap:30px; margin-top:14px; padding-top:11px; border-top:1px solid var(--rule); }
      .cover-fact b { display:block; font-family:var(--mono); font-size:8px; font-weight:500; letter-spacing:.14em; text-transform:uppercase; color:var(--ink-mute); }
      .cover-fact span { font-family:var(--mono); font-size:14px; font-weight:500; }

      /* ---- sections ---- */
      .sec { margin-top:28px; page-break-inside:auto; }
      .sec h2 { font-family:var(--display); font-size:20px; font-weight:600; letter-spacing:-.01em; border-bottom:1px solid var(--rule); padding-bottom:6px; margin-bottom:12px; }
      .sec h3 { font-family:var(--mono); font-size:9px; font-weight:500; text-transform:uppercase; letter-spacing:.13em; color:var(--ink-mute); margin:12px 0 6px; }
      .about { font-size:12px; line-height:1.7; max-width:640px; color:var(--ink-soft); }

      /* ---- must-sees: photograph first, big enough to be worth printing ---- */
      .hl-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px 12px; }
      .hl-card { break-inside:avoid; }
      .hl-card img, .hl-noimg { width:100%; height:112px; object-fit:cover; border-radius:6px; display:block; background:var(--panel); }
      .hl-card figcaption { padding-top:6px; }
      .hl-name { font-weight:600; font-size:11.5px; line-height:1.3; }
      .hl-n { display:inline-block; min-width:14px; color:var(--accent); font-size:9.5px; font-weight:500; }
      .hl-sub { font-family:var(--mono); font-size:8.5px; color:var(--ink-mute); text-transform:uppercase; letter-spacing:.06em; margin:2px 0 3px; }
      .hl-fact { font-size:10px; color:var(--ink-soft); line-height:1.5; }
      .hl-more { list-style:none; display:grid; grid-template-columns:1fr 1fr; gap:0 20px; margin-top:12px; padding-top:8px; border-top:1px solid var(--rule-soft); }
      .hl-more li { display:flex; justify-content:space-between; gap:12px; font-size:10.5px; padding:3px 0; }
      .hl-more span { font-family:var(--mono); font-size:8.5px; color:var(--ink-mute); white-space:nowrap; }

      /* ---- things to do ---- */
      .dos { list-style:none; counter-reset:none; }
      .dos li { display:flex; gap:12px; padding:9px 0; border-bottom:1px solid var(--rule-soft); break-inside:avoid; }
      .dos li:last-child { border-bottom:none; }
      .do-n { flex:none; width:19px; height:19px; border-radius:50%; background:var(--accent); color:#fff; font-size:9.5px; font-weight:500; display:flex; align-items:center; justify-content:center; margin-top:1px; }
      .do-name { font-weight:600; font-size:12px; }
      .do-type { font-family:var(--mono); font-size:7.5px; font-weight:500; text-transform:uppercase; letter-spacing:.1em; color:var(--ink-mute); border:1px solid var(--rule); border-radius:3px; padding:1px 5px; margin-left:8px; vertical-align:2px; }
      .do-detail { font-size:10.5px; color:var(--ink-soft); line-height:1.55; margin-top:2px; }
      .do-meta { font-size:9px; color:var(--ink-mute); margin-top:3px; display:flex; gap:12px; flex-wrap:wrap; align-items:baseline; }
      .do-season { color:var(--rate); font-weight:500; }

      /* ---- day trips: the reason to go, not just the ride ---- */
      .trips { display:grid; grid-template-columns:1fr 1fr; gap:10px 16px; }
      .trip { display:flex; gap:10px; break-inside:avoid; padding-bottom:9px; border-bottom:1px solid var(--rule-soft); }
      .trip img, .trip-noimg { width:72px; height:56px; object-fit:cover; border-radius:5px; flex:none; background:var(--panel); }
      .trip-body { min-width:0; }
      .trip-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
      .trip-name { font-weight:600; font-size:11.5px; }
      .trip-score { flex:none; font-size:10px; font-weight:500; color:var(--rate); background:var(--rate-bg); border-radius:3px; padding:1px 5px; }
      .trip-sub { font-size:9.5px; color:var(--ink-mute); margin-top:1px; }
      .trip-why { font-size:10px; color:var(--ink-soft); line-height:1.5; margin-top:3px; }

      /* ---- nature ---- */
      .nat-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 16px; }
      .nat { display:flex; align-items:center; gap:9px; break-inside:avoid; padding-bottom:7px; border-bottom:1px solid var(--rule-soft); }
      .nat img, .nat-noimg { width:52px; height:40px; object-fit:cover; border-radius:5px; flex:none; background:var(--panel); }
      .nat-body { flex:1; min-width:0; }
      .nat-name { font-weight:600; font-size:10.5px; }
      .nat-sub { font-family:var(--mono); font-size:8px; color:var(--ink-mute); text-transform:uppercase; letter-spacing:.05em; }
      .nat-km { flex:none; font-size:9px; color:var(--ink-soft); }

      /* ---- festivals: the date is the headline ---- */
      .fests { display:grid; gap:0; }
      .fest { display:flex; gap:14px; padding:8px 0; border-bottom:1px solid var(--rule-soft); break-inside:avoid; }
      .fest:last-child { border-bottom:none; }
      .fest-when { flex:none; width:74px; font-size:10px; font-weight:500; color:var(--rate); background:var(--rate-bg); border-radius:4px; padding:3px 6px; text-align:center; height:fit-content; }
      .fest-nodate { color:var(--ink-mute); font-weight:400; }
      .fest-name { font-weight:600; font-size:11.5px; }
      .fest-what { font-size:10px; color:var(--ink-soft); line-height:1.5; }

      .receipt { border-collapse:collapse; min-width:290px; }
      .receipt td { padding:6px 0; font-size:11.5px; border-bottom:1px solid var(--rule-soft); }
      .receipt td:last-child { text-align:right; padding-left:40px; font-family:var(--mono); }
      .receipt .sum td { border-top:1.5px solid var(--ink); border-bottom:none; font-weight:600; font-size:15px; padding-top:8px; }

      .months { display:flex; gap:2px; }
      .mcol { flex:1; text-align:center; padding:6px 0 7px; border-radius:4px; }
      .mcol.is-best { background:var(--rate-bg); }
      .mname { display:block; font-family:var(--mono); font-size:8px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-mute); }
      .mhi { display:block; font-size:11.5px; font-weight:600; margin-top:3px; }
      .mlo { display:block; font-size:9px; color:var(--ink-mute); }

      .parks { list-style:none; }
      .parks li { padding:7px 0; border-bottom:1px solid var(--rule-soft); break-inside:avoid; }
      .park-name { font-weight:600; font-size:11px; }
      .park-sub { font-size:9.5px; color:var(--ink-mute); margin:1px 0 3px; }

      .tips { list-style:none; background:var(--rate-bg); border-radius:8px; padding:13px 17px; }
      .tips li { font-size:11px; padding:4px 0 4px 15px; position:relative; line-height:1.55; }
      .tips li::before { content:''; position:absolute; left:0; top:11px; width:5px; height:5px; border-radius:50%; background:var(--rate); }

      .linktable { border-collapse:collapse; width:100%; }
      .linktable td { padding:5px 0; font-size:10.5px; border-bottom:1px solid var(--rule-soft); vertical-align:top; }
      .linktable td:first-child { font-weight:600; width:130px; }

      .credits-page { page-break-before:always; }
      .credit-list { list-style:none; }
      .credit-list li { font-size:8.5px; color:var(--ink-mute); padding:2.5px 0; line-height:1.5; }

      footer { margin-top:36px; padding-top:11px; border-top:1px solid var(--rule); font-size:9px; color:var(--ink-mute); display:flex; justify-content:space-between; gap:12px; }
      @page { margin:14mm; }
      @media print { body { padding:0; } }
    </style></head><body>
    <header class="cover">
      <div class="kicker">Carta · ${esc(t('pdf.guide'))}</div>
      <h1>${esc(city)}</h1>
      <div class="cover-country">${esc(country)}${
        (d.place?.designations || []).some((g) => g.kind === 'unesco_whc')
          ? ` · <span class="cover-unesco">${esc(t('dest.unesco'))}</span>` : ''
      }</div>
      ${d.intro?.lead ? `<p class="cover-lead">${esc(d.intro.lead)}</p>` : ''}
      ${heroes.length ? `<div class="cover-strip">${heroes.map((g) => `<img src="${esc(g.url)}" alt="">`).join('')}</div>` : ''}
      <div class="cover-facts">
        ${d.place?.visit_h != null ? `<div class="cover-fact"><b>${esc(t('pdf.factVisit'))}</b><span>${Math.round(d.place.visit_h)} h</span></div>` : ''}
        ${d.intro?.facts?.population ? `<div class="cover-fact"><b>${esc(t('pdf.factPop'))}</b><span>${Number(d.intro.facts.population).toLocaleString('en-GB')}</span></div>` : ''}
        ${d.when?.best?.length ? `<div class="cover-fact"><b>${esc(t('pdf.factBest'))}</b><span>${d.when.best.map((m) => MONTHS[m - 1]).join(', ')}</span></div>` : ''}
        ${cost?.dayEur != null ? `<div class="cover-fact"><b>${esc(t('pdf.factDay'))}</b><span>${esc(eur(cost.dayEur))}</span></div>` : ''}
      </div>
    </header>

    ${sec(t('dest.aboutTitle'), d.intro?.body ? `<p class="about">${esc(d.intro.body)}</p>` : '')}
    ${sec(t('pdf.mustSee'), hlBody, 'sec-hl')}
    ${sec(t('dest.doTitle'), doBody)}
    ${sec(t('dest.tripsTitle'), tripsBody)}
    ${sec(t('dest.natureTitle'), natureBody)}
    ${sec(t('cost.title'), costBody)}
    ${sec(t('dest.festivalsTitle'), festBody)}
    ${sec(t('explore.whenTitle'), monthTable(d.when?.normals, d.when?.best, t))}
    ${sec(t('dest.tipsTitle'), tipsBody)}
    ${sec(t('explore.parkTitle'), parkBody)}
    ${sec(t('pdf.practical'), practicalBody)}
    <section class="sec credits-page">
      <h2>${esc(t('pdf.credits'))}</h2>
      ${creditsBody}
    </section>
    <footer><span>Carta · carta-europetravel.com</span><span class="mono">${esc(today)}</span></footer>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();

  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    try { w.focus(); w.print(); } catch { /* window closed */ }
  };
  // Photographs are hotlinked from Commons: wait for them (and the fonts)
  // before printing, or the first print preview ships grey rectangles. The
  // timeout keeps a stalled image from holding the whole document hostage.
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
  };
  if (w.document.fonts?.ready) {
    w.document.fonts.ready.then(waitImages);
  } else {
    setTimeout(waitImages, 300);
  }
  setTimeout(fire, 6000);
}
