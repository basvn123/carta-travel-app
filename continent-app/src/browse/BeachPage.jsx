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
  beachHeadline, beachWhy, beachTags, bestForLabel, componentLabel,
  COMPONENT_ORDER, beachRating, componentWeights, beachHighlights,
} from '../lib/beachStory.js';
import { beachShareUrl, loadBeaches } from '../lib/beaches.js';
import { trailheadDirectionsUrl, shareTrailLink } from '../lib/trailExport.js';
import {
  MapPinIcon, DownloadIcon, ParkingIcon, BottleIcon, DiningIcon, BedIcon, ShieldIcon,
  TreeIcon, SunIcon, BeachIcon, RouteIcon, CheckIcon,
} from '../components/Icons.jsx';
import { beachFacing } from '../lib/derivedModules.js';
import { CompassRosette } from './Signature.jsx';
import { compassPoint } from '../lib/signature.js';
import { Button } from '../components/ui/index.js';
import {
  OutdoorPage, PSection, StayLine, RouteBlock, CheckRows, Facilities, WaterClass, MonthStrip,
  OtherNearby, OxLinkButton, outdoorPdfModel, monthIndex, useMonthWords, accessRows, pointRow,
} from './OutdoorParts.jsx';

/**
 * The beach page: one published beach, and the argument for going there.
 *
 * Since T920 it stands on the place page's template (OutdoorParts.jsx, the
 * owner's approved spec of 2026-10-30): the photographs, the head (the name,
 * the Score with the rank in the region, the region), the facts that decide
 * (the EU water class, what is underfoot, a lifeguard, the length, which way
 * it faces), a jump bar, then The water (the class as four named steps with
 * its sampling site and year, the sea by month, the waves, the aspect, the
 * lifeguard season), On the beach (what is there, and what is known not to
 * be), Getting there (the map with the way the shore faces, parking and
 * transit), and Other beaches. The side card holds the one primary, "Add to
 * a day plan", with Directions, the PDF and a priced "Stay nearby".
 *
 * A beach is a place you arrive at, not a line you follow: no route, no GPX,
 * no profile. Every row, cell and section without data is left out; the
 * fields of the data contract (sea_temp, access, shade, step_free, sunbeds,
 * lifeguard_season, waves) show when the data brings them.
 */

/** The way down as a level: only the access field says anything about it. */
const beachLevel = (b) => (typeof b?.access === 'string' ? ACCESS_LEVEL[b.access] || 0 : 0);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const SVC_ICON = { parking: ParkingIcon, water: BottleIcon, food: DiningIcon, camping: BedIcon };

