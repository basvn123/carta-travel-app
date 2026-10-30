import React, { useEffect, useMemo, useState } from 'react';
import '../styles/items.css';
import { displayName } from '../lib/format.js';
import { ReportProblem } from '../components/ReportProblem.jsx';
import { useI18n } from '../i18n/index.jsx';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { PlaceMap } from './DetailSkeleton.jsx';
import { ItemIcon } from './ItemParts.jsx';
import { formatMoney } from '../lib/money.js';
import { toPhotos } from '../lib/itemPhotos.js';
import { beforeGoItems } from '../lib/beforeGo.js';
import { useItemPdf } from '../hooks/useItemPdf.js';
import { usePlaceExits } from '../hooks/usePlaceExits.js';
import { keyFactCells, pointCentre, ACCESS_LEVEL, capFirst } from '../lib/detailSkeleton.js';
import { notForLines } from '../lib/notFor.js';
import { natureRankLine } from '../lib/rating.js';
import { featureHref } from '../lib/featureHref.js';
import {
  lakeHeadline, lakeWhy, lakeTags, lakeSwim, lakeHazards,
  bestForLabel, componentLabel, serviceLabel, accessLabel,
  COMPONENT_ORDER, SUB_ORDER, lakeRating, isHiddenGem, lakeHighlights,
} from '../lib/lakeStory.js';
import { lakeShareUrl, loadLakes } from '../lib/lakes.js';
import { trailheadDirectionsUrl, shareTrailLink } from '../lib/trailExport.js';
import {
  MapPinIcon, DownloadIcon, ParkingIcon, DiningIcon, BedIcon, ShieldIcon, SwimIcon, BootIcon,
  BeachIcon, TicketIcon, FerryIcon, RouteIcon, CheckIcon, AlertIcon,
} from '../components/Icons.jsx';
import { lakeShore } from '../lib/derivedModules.js';
import { Button } from '../components/ui/index.js';
import {
  OutdoorPage, PSection, StayLine, RouteBlock, CheckRows, Facilities, WaterClass, MonthStrip,
  OtherNearby, OxLinkButton, outdoorPdfModel, monthIndex, useMonthWords, accessRows, pointRow,
} from './OutdoorParts.jsx';

/**
 * The lake page: one published water body, and the argument for going there.
 *
 * Since T917 it stands on the place page's template (OutdoorParts.jsx, the
 * owner's approved spec of 2026-10-30). Swimming leads, because it is the
 * one field on this page that can hurt somebody: the verdict is the first
 * fact and the first row of the first section, never folded. Then the head,
 * the facts (swimming, the EU water class, the warm months, the shore path,
 * the altitude), a jump bar and the sections: Swimming (the verdict and its
 * source, the lifeguard season, the water class as four named steps, the
 * modelled water by month, the hazards), Around the shore (the path, a beach
 * on the shore, what is there, rentals and entry with their prices), Getting
 * there (the map, the way in, parking, transit) and Other lakes. The side
 * card holds the one primary, "Add to a day plan".
 *
 * The month strip is an ESTIMATE and says so: there is no free per lake water
 * temperature series for Europe, so the pipeline models it from air normals.
 */

/** The way in as a level: only the access field says anything about it. */
const lakeLevel = (l) => (typeof l?.access === 'string' ? ACCESS_LEVEL[l.access] || 0 : 0);
const SVC_ICON = { parking: ParkingIcon, food: DiningIcon, camping: BedIcon, lido: SwimIcon, ferry: FerryIcon, boatRental: FerryIcon };
const RENT_KINDS = ['boat', 'pedalo', 'sup', 'kayak', 'canoe', 'rowboat'];

