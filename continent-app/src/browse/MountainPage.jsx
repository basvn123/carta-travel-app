import React, { useEffect, useMemo, useState } from 'react';
import '../styles/items.css';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { useI18n } from '../i18n/index.jsx';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { PlaceMap } from './DetailSkeleton.jsx';
import { ItemIcon } from './ItemParts.jsx';
import { Button } from '../components/ui/index.js';
import { formatMoney } from '../lib/money.js';
import { toPhotos } from '../lib/itemPhotos.js';
import { beforeGoItems } from '../lib/beforeGo.js';
import { useItemPdf } from '../hooks/useItemPdf.js';
import { usePlaceExits } from '../hooks/usePlaceExits.js';
import { keyFactCells, pointCentre, MOUNTAIN_LEVEL, capFirst } from '../lib/detailSkeleton.js';
import { notForLines } from '../lib/notFor.js';
import { natureRankLine } from '../lib/rating.js';
import { featureHref, linkOpener } from '../lib/featureHref.js';
import { loadTrails } from '../lib/trails.js';
import {
  mountainHeadline, mountainWhy, mountainTags, mountainHazards,
  bestForLabel, componentLabel, liftLabel, isLiftServed, isHiddenGem,
  mountainRating, COMPONENT_ORDER, SUB_ORDER,
  difficultyLabel, accessLabels, mountainHighlights,
} from '../lib/mountainStory.js';
import { mountainShareUrl, loadMountains } from '../lib/mountains.js';
import { trailheadDirectionsUrl, shareTrailLink } from '../lib/trailExport.js';
import {
  MapPinIcon, DownloadIcon, BedIcon, GondolaIcon, RouteIcon, ChevronRightIcon, SnowIcon,
  StormIcon, FriendsIcon, MountainIcon, ParkingIcon,
} from '../components/Icons.jsx';
import { rangeRankLine, slopeFact, liftFareLine, flankHuts, SummitForecast } from './PeakFacts.jsx';
import {
  OutdoorPage, PSection, StayLine, RouteBlock, CheckRows, MonthStrip, SafetyBlock,
  OtherNearby, OxLinkButton, outdoorPdfModel, monthIndex, useMonthWords, pointRow, SAC_STEP,
} from './OutdoorParts.jsx';
import { scrollToSection } from './PageTemplate.jsx';

/**
 * The mountain page: one published summit, and how people climb it.
 *
 * Since T921 it stands on the place page's template (OutdoorParts.jsx, the
 * owner's approved spec of 2026-10-30). The head (the name, the Score with
 * the rank in the region, the range), the facts (height, prominence, the
 * way up, the season, the hut), a jump bar, then: Routes to the top first
 * (each a card that opens its trail page, because that is how people climb
 * it), Huts and lifts (the hut and the lift with their seasons and prices,
 * the way up and the ways in), When to go (the season months, the summit's
 * modelled temperature by month, snow, storms and crowds where the data has
 * them, the summit forecast), Before you go (the hazards, the slope, the
 * safety block), and Other peaks. The side card holds the one primary, "Add
 * to a day plan", with the routes, Directions and a priced "Stay nearby".
 *
 * Nothing on this page is a route description. The pipeline never generates
 * one, this page never asks for one, and the hazard block says to check
 * conditions locally, because a wrong sentence about a mountain is the one
 * kind of wrong sentence in this app that can hurt somebody.
 */

// Where the lift claim came from, spelled out (T180).
const SRC_KEY = { osm: 'mtn.liftSrcOsm', curated: 'mtn.liftSrcCurated', wiki: 'mtn.liftSrcWiki' };
const GRADE_KEY = {
  easy: 'trails.gradeEasy', moderate: 'trails.gradeModerate', hard: 'trails.gradeHard',
  very_hard: 'trails.gradeVeryHard', alpine: 'trails.gradeAlpine',
};

/** The way up as a level on the strip's five squares. */
const mountainLevel = (m) => MOUNTAIN_LEVEL[m?.diff?.k] || 0;

/** A run of months (1 to 12) as one from-to pair, wrapping over the new
 *  year; null when the months are not one run. */
function monthRun(list) {
  const on = new Set(list);
  if (!on.size || on.size >= 12) return null;
  const start = [...on].find((m) => !on.has(m === 1 ? 12 : m - 1));
  if (start == null) return null;
  let end = start;
  let n = 1;
  while (on.has(end === 12 ? 1 : end + 1) && n < 12) { end = end === 12 ? 1 : end + 1; n += 1; }
  return n === on.size ? { from: start, to: end } : null;
}