export function BeachPage({ beach, countryName, onClose, onSelectDest, model, onOpenNeighbour, fav = false, onFav = null, onAddToDay = null, backLabel = '' }) {
  const { t, lang } = useI18n();
  const months = useMonthWords();
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);

  // Three ways out, from the same country's beaches (T180).
  const exits = usePlaceExits({
    me: beach,
    cc: beach?.cc,
    load: loadBeaches,
    centre: pointCentre,
    level: beachLevel,
    baseOf: (r) => r?.base?.id || null,
    open: (row) => onOpenNeighbour?.('beach', row),
  });

  const images = useMemo(() => beach?.images || [], [beach]);
  const why = useMemo(() => (beach ? beachWhy(beach, t) : []), [beach, t]);
  const tags = useMemo(() => (beach ? beachTags(beach, t, 4) : []), [beach, t]);
  const rating = useMemo(() => (beach ? beachRating(beach, t) : null), [beach, t]);
  const headline = useMemo(
    () => (beach ? beachHeadline(beach, t, countryName) : ''),
    [beach, t, countryName],
  );
  const highlights = useMemo(() => (beach ? beachHighlights(beach, t) : []), [beach, t]);
  const photos = useMemo(() => toPhotos(images, { fallbackCaption: beach?.name || '' }), [images, beach?.name]);
  const { onPdf, pdfBusy } = useItemPdf('beach', beach, { countryName });

  if (!beach) return null;

  const nf = (v) => Math.round(v).toLocaleString(lang);
  const mapsUrl = trailheadDirectionsUrl(beach.lat, beach.lon);
  const onShare = async () => {
    const how = await shareTrailLink(beach.name, beachShareUrl(beach));
    if (how === 'copied') setToast(t('trip.linkCopied'));
  };

  // The score with its weights, for the one fold near the sources.
  const weights = componentWeights(model);
  const parts = COMPONENT_ORDER
    .filter((key) => beach.comp?.[key] != null)
    .map((key) => ({
      key,
      label: componentLabel(key, t),
      pct: Math.round(beach.comp[key] * 100),
      weight: weights?.[key] != null ? Math.round(weights[key] * 100) : null,
    }));

  const surfaceWord = beach.surface ? t(`beach.surfaceWord${cap(beach.surface)}`) : '';
  const facing = beachFacing(beach);
  const point = compassPoint(beach.aspect);
  const facesWord = point ? capFirst(t(`sig.dir${point}`)) : '';
  const water = beach.water || null;
  const waterWord = water ? t(`beach.water${water.class}`) : '';
  const waterSite = displayName(water?.site) || '';
  const lengthText = beach.lengthM ? `${beach.lengthM.toLocaleString(lang)} m` : '';

  // The lifeguard: mapped, and its season where the data has one.
  const lgFrom = monthIndex(beach.lifeguard_season?.[0]);
  const lgTo = monthIndex(beach.lifeguard_season?.[1]);
  const lgSeason = lgFrom && lgTo ? t('detail.monthRange', { from: months.short(lgFrom), to: months.short(lgTo) }) : '';
  const hasLifeguard = Boolean(beach.lifeguard || lgSeason);

  // The sea by month (sea_temp, twelve figures): the three warmest stand out.
  const sea = Array.isArray(beach.sea_temp) && beach.sea_temp.length === 12
    && beach.sea_temp.every((v) => Number.isFinite(Number(v))) ? beach.sea_temp.map(Number) : null;
  const warmest = sea ? [...sea.keys()].sort((a, b) => sea[b] - sea[a]).slice(0, 3) : [];
  const peakI = sea ? warmest[0] : null;

  // The facts that decide (the spec): water, underfoot, lifeguard, length,
  // which way it faces, and the way in where it is mapped.
  const keyFacts = keyFactCells([
    { key: 'water', label: t('beach.factWater'), value: waterWord, note: water?.year ? String(water.year) : (waterSite || null) },
    { key: 'surface', icon: 'sand', label: t('beach.factSurface'), value: capFirst(surfaceWord) },
    hasLifeguard && { key: 'lifeguard', label: t('beach.factLifeguard'), value: lgSeason || t('beach.yes') },
    { key: 'length', label: t('beach.factLength'), value: lengthText },
    point && { key: 'faces', label: t('derived.facingHead'), value: facesWord },
    typeof beach.access === 'string' && { key: 'access', label: t('beach.factAccess'), value: t(`beach.access${cap(beach.access)}`) },
  ], t);

  /* The water: class, the sea by month, waves, aspect, lifeguard. */
  const waterCells = [
    ['calm', 'moderate', 'surf'].includes(beach.waves) && {
      key: 'waves', label: t('ox.waves'), value: t(`ox.waves.${beach.waves}`),
    },
    point && {
      key: 'faces',
      label: t('derived.facingHead'),
      value: facesWord,
      text: facing?.sun ? capFirst(t(`derived.sunShort${cap(facing.sun)}`)) : '',
    },
    hasLifeguard && {
      key: 'lg', label: t('beach.factLifeguard'), value: lgSeason ? t('ox.lgSeason', { months: lgSeason }) : t('ox.lgMapped'),
    },
  ].filter(Boolean);

  /* On the beach: what is there, and what is known not to be. */
  const dogs = beach.dogs ?? beach.dog;
  const services = (beach.services || []).filter((s) => t(`beach.svc${cap(s)}`) !== `beach.svc${cap(s)}`);
  const sunbedEur = Number(beach.sunbeds?.eur_day);
  const stepFree = beach.step_free === true || beach.wheelchair === true ? true
    : beach.step_free === false ? false : null;
  const facil = [
    surfaceWord && { key: 'surface', icon: <BeachIcon size={16} />, label: capFirst(surfaceWord), note: lengthText ? t('ox.longM', { len: lengthText }) : '' },
    hasLifeguard && { key: 'lg', icon: <ShieldIcon size={16} />, label: t('beach.factLifeguard'), note: lgSeason },
    ...services.map((s) => {
      const Icon = SVC_ICON[s] || CheckIcon;
      return { key: `svc-${s}`, icon: <Icon size={16} />, label: capFirst(t(`beach.svc${cap(s)}`)) };
    }),
    beach.sunbeds && { key: 'sunbeds', icon: <SunIcon size={16} />, label: t('ox.sunbeds'), note: Number.isFinite(sunbedEur) ? t('ox.parkDay', { price: formatMoney(sunbedEur) }) : '' },
    beach.shade === true && { key: 'shade', icon: <TreeIcon size={16} />, label: t('ox.shade') },
    beach.shade === false && { key: 'shade', no: true, label: t('ox.shade') },
    stepFree === true && { key: 'step', label: t('ox.stepFree') },
    stepFree === false && { key: 'step', no: true, label: t('ox.stepFree') },
    ['yes', 'leash'].includes(dogs) && { key: 'dogs', label: t(`ox.dogs.${dogs}`) },
    dogs === 'no' && { key: 'dogs', no: true, label: t('ox.dogsShort') },
    beach.nudism && { key: 'nudism', label: t('ox.naturist') },
  ].filter(Boolean);

  /* Getting there: the way in, parking, transit, the point on the map. */
  const parkingFromServices = !beach.access?.parking && services.includes('parking');
  const accessRow = typeof beach.access === 'string' ? {
    key: 'way', icon: <RouteIcon size={16} />, title: t(`beach.access${cap(beach.access)}`), text: '',
  } : null;
  const gettingRows = [
    accessRow,
    ...accessRows(typeof beach.access === 'object' ? beach.access : null, t, lang),
    parkingFromServices && { key: 'park', icon: <ParkingIcon size={16} />, title: t('ox.parking'), text: t('ox.parkMapped') },
    pointRow(beach.lat, beach.lon, t, mapsUrl),
  ].filter(Boolean);

  const before = beforeGoItems({ lines: notForLines('beach', beach, { word: surfaceWord }) });
  const beforeRows = before.map((it) => ({
    key: it.key,
    icon: <ItemIcon name={it.icon} size={16} />,
    title: t(it.titleKey, { ...it.params, word: it.params?.word ? capFirst(it.params.word) : it.params?.word }),
    text: t(it.subKey, it.params),
    warn: Boolean(it.safety),
  }));
  const sources = [
    beach.osm && { label: 'OpenStreetMap', href: `https://www.openstreetmap.org/${beach.osm}` },
    beach.wiki && { label: 'Wikipedia', href: beach.wiki },
    beach.wd && { label: 'Wikidata', href: `https://www.wikidata.org/wiki/${beach.wd}` },
    ...(beach.credit || []).map((c) => ({ label: c })),
  ].filter(Boolean);

  const where = [beach.region, countryName].filter(Boolean).join(', ');
  const hook = highlights[0]?.line || headline;
  const protName = beach.prot?.name ? displayName(beach.prot.name) : (beach.protected?.name || '');
  const rankLine = rating && !rating.unscored ? natureRankLine({ rank: rating.rank }, t, { place: countryName }) : '';
  const onAdd = onAddToDay
    ? () => onAddToDay({ id: beach.id, cc: beach.cc, name: beach.name, lat: beach.lat, lon: beach.lon }) : null;
  const pdfModel = () => outdoorPdfModel({
    name: beach.name, hook, facts: keyFacts, why: highlights.slice(1).filter((h) => h.title), before, sources, t,
    extra: { photos, where, url: beachShareUrl(beach) },
  });
  const parkingEur = Number(beach.access?.parking?.eur_day);

  const jumps = [
    { key: 'water', id: 'ox-water', label: t('ox.jump.water') },
    { key: 'on', id: 'ox-on', label: t('ox.jump.onBeach') },
    { key: 'getting', id: 'ox-getting', label: t('detail.gettingThere') },
    { key: 'near', id: 'ox-near', label: t('ox.jump.nearby') },
  ];

  const hasPoint = Number.isFinite(beach.lat) && Number.isFinite(beach.lon);
  const map = hasPoint ? (
    <div className="sig-mapwrap">
      <PlaceMap lat={beach.lat} lon={beach.lon} label={t('detail.mapOf', { name: beach.name })} name={beach.name} />
      {point && (
        <CompassRosette
          deg={beach.aspect}
          label={t('sig.rosette', { dir: t(`sig.dir${point}`), deg: Math.round(beach.aspect) })}
        />
      )}
    </div>
  ) : null;

  const whyRates = parts.length > 0 || why.length > 0 ? (
    <>
      {why.length > 0 && <p className="pt-muted">{why.join(' ')}</p>}
      {beach.bestFor?.length > 0 && (
        <p className="pt-muted"><b>{t('beach.bestFor')}</b> {beach.bestFor.map((code) => bestForLabel(code, t)).join(', ')}</p>
      )}
      {tags.length > 0 && <p className="pt-muted">{tags.map((tag) => tag.label).join(', ')}</p>}
      {parts.length > 0 && (
        <div className="bpage-score">
          <p className="bpage-note">{t('beach.scoreNote')}</p>
          <ul className="bpage-bars">
            {parts.map((part) => (
              <li key={part.key}>
                <span className="bpage-bar-label">{part.label}</span>
                <span className="bpage-bar-track" aria-hidden="true">
                  <span className="bpage-bar-fill" style={{ width: `${part.pct}%` }} />
                </span>
                <span className="bpage-bar-n">{part.pct}</span>
                {part.weight != null && <small className="bpage-part-w">{t('beach.scoreWeight', { pct: part.weight })}</small>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  ) : null;

  return (
    <OutdoorPage
      name={beach.name}
      className="bpage-v2"
      backLabel={backLabel || t('beach.back')}
      onClose={onClose}
      fav={fav}
      onFav={onFav}
      onShare={onShare}
      resetKey={beach.id}
      toast={toast}
      photos={photos}
      photoFallback={{ city: beach.name, iso2: beach.cc }}
      head={{
        title: beach.name,
        sub: beach.nameLocal || '',
        iso2: beach.cc,
        where,
        rating,
        rank: rankLine,
        badges: [protName || null],
        lead: hook,
      }}
      facts={keyFacts}
      jumps={jumps}
      whyRates={whyRates}
      card={{
        title: t('ox.card.beach'),
        rows: [
          { key: 'w', label: t('beach.factWater'), value: waterWord },
          { key: 's', label: t('beach.factSurface'), value: capFirst(surfaceWord) },
          sea && { key: 'sea', label: t('ox.seaIn', { month: months.long(peakI + 1) }), value: `${nf(sea[peakI])}°` },
          Number.isFinite(parkingEur) && { key: 'p', label: t('ox.parking'), value: t('ox.parkDay', { price: formatMoney(parkingEur) }) },
        ].filter(Boolean),
        onAdd,
        secondary: [
          <OxLinkButton key="dir" href={mapsUrl} icon={<MapPinIcon size={16} />}>{t('ox.directions')}</OxLinkButton>,
          <Button key="pdf" variant="secondary" size="sm" loading={pdfBusy} iconStart={<DownloadIcon size={16} />}
            onClick={() => onPdf(pdfModel())}>
            {t('ox.pdf')}
          </Button>,
        ],
        stay: beach.base?.id && beach.base.city ? (
          <StayLine destId={beach.base.id} city={beach.base.city} km={beach.base.km} onOpen={onSelectDest} />
        ) : null,
      }}
      dock={{
        fig: waterWord ? t('ox.dockWater', { word: waterWord }) : (capFirst(surfaceWord) || beach.name),
        note: waterWord ? surfaceWord : '',
        sub: [sea ? t('ox.seaShort', { c: nf(sea[peakI]), month: months.long(peakI + 1) }) : lengthText,
          hasLifeguard ? t('ox.lgShort') : ''].filter(Boolean).join(', '),
      }}
      sources={sources}
      sourcesExtra={<ReportProblem item={{ layer: 'beach', id: beach.id, cc: beach.cc, name: beach.name }} />}
    >
      {(water || sea || waterCells.length > 0) && (
        <PSection id="ox-water" title={t('ox.jump.water')}>
          {water && <WaterClass cls={water.class} year={water.year || null} site={waterSite || null} />}
          {sea && (
            <div className="pt-block">
              <h3 className="pt-block-title">{t('ox.seaByMonth')}</h3>
              <MonthStrip values={sea} best={warmest} now={new Date().getMonth()} label={t('ox.seaByMonth')}
                monthLetter={months.letter} />
              <p className="ox-legend"><span><i aria-hidden="true" />{t('ox.warmest')}</span><span>{t('ox.seaUnit')}</span></p>
            </div>
          )}
          {waterCells.length > 0 && (
            <ul className="ox-cells">
              {waterCells.map((c) => (
                <li key={c.key}>
                  <small>{c.label}</small>
                  <b>{c.value}</b>
                  {c.text && <span>{c.text}</span>}
                </li>
              ))}
            </ul>
          )}
        </PSection>
      )}

      {(facil.length > 0 || beforeRows.length > 0) && (
        <PSection id="ox-on" title={t('ox.jump.onBeach')}>
          <Facilities items={facil} />
          <CheckRows rows={beforeRows} />
        </PSection>
      )}

      {(map || gettingRows.length > 0) && (
        <PSection id="ox-getting" title={t('detail.gettingThere')}>
          <RouteBlock map={map} />
          <CheckRows rows={gettingRows} />
        </PSection>
      )}

      {(exits.length > 0 || beach.nb) && (
        <PSection id="ox-near" title={t('ox.otherBeaches')}>
          <OtherNearby exits={exits} hrefOf={(r) => featureHref('beach', { id: r.id, cc: r.cc })} />
          <NearbyOutdoors
            row={beach}
            cc={beach.cc}
            headings={{ trail: 'nb.beach.trail', cycle: 'nb.beach.cycle' }}
            onOpen={onOpenNeighbour}
          />
        </PSection>
      )}
    </OutdoorPage>
  );
}