export function LakePage({ lake, countryName, onClose, onSelectDest, onOpenNeighbour, fav = false, onFav = null, onAddToDay = null, backLabel = '' }) {
  const { t, lang } = useI18n();
  const months = useMonthWords();
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  // Three ways out, from the same country's lakes (T180).
  const exits = usePlaceExits({
    me: lake,
    cc: lake?.cc,
    load: loadLakes,
    centre: pointCentre,
    level: lakeLevel,
    baseOf: (r) => r?.base?.id || null,
    open: (row) => onOpenNeighbour?.('lake', row),
  });

  const images = useMemo(() => lake?.images || [], [lake]);
  const why = useMemo(() => (lake ? lakeWhy(lake, t) : []), [lake, t]);
  const tags = useMemo(() => (lake ? lakeTags(lake, t, 4) : []), [lake, t]);
  const rating = useMemo(() => (lake ? lakeRating(lake, t) : null), [lake, t]);
  const swim = useMemo(() => (lake ? lakeSwim(lake, t) : null), [lake, t]);
  const hazards = useMemo(() => (lake ? lakeHazards(lake, t) : []), [lake, t]);
  const headline = useMemo(
    () => (lake ? lakeHeadline(lake, t, countryName) : ''),
    [lake, t, countryName],
  );
  const highlights = useMemo(() => (lake ? lakeHighlights(lake, t) : []), [lake, t]);
  const photos = useMemo(() => toPhotos(images, { fallbackCaption: lake?.name || '' }), [images, lake?.name]);
  const { onPdf, pdfBusy } = useItemPdf('lake', lake, { countryName });

  if (!lake) return null;

  const nf = (v) => Math.round(v).toLocaleString(lang);
  const mapsUrl = trailheadDirectionsUrl(lake.lat, lake.lon);
  const onShare = async () => {
    const how = await shareTrailLink(lake.name, lakeShareUrl(lake));
    if (how === 'copied') setToast(t('trip.linkCopied'));
  };

  const size = lake.size || {};
  const altM = Number.isFinite(lake.alt_m) ? lake.alt_m : (Number.isFinite(size.elevM) ? size.elevM : null);
  const water = lake.water || null;
  const waterWord = water ? t(`lake.water${water.class}`) : '';
  const season = lake.swim?.season || null;
  const sFrom = monthIndex(season?.from);
  const sTo = monthIndex(season?.to);
  const warmText = sFrom && sTo ? t('detail.monthRange', { from: months.short(sFrom), to: months.short(sTo) }) : '';
  const peakC = Number(season?.peak);
  const shore = lakeShore(lake);
  const shoreKm = shore.state === 'path' ? shore.km : null;
  const shoreText = shoreKm != null ? `${shoreKm.toLocaleString(lang, { maximumFractionDigits: 1 })} km` : '';
  const canSwim = swim.rule === 'yes' || swim.rule === 'limited';

  // The lifeguard season, where the data has one.
  const lgFrom = monthIndex(lake.lifeguard_season?.[0]);
  const lgTo = monthIndex(lake.lifeguard_season?.[1]);
  const lgSeason = lgFrom && lgTo ? t('detail.monthRange', { from: months.short(lgFrom), to: months.short(lgTo) }) : '';

  // The facts that decide (the spec): swimming, water, the warm months, the
  // shore path, the altitude; the surface when a cell is spare.
  const keyFacts = keyFactCells([
    { key: 'swim', label: t('ox.fact.swim'), value: swim.label },
    water && { key: 'water', label: t('lake.factWater'), value: waterWord, note: water.year ? String(water.year) : null },
    warmText && { key: 'season', label: t('ox.fact.warm'), value: warmText, note: Number.isFinite(peakC) ? t('ox.peakC', { c: nf(peakC) }) : null },
    shoreText && { key: 'walk', icon: 'way', label: t('ox.shorePath'), value: shoreText },
    altM != null && { key: 'elev', label: t('lake.factElevation'), value: `${nf(altM)} m` },
    size.areaKm2 && { key: 'area', label: t('lake.factArea'), value: `${size.areaKm2.toLocaleString(lang)} km²`, fallback: true },
  ], t);

  /* Swimming: the verdict, the lifeguard, the class, the water by month. */
  const temps = Array.isArray(lake.swim?.temps) && lake.swim.temps.length === 12
    && lake.swim.temps.every((v) => Number.isFinite(Number(v))) ? lake.swim.temps.map(Number) : null;
  const warmMonths = temps && sFrom && sTo
    ? [...Array(12).keys()].filter((i) => (sFrom <= sTo ? i + 1 >= sFrom && i + 1 <= sTo : i + 1 >= sFrom || i + 1 <= sTo))
    : [];
  const swimRows = [
    {
      key: 'swim',
      icon: <SwimIcon size={16} />,
      title: swim.label,
      text: swim.source ? t('ox.swimFrom', { src: swim.source }) : '',
      warn: swim.rule === 'no' || swim.rule === 'limited',
    },
    lgSeason && { key: 'lg', icon: <ShieldIcon size={16} />, title: t('beach.factLifeguard'), text: lgSeason },
    ...hazards.map((h) => ({ key: `haz-${h.code}`, icon: <AlertIcon size={16} />, title: h.line, text: '', warn: true })),
  ];

  /* Around the shore: the path, a beach, what is there, rentals, entry. */
  const shoreBeach = Array.isArray(lake.beaches) && lake.beaches.length ? lake.beaches[0] : null;
  const rentals = (Array.isArray(lake.rentals) ? lake.rentals : []).filter((r) => r && r.kind);
  const entry = Number(lake.entry_eur);
  const facil = [
    shoreText && { key: 'path', icon: <BootIcon size={16} />, label: t('ox.shorePath'), note: shoreText },
    shoreBeach && { key: 'beach', icon: <BeachIcon size={16} />, label: t('ox.shoreBeach'), note: shoreBeach.n && shoreBeach.n !== lake.name ? shoreBeach.n : '' },
    ...(lake.services || []).map((s) => {
      const word = serviceLabel(s, t);
      if (!word) return null;
      const Icon = SVC_ICON[s] || CheckIcon;
      return { key: `svc-${s}`, icon: <Icon size={16} />, label: capFirst(word) };
    }),
    ...rentals.map((r, i) => ({
      key: `rent-${i}`,
      icon: <FerryIcon size={16} />,
      label: RENT_KINDS.includes(r.kind) ? t(`ox.rent.${r.kind}`) : capFirst(String(r.kind)),
      note: Number.isFinite(Number(r.eur_hour)) ? t('ox.perHour', { price: formatMoney(Number(r.eur_hour)) }) : '',
    })),
    lake.entry_eur != null && Number.isFinite(entry) && {
      key: 'entry', icon: <TicketIcon size={16} />, label: t('ox.entry'),
      note: entry === 0 ? t('ox.free') : formatMoney(entry),
    },
  ].filter(Boolean);
  const walks = (lake.walks || []).filter((w) => w && w.name).slice(0, 4).map((w) => ({
    key: `walk-${w.id}`,
    icon: <BootIcon size={16} />,
    title: w.name,
    text: w.km > 0 ? `${w.km} km` : '',
  }));

  /* Getting there: the way in, parking, transit, the point on the map. */
  const services = lake.services || [];
  const accessObj = lake.access && typeof lake.access === 'object' ? lake.access : null;
  const gettingRows = [
    typeof lake.access === 'string' && { key: 'way', icon: <RouteIcon size={16} />, title: accessLabel(lake.access, t), text: '' },
    ...accessRows(accessObj, t, lang),
    !accessObj?.parking && services.includes('parking') && { key: 'park', icon: <ParkingIcon size={16} />, title: t('ox.parking'), text: t('ox.parkMapped') },
    pointRow(lake.lat, lake.lon, t, mapsUrl),
  ].filter(Boolean);

  const before = beforeGoItems({
    hazards: (lake.hazards || []),
    lines: notForLines('lake', lake, { shownHazards: hazards.map((h) => h.code) }),
  });
  const notForRows = before.filter((it) => !String(it.key).startsWith('haz-')).map((it) => ({
    key: it.key,
    icon: <ItemIcon name={it.icon} size={16} />,
    title: t(it.titleKey, { ...it.params, word: it.params?.word ? capFirst(it.params.word) : it.params?.word }),
    text: t(it.subKey, it.params),
  }));
  const sources = [
    lake.osm && { label: 'OpenStreetMap', href: `https://www.openstreetmap.org/${lake.osm}` },
    lake.wiki && { label: 'Wikipedia', href: lake.wiki },
    lake.wd && { label: 'Wikidata', href: `https://www.wikidata.org/wiki/${lake.wd}` },
    ...(lake.credit || []).map((c) => ({ label: c })),
  ].filter(Boolean);

  const where = [lake.region, countryName].filter(Boolean).join(', ');
  const hook = highlights[0]?.line || headline;
  const rankLine = rating && !rating.unscored ? natureRankLine({ rank: rating.rank }, t, { place: countryName }) : '';
  const onAdd = onAddToDay
    ? () => onAddToDay({ id: lake.id, cc: lake.cc, name: lake.name, lat: lake.lat, lon: lake.lon }) : null;
  const pdfModel = () => outdoorPdfModel({
    name: lake.name, hook, facts: keyFacts, why: highlights.slice(1).filter((h) => h.title), before, sources, t,
    extra: { photos, where, url: lakeShareUrl(lake) },
  });
  const peakMonth = temps ? temps.indexOf(Math.max(...temps)) + 1 : null;
  const subs = SUB_ORDER.filter((key) => lake.sub?.[key] != null);
  const comps = COMPONENT_ORDER.filter((key) => lake.comp?.[key] != null);

  const jumps = [
    { key: 'swim', id: 'ox-swim', label: t('ox.jump.swim') },
    { key: 'shore', id: 'ox-shore', label: t('ox.jump.shore') },
    { key: 'getting', id: 'ox-getting', label: t('detail.gettingThere') },
    { key: 'near', id: 'ox-near', label: t('ox.jump.nearby') },
  ];

  const map = Number.isFinite(lake.lat) && Number.isFinite(lake.lon)
    ? <PlaceMap lat={lake.lat} lon={lake.lon} label={t('detail.mapOf', { name: lake.name })} name={lake.name} />
    : null;

  const whyRates = comps.length > 0 || why.length > 0 ? (
    <>
      {subs.length > 0 && (
        <ul className="lpage-subs">
          {subs.map((key) => (
            <li key={key}>
              <span className="lpage-sub-n">{Math.round(lake.sub[key] * 10)}</span>
              <span className="lpage-sub-label">{componentLabel(key, t)}</span>
            </li>
          ))}
        </ul>
      )}
      {why.length > 0 && <p className="pt-muted">{why.join(' ')}</p>}
      {lake.bestFor?.length > 0 && (
        <p className="pt-muted"><b>{t('lake.bestFor')}</b> {lake.bestFor.map((code) => bestForLabel(code, t)).join(', ')}</p>
      )}
      {tags.length > 0 && <p className="pt-muted">{tags.map((tag) => tag.label).join(', ')}</p>}
      {comps.length > 0 && (
        <div className="bpage-score">
          <p className="bpage-note">{t('lake.scoreNote')}</p>
          <ul className="bpage-bars">
            {comps.map((key) => (
              <li key={key}>
                <span className="bpage-bar-label">{componentLabel(key, t)}</span>
                <span className="bpage-bar-track" aria-hidden="true">
                  <span className="bpage-bar-fill" style={{ width: `${Math.round(lake.comp[key] * 100)}%` }} />
                </span>
                <span className="bpage-bar-n">{Math.round(lake.comp[key] * 100)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  ) : null;

  return (
    <OutdoorPage
      name={lake.name}
      className="lpage-v2"
      backLabel={backLabel || t('lake.back')}
      onClose={onClose}
      fav={fav}
      onFav={onFav}
      onShare={onShare}
      resetKey={lake.id}
      toast={toast}
      photos={photos}
      photoFallback={{ city: lake.name, iso2: lake.cc }}
      head={{
        title: lake.name,
        sub: lake.nameLocal || '',
        iso2: lake.cc,
        where,
        rating,
        gem: isHiddenGem(lake),
        rank: rankLine,
        badges: [lake.protected?.name || null],
        lead: hook,
      }}
      facts={keyFacts}
      jumps={jumps}
      whyRates={whyRates}
      card={{
        title: t('ox.card.lake'),
        rows: [
          { key: 's', label: t('ox.fact.swim'), value: swim.label },
          water && { key: 'w', label: t('lake.factWater'), value: waterWord },
          peakMonth && Number.isFinite(peakC) && { key: 'pk', label: t('ox.warmestIn', { month: months.long(peakMonth) }), value: `${nf(peakC)}°` },
          lake.entry_eur != null && Number.isFinite(entry) && { key: 'e', label: t('ox.entry'), value: entry === 0 ? t('ox.free') : formatMoney(entry) },
        ].filter(Boolean),
        onAdd,
        secondary: [
          <OxLinkButton key="dir" href={mapsUrl} icon={<MapPinIcon size={16} />}>{t('ox.directions')}</OxLinkButton>,
          <Button key="pdf" variant="secondary" size="sm" loading={pdfBusy} iconStart={<DownloadIcon size={16} />}
            onClick={() => onPdf(pdfModel())}>
            {t('ox.pdf')}
          </Button>,
        ],
        stay: lake.base?.id && lake.base.city ? (
          <StayLine destId={lake.base.id} city={lake.base.city} km={lake.base.km} onOpen={onSelectDest} />
        ) : null,
      }}
      dock={{
        fig: canSwim && warmText ? t('ox.swimMonths', { months: warmText }) : swim.label,
        note: canSwim && Number.isFinite(peakC) ? `${nf(peakC)}°` : '',
        sub: [waterWord ? t('ox.dockWater', { word: waterWord }) : '', shoreText ? t('ox.shoreShort', { km: shoreText }) : '']
          .filter(Boolean).join(', '),
      }}
      sources={sources}
      sourcesExtra={<ReportProblem item={{ layer: 'lake', id: lake.id, cc: lake.cc, name: lake.name }} />}
    >
      <PSection id="ox-swim" title={t('ox.jump.swim')}>
        <CheckRows rows={swimRows} />
        {water && <WaterClass cls={water.class} year={water.year || null} site={displayName(water.site) || null} />}
        {temps && (
          <div className="pt-block">
            <h3 className="pt-block-title">{t('ox.lakeByMonth')}</h3>
            <MonthStrip values={temps} best={warmMonths} now={new Date().getMonth()} label={t('ox.lakeByMonth')}
              monthLetter={months.letter} />
            <p className="ox-legend">
              {warmText && <span><i aria-hidden="true" />{t('ox.warmEnough', { months: warmText })}</span>}
              <span>{t('ox.lakeUnit')}</span>
            </p>
          </div>
        )}
        <CheckRows rows={notForRows} />
      </PSection>

      {(facil.length > 0 || walks.length > 0) && (
        <PSection id="ox-shore" title={t('ox.jump.shore')}>
          <Facilities items={facil} />
          {walks.length > 0 && (
            <div className="pt-block">
              <h3 className="pt-block-title">{t('lake.walksHead')}</h3>
              <CheckRows rows={walks} />
            </div>
          )}
        </PSection>
      )}

      {(map || gettingRows.length > 0) && (
        <PSection id="ox-getting" title={t('detail.gettingThere')}>
          <RouteBlock map={map} />
          <CheckRows rows={gettingRows} />
        </PSection>
      )}

      {(exits.length > 0 || lake.nb) && (
        <PSection id="ox-near" title={t('ox.otherLakes')}>
          <OtherNearby exits={exits} hrefOf={(r) => featureHref('lake', { id: r.id, cc: r.cc })} />
          <NearbyOutdoors
            row={lake}
            cc={lake.cc}
            headings={{ trail: 'nb.lake.trail', peak: 'nb.lake.peak' }}
            onOpen={onOpenNeighbour}
          />
        </PSection>
      )}
    </OutdoorPage>
  );
}