export function MountainPage({ mountain, countryName, onClose, onSelectDest, onOpenNeighbour, fav = false, onFav = null, onAddToDay = null, backLabel = '' }) {
  const { t, lang } = useI18n();
  const months = useMonthWords();
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  // Three ways out, from the same country's mountains (T180).
  const exits = usePlaceExits({
    me: mountain,
    cc: mountain?.cc,
    load: loadMountains,
    centre: pointCentre,
    level: mountainLevel,
    baseOf: (r) => r?.near?.dest_id || null,
    open: (row) => onOpenNeighbour?.('peak', row),
  });

  // The routes to the top open their trail pages in place: their rows come
  // from the country's trail list (cached), else the link's own address.
  const routes = useMemo(() => (Array.isArray(mountain?.routes) ? mountain.routes : [])
    .filter((r) => r && r.id != null && r.name), [mountain]);
  const routeCcs = [...new Set(routes.map((r) => r.cc || mountain?.cc).filter(Boolean))].join('|');
  const [trailRows, setTrailRows] = useState(null);
  useEffect(() => {
    let live = true;
    setTrailRows(null);
    if (!routeCcs) return undefined;
    Promise.all(routeCcs.split('|').map((cc) => Promise.resolve(loadTrails(cc)).catch(() => [])))
      .then((lists) => {
        if (!live) return;
        const m = new Map();
        for (const list of lists) for (const r of (Array.isArray(list) ? list : [])) m.set(String(r.id), r);
        setTrailRows(m);
      });
    return () => { live = false; };
  }, [routeCcs]);

  const images = useMemo(() => mountain?.images || [], [mountain]);
  const why = useMemo(() => (mountain ? mountainWhy(mountain, t) : []), [mountain, t]);
  const tags = useMemo(() => (mountain ? mountainTags(mountain, t, 4) : []), [mountain, t]);
  const rating = useMemo(() => (mountain ? mountainRating(mountain, t) : null), [mountain, t]);
  const hazards = useMemo(() => (mountain ? mountainHazards(mountain, t) : []), [mountain, t]);
  const headline = useMemo(
    () => (mountain ? mountainHeadline(mountain, t, countryName) : ''),
    [mountain, t, countryName],
  );
  const highlights = useMemo(() => (mountain ? mountainHighlights(mountain, t) : []), [mountain, t]);
  const photos = useMemo(() => toPhotos(images, { fallbackCaption: mountain?.name || '' }), [images, mountain?.name]);
  const { onPdf, pdfBusy } = useItemPdf('mountain', mountain, { countryName });

  if (!mountain) return null;

  const nf = (v) => Math.round(v).toLocaleString(lang);
  const mapsUrl = trailheadDirectionsUrl(mountain.lat, mountain.lon);
  const onShare = async () => {
    const how = await shareTrailLink(mountain.name, mountainShareUrl(mountain));
    if (how === 'copied') setToast(t('trip.linkCopied'));
  };

  /* The season: the climatology's months, else the from-to of the row. */
  const season = mountain.season || null;
  const goodMonths = Array.isArray(season?.months) ? season.months.filter((m) => m >= 1 && m <= 12) : [];
  const run = goodMonths.length ? monthRun(goodMonths) : null;
  const sFrom = run?.from || monthIndex(season?.from);
  const sTo = run?.to || monthIndex(season?.to);
  const seasonText = season?.n >= 12 ? t('detail.seasonAllYear')
    : sFrom && sTo ? t('detail.monthRange', { from: months.short(sFrom), to: months.short(sTo) }) : '';

  /* The hut and the lift: the contract's records first, the why codes after. */
  const hutInfo = mountain.hut_info && mountain.hut_info.name ? mountain.hut_info : null;
  const hutWhy = (mountain.why || []).find((w) => w.k === 'hut' && w.name);
  const hutName = hutInfo?.name || hutWhy?.name || '';
  const hutFact = hutName ? (Number.isFinite(hutInfo?.ele) ? `${hutName}, ${nf(hutInfo.ele)} m` : hutName) : '';
  const liftInfo = mountain.lift_info && mountain.lift_info.name ? mountain.lift_info : null;
  const lift = mountain.lift || null;
  const ride = isLiftServed(mountain);
  const wayUp = ride ? liftLabel(mountain, t) : difficultyLabel(mountain, t);
  const liftReturn = Number(liftInfo?.return_eur);

  const keyFacts = keyFactCells([
    { key: 'ele', label: t('mtn.factHeight'), value: mountain.ele != null ? `${nf(mountain.ele)} m` : '' },
    mountain.prom != null && {
      key: 'prom',
      label: t('mtn.factProminence'),
      value: `${mountain.promSrc === 'dem_min' ? t('ox.atLeast', { v: nf(mountain.prom) }) : nf(mountain.prom)} m`,
    },
    { key: 'way', label: t('detail.factWayUp'), value: wayUp },
    seasonText && { key: 'season', label: t('detail.factSeason'), value: seasonText, note: season?.est || season?.months ? t('ox.estimated') : null },
    hutFact && { key: 'sleep', label: t('ox.fact.hut'), value: hutFact },
    mountain.isoKm != null && { key: 'iso', label: t('mtn.factIsolation'), value: `${mountain.isoKm.toLocaleString(lang)} km`, fallback: true },
  ], t);

  /* Routes to the top. */
  const gradeWord = (g) => {
    if (g == null || g === '') return '';
    const s = String(g);
    const tm = s.match(/^T([1-6])$/i);
    if (tm) return t('ox.gradeShort', { n: tm[1], word: t(`ox.grade.t${tm[1]}`) });
    if (SAC_STEP[s]) return t('ox.gradeShort', { n: SAC_STEP[s], word: t(`ox.grade.t${SAC_STEP[s]}`) });
    return GRADE_KEY[s] ? t(GRADE_KEY[s]) : capFirst(s);
  };
  const dur = (min) => {
    const r = Math.max(5, Math.round(min / 5) * 5);
    const h = Math.floor(r / 60);
    const m = r % 60;
    return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
  };
  const routeCards = routes.slice(0, 6).map((r) => {
    const cc = r.cc || mountain.cc;
    const row = trailRows?.get(String(r.id)) || null;
    return {
      key: String(r.id),
      name: r.name,
      grade: gradeWord(r.grade),
      meta: [
        Number.isFinite(r.ascent_m) ? t('ox.metresUp', { m: nf(r.ascent_m) }) : '',
        Number.isFinite(r.duration_min) ? dur(r.duration_min) : '',
        Number.isFinite(r.km) ? `${r.km.toLocaleString(lang, { maximumFractionDigits: 1 })} km` : '',
      ].filter(Boolean),
      href: featureHref('trail', { id: r.id, cc }),
      onOpen: row && onOpenNeighbour ? () => onOpenNeighbour('trail', row) : null,
    };
  });

  /* Huts and lifts. */
  const hutSeason = Array.isArray(hutInfo?.season) && monthIndex(hutInfo.season[0]) && monthIndex(hutInfo.season[1])
    ? t('ox.hutOpen', { from: months.short(monthIndex(hutInfo.season[0])), to: months.short(monthIndex(hutInfo.season[1])) })
    : (typeof hutInfo?.season === 'string' ? hutInfo.season : '');
  const isUrl = (s) => /^https?:\/\//i.test(String(s || ''));
  const liftSrc = lift && SRC_KEY[lift.src] ? t(SRC_KEY[lift.src]) : '';
  const fareLine = liftFareLine(mountain, t);
  const ways = accessLabels(mountain, t);
  const hutRows = [
    hutName && {
      key: 'hut',
      icon: <BedIcon size={16} />,
      title: hutFact,
      text: [hutInfo ? '' : t('ox.hutOnRoute'), hutSeason, hutInfo?.booking && !isUrl(hutInfo.booking) ? String(hutInfo.booking) : '']
        .filter(Boolean).join(', '),
      link: isUrl(hutInfo?.booking) ? <a href={hutInfo.booking} target="_blank" rel="noopener noreferrer">{t('ox.hutBook')}</a> : null,
    },
    ...flankHuts(mountain, t, lang).filter((h) => h.name !== hutName).slice(0, 3).map((h) => ({
      key: `fh-${h.key}`,
      icon: <BedIcon size={16} />,
      title: h.name,
      text: h.text,
      link: h.web ? <a href={h.web} target="_blank" rel="noopener noreferrer">{t('mtn.hutWeb')}</a> : null,
    })),
    liftInfo ? {
      key: 'lift',
      icon: <GondolaIcon size={16} />,
      title: liftInfo.name,
      text: [
        liftInfo.season ? (Array.isArray(liftInfo.season) && monthIndex(liftInfo.season[0]) && monthIndex(liftInfo.season[1])
          ? t('ox.hutOpen', { from: months.short(monthIndex(liftInfo.season[0])), to: months.short(monthIndex(liftInfo.season[1])) })
          : String(liftInfo.season)) : '',
        Number.isFinite(liftInfo.top_ele) ? t('ox.liftTop', { m: nf(liftInfo.top_ele) }) : '',
        Number.isFinite(liftReturn) ? t('ox.liftReturn', { price: formatMoney(liftReturn) }) : '',
      ].filter(Boolean).join(', '),
    } : lift && {
      key: 'lift',
      icon: <GondolaIcon size={16} />,
      title: lift.name ? `${liftLabel(mountain, t)}: ${lift.name}` : liftLabel(mountain, t),
      text: [liftSrc, lift.m != null ? t('mtn.liftMetres', { m: lift.m }) : '', ride ? t('mtn.liftSeasonNote') : '', fareLine]
        .filter(Boolean).join('. '),
    },
    !ride && !liftInfo && {
      key: 'way',
      icon: <MountainIcon size={16} />,
      title: t('ox.onFoot', { word: difficultyLabel(mountain, t) }),
      text: '',
    },
    ways.length > 0 && {
      key: 'ways',
      icon: <ParkingIcon size={16} />,
      title: t('ox.waysIn'),
      text: ways.map((w) => w.label).join(', '),
    },
    pointRow(mountain.lat, mountain.lon, t, mapsUrl),
  ];

  /* When to go: the summit by month, snow, storms, crowds. */
  const temps = Array.isArray(season?.t) && season.t.length === 12 && season.t.every((v) => Number.isFinite(Number(v)))
    ? season.t.map(Number) : null;
  const snowMonths = Array.isArray(season?.snow) && season.snow.length === 12
    ? season.snow.map((p, i) => (Number(p) >= 75 ? i + 1 : 0)).filter(Boolean) : [];
  const snowRun = monthRun(snowMonths);
  const stormMonths = Array.isArray(season?.storm) && season.storm.length === 12
    ? season.storm.map((p, i) => (Number(p) >= 30 ? i + 1 : 0)).filter(Boolean) : [];
  const stormRun = monthRun(stormMonths);
  const whenCells = [
    snowRun && {
      key: 'snow', icon: <SnowIcon size={16} />, label: t('ox.snow'),
      value: t('detail.monthRange', { from: months.short(snowRun.from), to: months.short(snowRun.to) }),
      text: t('ox.snowText'),
    },
    stormRun && {
      key: 'storm', icon: <StormIcon size={16} />, label: t('ox.storms'),
      value: t('detail.monthRange', { from: months.short(stormRun.from), to: months.short(stormRun.to) }),
      text: t('ox.stormText'),
    },
    typeof mountain.crowds === 'string' && mountain.crowds && {
      key: 'crowd', icon: <FriendsIcon size={16} />, label: t('ox.crowds'), value: mountain.crowds, text: '',
    },
  ].filter(Boolean);

  /* Before you go: the hazards, the slope, the safety block. */
  const before = beforeGoItems({
    hazards: mountain.hazards || [],
    lines: notForLines('mountain', mountain, { word: difficultyLabel(mountain, t), shownHazards: hazards.map((h) => h.code) }),
  });
  const slope = slopeFact(mountain, t);
  const beforeRows = [
    ...before.map((it) => ({
      key: it.key,
      icon: <ItemIcon name={it.icon} size={16} />,
      title: t(it.titleKey, { ...it.params, word: it.params?.word ? capFirst(it.params.word) : it.params?.word }),
      text: t(it.subKey, it.params),
      warn: Boolean(it.safety),
    })),
    slope && { key: 'slope', icon: <MountainIcon size={16} />, title: slope.title, text: slope.text, warn: slope.warn },
  ];
  const parkWhy = (mountain.why || []).find((w) => w.k === 'park' && w.name);

  const sources = [
    { label: 'OpenStreetMap', href: `https://www.openstreetmap.org/#map=14/${mountain.lat}/${mountain.lon}` },
    mountain.wiki && { label: 'Wikipedia', href: mountain.wiki },
    mountain.wd && { label: 'Wikidata', href: `https://www.wikidata.org/wiki/${mountain.wd}` },
    ...(mountain.credit || []).map((c) => ({ label: c })),
  ].filter(Boolean);

  const where = [countryName, mountain.range].filter(Boolean).join(', ');
  const hook = highlights[0]?.line || headline;
  const rankLine = rating && !rating.unscored ? natureRankLine({ rank: rating.rank }, t, { place: countryName }) : '';
  const onAdd = onAddToDay
    ? () => onAddToDay({ id: mountain.id, cc: mountain.cc, name: mountain.name, lat: mountain.lat, lon: mountain.lon }) : null;
  const pdfModel = () => outdoorPdfModel({
    name: mountain.name, hook, facts: keyFacts, why: highlights.slice(1).filter((h) => h.title), before, sources, t,
    extra: { photos, where, url: mountainShareUrl(mountain) },
  });
  const subs = SUB_ORDER.filter((key) => mountain.sub?.[key] != null);
  const comps = COMPONENT_ORDER.filter((key) => mountain.comp?.[key] != null);
  const rangeRank = rangeRankLine(mountain, t);
  const easiest = routeCards.find((r) => r.grade) || null;

  const jumps = [
    { key: 'routes', id: 'ox-routes', label: t('ox.jump.routes') },
    { key: 'lifts', id: 'ox-lifts', label: t('ox.jump.lifts') },
    { key: 'when', id: 'ox-when', label: t('ox.jump.when') },
    { key: 'before', id: 'ox-before', label: t('go.head') },
    { key: 'near', id: 'ox-near', label: t('ox.jump.nearby') },
  ];

  const map = Number.isFinite(mountain.lat) && Number.isFinite(mountain.lon)
    ? <PlaceMap lat={mountain.lat} lon={mountain.lon} label={t('detail.mapOf', { name: mountain.name })} name={mountain.name} relief zoom={12} />
    : null;

  const whyRates = comps.length > 0 || why.length > 0 || rangeRank ? (
    <>
      {subs.length > 0 && (
        <ul className="lpage-subs">
          {subs.map((key) => (
            <li key={key}>
              <span className="lpage-sub-n">{Math.round(mountain.sub[key] * 10)}</span>
              <span className="lpage-sub-label">{componentLabel(key, t)}</span>
            </li>
          ))}
        </ul>
      )}
      {rangeRank && <p className="pt-muted">{rangeRank}</p>}
      {why.length > 0 && <p className="pt-muted">{why.join(' ')}</p>}
      {mountain.bestFor?.length > 0 && (
        <p className="pt-muted"><b>{t('mtn.bestFor')}</b> {mountain.bestFor.map((code) => bestForLabel(code, t)).join(', ')}</p>
      )}
      {tags.length > 0 && <p className="pt-muted">{tags.map((tag) => tag.label).join(', ')}</p>}
      {comps.length > 0 && (
        <div className="bpage-score">
          <p className="bpage-note">{t('mtn.scoreNote')}</p>
          <ul className="bpage-bars">
            {comps.map((key) => (
              <li key={key}>
                <span className="bpage-bar-label">{componentLabel(key, t)}</span>
                <span className="bpage-bar-track" aria-hidden="true">
                  <span className="bpage-bar-fill" style={{ width: `${Math.round(mountain.comp[key] * 100)}%` }} />
                </span>
                <span className="bpage-bar-n">{Math.round(mountain.comp[key] * 100)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  ) : null;

  return (
    <OutdoorPage
      name={mountain.name}
      className="mpage-v2"
      backLabel={backLabel || t('mtn.back')}
      onClose={onClose}
      fav={fav}
      onFav={onFav}
      onShare={onShare}
      resetKey={mountain.id}
      toast={toast}
      photos={photos}
      photoFallback={{ city: mountain.name, iso2: mountain.cc }}
      head={{
        title: mountain.name,
        sub: mountain.nameLocal || '',
        iso2: mountain.cc,
        where,
        rating,
        gem: isHiddenGem(mountain),
        rank: rankLine,
        badges: [parkWhy?.name || null, mountain.highpointOf ? t('ox.highestIn', { place: mountain.highpointOf }) : null],
        lead: hook,
      }}
      facts={keyFacts}
      jumps={jumps}
      whyRates={whyRates}
      card={{
        title: t('ox.card.mountain'),
        rows: [
          { key: 'h', label: t('mtn.factHeight'), value: mountain.ele != null ? `${nf(mountain.ele)} m` : '' },
          easiest && { key: 'r', label: t('ox.easiestRoute'), value: easiest.grade },
          { key: 'w', label: t('detail.factWayUp'), value: wayUp },
          seasonText && { key: 's', label: t('detail.factSeason'), value: seasonText },
          Number.isFinite(liftReturn) && { key: 'l', label: t('ox.liftReturnShort'), value: formatMoney(liftReturn) },
        ].filter(Boolean),
        onAdd,
        secondary: [
          routeCards.length > 0 ? (
            <Button key="routes" variant="secondary" size="sm" iconStart={<RouteIcon size={16} />}
              onClick={() => scrollToSection(document.querySelector('.oxp .pt-scroll'), 'ox-routes')}>
              {t('ox.seeRoutes')}
            </Button>
          ) : null,
          <OxLinkButton key="dir" href={mapsUrl} icon={<MapPinIcon size={16} />}>{t('ox.directions')}</OxLinkButton>,
          <Button key="pdf" variant="secondary" size="sm" loading={pdfBusy} iconStart={<DownloadIcon size={16} />}
            onClick={() => onPdf(pdfModel())}>
            {t('ox.pdf')}
          </Button>,
        ],
        stay: mountain.near?.dest_id && mountain.near.city ? (
          <StayLine destId={mountain.near.dest_id} city={mountain.near.city} km={mountain.near.km} onOpen={onSelectDest} />
        ) : null,
      }}
      dock={{
        fig: mountain.ele != null ? `${nf(mountain.ele)} m` : mountain.name,
        note: wayUp ? wayUp.toLocaleLowerCase(lang) : '',
        sub: [seasonText, hutName ? t('ox.hutShort', { name: hutName }) : ''].filter(Boolean).join(', '),
      }}
      sources={sources}
      sourcesExtra={<ReportProblem item={{ layer: 'mountain', id: mountain.id, cc: mountain.cc, name: mountain.name }} />}
    >
      {routeCards.length > 0 && (
        <PSection id="ox-routes" title={t('ox.jump.routes')}>
          <ul className="ox-rtc">
            {routeCards.map((r) => (
              <li key={r.key}>
                <a className="ox-rc" href={r.href || undefined} onClick={r.onOpen ? linkOpener(r.onOpen) : undefined}>
                  <b>{r.name}</b>
                  <ChevronRightIcon size={20} className="ox-rc-go" />
                  {(r.grade || r.meta.length > 0) && (
                    <span className="ox-rc-meta">
                      {r.grade && <span>{r.grade}</span>}
                      {r.meta.map((m) => <span key={m}>{m}</span>)}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </PSection>
      )}

      <PSection id="ox-lifts" title={t('ox.jump.lifts')}>
        <RouteBlock map={map} />
        <CheckRows rows={hutRows} />
      </PSection>

      {(temps || seasonText || whenCells.length > 0) && (
        <PSection id="ox-when" title={t('ox.jump.when')}>
          {temps && (
            <div className="pt-block">
              <MonthStrip values={temps} best={goodMonths.map((m) => m - 1)} now={new Date().getMonth()}
                label={t('ox.summitByMonth')} monthLetter={months.letter} />
              <p className="ox-legend">
                {seasonText && <span><i aria-hidden="true" />{t('ox.seasonIs', { months: seasonText })}</span>}
                <span>{t('ox.summitUnit')}</span>
              </p>
            </div>
          )}
          {!temps && seasonText && <p className="pt-muted">{t('ox.seasonIs', { months: seasonText })}</p>}
          {whenCells.length > 0 && (
            <ul className="ox-cells">
              {whenCells.map((c) => (
                <li key={c.key}>
                  <small>{c.label}</small>
                  <b>{c.value}</b>
                  {c.text && <span>{c.text}</span>}
                </li>
              ))}
            </ul>
          )}
          <SummitForecast mountain={mountain} t={t} lang={lang} />
        </PSection>
      )}

      <PSection id="ox-before" title={t('go.head')}>
        <CheckRows rows={beforeRows} />
        <SafetyBlock extra={[parkWhy && { key: 'park', label: t('ox.park'), value: parkWhy.name }]} />
      </PSection>

      {(exits.length > 0 || mountain.nb) && (
        <PSection id="ox-near" title={t('ox.otherPeaks')}>
          <OtherNearby exits={exits} hrefOf={(r) => featureHref('mountain', { id: r.id, cc: r.cc })} />
          <NearbyOutdoors
            row={mountain}
            cc={mountain.cc}
            headings={{ trail: 'nb.mtn.trail', lake: 'nb.mtn.lake' }}
            onOpen={onOpenNeighbour}
          />
        </PSection>
      )}
    </OutdoorPage>
  );
}
