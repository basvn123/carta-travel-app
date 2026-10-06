import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { FigureFooter } from './HonestFooters.jsx';
import { LAKE_KIND } from '../lib/footers.js';
import { NearbyOutdoors } from './NearbyOutdoors.jsx';
import { DetailPage, PlaceMap } from './DetailSkeleton.jsx';
import { usePlaceExits } from '../hooks/usePlaceExits.js';
import {
  stripCells, previewWords, pointCentre, ACCESS_LEVEL,
} from '../lib/detailSkeleton.js';
import { NotFor } from '../components/NotFor.jsx';
import { notForLines } from '../lib/notFor.js';
import {
  lakeHeadline, lakeWhy, lakeTags, lakeSwim, lakeSeason, lakeHazards,
  bestForLabel, componentLabel, serviceLabel, accessLabel,
  COMPONENT_ORDER, SUB_ORDER, lakeRating, isHiddenGem,
} from '../lib/lakeStory.js';
import { lakeShareUrl, loadLakes } from '../lib/lakes.js';
import { trailheadDirectionsUrl, shareTrailLink } from '../lib/trailExport.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import {
  MapPinIcon, LinkIcon, ChevronRightIcon,
  CameraIcon, BootIcon, AlertIcon, BulbIcon, InfoIcon, StarIcon,
  SunIcon, LoopIcon,
} from '../components/Icons.jsx';
import { lakeShore, shoreSummary } from '../lib/derivedModules.js';
import { LakeShore } from './DerivedModules.jsx';
import { srcSetFor, fallbackSrc } from '../lib/heroImage.js';
import { LayerPhoto, HERO_SIZES, THUMB_SIZES } from '../components/LayerPhoto.jsx';
import { LakeSignature } from './Signature.jsx';

/**
 * The lake page: one published water body, and the argument for going there.
 *
 * It answers five things, and the first one is not the score.
 *
 *   can I swim here    the verdict, in its own banner, at the top, coloured,
 *                      with the evidence that produced it named. Everything
 *                      else on this page is a recommendation; this is the one
 *                      field that can hurt somebody, so it is the one thing
 *                      that cannot be scrolled past. A lake where swimming is
 *                      forbidden says so above its own photograph.
 *   where is it        a pin, the region, the country, the coordinates, and
 *                      one link that opens the spot in a maps app.
 *   what does it look  up to five photographs, each credited to the person
 *   like               who took it and the licence they released it under.
 *   why this one       the composed explanation, every sentence of it mapped
 *                      to a field in the data (lib/lakeStory.js), then the
 *                      hazards in their own block underneath.
 *   is the number      three sub scores on their own, then the six weighted
 *   honest             components, so the ranking can be checked rather than
 *                      believed.
 *
 * Since T180 the page draws through the shared detail skeleton
 * (DetailSkeleton.jsx). The swim verdict and the hazards sit in its alert
 * slot, the one place that never folds, for the reason above. The map is a
 * lazy chunk (PointMap.jsx). The signature slot holds the lake's own figure
 * (Signature.jsx, T181): the water temperature by month as twelve bars, and
 * the depth-versus-area wedge.
 *
 * The month strip is an ESTIMATE and says so in its own subtitle. There is no
 * free per lake water temperature series for Europe, so the pipeline models it
 * from CHELSA air normals with a documented correction. Presenting that as
 * a measurement would be the dishonest half of a useful feature.
 */

const fmtCoord = (n) => (Number.isFinite(n) ? n.toFixed(4) : '');
const MONTH_CODES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug',
  'sep', 'oct', 'nov', 'dec'];

/** A photograph's credit line, in the TASL order Commons expects. Everything
 *  the file did not carry is dropped rather than filled with "unknown". */
function ImageCredit({ image, t }) {
  if (!image || (!image.by && !image.lic)) return null;
  const by = String(image.by || '').trim();
  const lic = String(image.lic || '').trim();
  return (
    <p className="bpage-credit">
      <CameraIcon size={12} />
      {/* One flex item, not three. .bpage-credit is a flex row with a gap, so
          an author, a bare ", " and a licence as separate children come out as
          "Sharon Hahn Darlin , CC BY 2.0" with the gap on both sides of the
          comma. A licence notice is the last thing that should look careless,
          so the whole line is one item and lays out inline inside it. */}
      <span className="lpage-credit-line">
        {by && (
          <a href={image.page} target="_blank" rel="noopener noreferrer">{by}</a>
        )}
        {by && lic ? ', ' : ''}
        {lic && (image.licUrl
          ? <a href={image.licUrl} target="_blank" rel="noopener noreferrer">{lic}</a>
          : <span>{lic}</span>)}
        {!by && (
          <a href={image.page} target="_blank" rel="noopener noreferrer">
            {t('lake.photos')}
          </a>
        )}
      </span>
    </p>
  );
}

/** The way in as a level: only the access field says anything about it. */
const lakeLevel = (l) => ACCESS_LEVEL[l?.access] || 0;

export function LakePage({ lake, countryName, onClose, onSelectDest, warmC = 18, onOpenNeighbour, fav = false, onFav = null, onAddToDay = null }) {
  const { t, lang } = useI18n();
  const [shot, setShot] = useState(0);
  const [toast, setToast] = useState(null);

  useEffect(() => { setShot(0); }, [lake?.id]);

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

  const images = lake?.images || [];
  const main = images[shot] || images[0] || null;
  const why = useMemo(() => (lake ? lakeWhy(lake, t) : []), [lake, t]);
  const tags = useMemo(() => (lake ? lakeTags(lake, t, 4) : []), [lake, t]);
  const rating = useMemo(() => (lake ? lakeRating(lake, t) : null), [lake, t]);
  const swim = useMemo(() => (lake ? lakeSwim(lake, t) : null), [lake, t]);
  const hazards = useMemo(() => (lake ? lakeHazards(lake, t) : []), [lake, t]);
  const headline = useMemo(
    () => (lake ? lakeHeadline(lake, t, countryName) : ''),
    [lake, t, countryName],
  );

  if (!lake) return null;

  const mapsUrl = trailheadDirectionsUrl(lake.lat, lake.lon);
  const onShare = async () => {
    const how = await shareTrailLink(lake.name, lakeShareUrl(lake));
    if (how === 'copied') setToast(t('trip.linkCopied'));
  };

  const size = lake.size || {};
  const seasonLine = lakeSeason(lake, t);
  const facts = [
    size.areaKm2 && {
      key: 'area',
      label: t('lake.factArea'),
      value: `${size.areaKm2.toLocaleString(lang)} km2`,
      mono: true,
    },
    size.depthM && {
      key: 'depth',
      label: t('lake.factDepth'),
      value: `${size.depthM.toLocaleString(lang)} m`,
      mono: true,
    },
    size.elevM != null && {
      key: 'elev',
      label: t('lake.factElevation'),
      value: `${size.elevM.toLocaleString(lang)} m`,
      mono: true,
    },
    lake.water && {
      key: 'water',
      label: t('lake.factWater'),
      value: t(`lake.water${lake.water.class}`),
      note: lake.water.sites > 0
        ? t('lake.factSites', { n: lake.water.sites })
        : (lake.water.site || ''),
    },
    lake.access && {
      key: 'access',
      label: t('lake.factAccess'),
      value: accessLabel(lake.access, t),
    },
    lake.protected && {
      key: 'protected',
      label: t('lake.factProtected'),
      value: lake.protected.name,
      note: lake.protected.np ? t('lake.nationalPark') : lake.protected.kind,
    },
    lake.services?.length && {
      key: 'services',
      label: t('lake.factServices'),
      value: lake.services.map((s) => serviceLabel(s, t)).filter(Boolean).join(', '),
    },
    lake.shared?.length > 1 && {
      key: 'shared',
      label: t('lake.factShared'),
      value: lake.shared.join(', '),
    },
  ].filter(Boolean);

  const kindKey = `lake.kindWord${(lake.kind || 'lake').charAt(0).toUpperCase()}${(lake.kind || 'lake').slice(1)}`;
  const kindWord = t(kindKey);
  const cells = stripCells({
    level: lakeLevel(lake),
    word: accessLabel(lake.access, t),
    type: kindWord && kindWord !== kindKey ? kindWord : t('lake.kindWordLake'),
    number: size.areaKm2 ? `${size.areaKm2.toLocaleString(lang)} km2` : '',
  }, t);
  const subs = SUB_ORDER.filter((key) => lake.sub?.[key] != null);

  // The derived module (T182): how much path runs along the water, from the
  // shore sweep's figure on the wire. Always rendered; an unswept shore says so.
  const shore = lakeShore(lake);

  // Slot 6: the collapsed rows (T180).
  const rows = [
    (why.length > 0 || subs.length > 0 || lake.bestFor?.length > 0 || tags.length > 0) && {
      key: 'why',
      icon: BulbIcon,
      label: t('lake.whyHead'),
      summary: previewWords(why[0] || headline),
      body: (
        <div className="bpage-why">
          {/* The three sub scores, side by side, because choosing between a
              cold beautiful lake and a warm ordinary one is the actual
              decision and one blended number hides it. */}
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
          {why.length > 0 && <p className="bpage-prose">{why.join(' ')}</p>}
          {lake.bestFor?.length > 0 && (
            <p className="bpage-for">
              <b>{t('lake.bestFor')}</b>
              {' '}
              {lake.bestFor.map((code) => bestForLabel(code, t)).join(', ')}
            </p>
          )}
          {tags.length > 0 && (
            <ul className="bpage-tags">
              {tags.map((tag) => <li key={tag.code}>{tag.label}</li>)}
            </ul>
          )}
        </div>
      ),
    },
    {
      key: 'shore',
      icon: LoopIcon,
      label: t('derived.shoreHead'),
      summary: previewWords(shoreSummary(shore, t, lang)),
      body: <LakeShore shore={shore} t={t} lang={lang} />,
    },
    facts.length > 0 && {
      key: 'facts',
      icon: InfoIcon,
      label: t('lake.factsHead'),
      summary: previewWords(facts.slice(0, 3).map((f) => f.value).join(', ')),
      body: (
        <div className="bpage-facts">
          <dl>
            {facts.map((fact) => (
              <div key={fact.key} className="bpage-fact">
                <dt>{fact.label}</dt>
                <dd className={fact.mono ? 'mono' : ''}>
                  {fact.value}
                  {fact.note && <small>{fact.note}</small>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ),
    },
    lake.walks?.length > 0 && {
      key: 'walks',
      icon: BootIcon,
      label: t('lake.walksHead'),
      summary: previewWords(lake.walks.map((w) => w.name).join(', ')),
      body: (
        <div className="lpage-walks">
          <ul>
            {lake.walks.map((walk) => (
              <li key={walk.id}>
                <BootIcon size={13} />
                <span>{walk.name}</span>
                {walk.km > 0 && <small className="mono">{walk.km} km</small>}
              </li>
            ))}
          </ul>
          {lake.nWalks > lake.walks.length && (
            <p className="bpage-note">
              {t('lake.walksMore', { n: lake.nWalks - lake.walks.length })}
            </p>
          )}
        </div>
      ),
    },
    COMPONENT_ORDER.some((key) => lake.comp?.[key] != null) && {
      key: 'score',
      icon: StarIcon,
      label: t('lake.scoreHead'),
      summary: previewWords(t('lake.scoreNote')),
      body: (
        <div className="bpage-score">
          <p className="bpage-note">{t('lake.scoreNote')}</p>
          <ul className="bpage-bars">
            {COMPONENT_ORDER.filter((key) => lake.comp?.[key] != null).map((key) => (
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
      ),
    },
    images.length > 1 && {
      key: 'photos',
      icon: CameraIcon,
      label: t('lake.photos'),
      summary: t('detail.photoCount', { n: images.length }),
      body: (
        <div className="bpage-strip" role="tablist" aria-label={t('lake.photos')}>
          {images.map((img, i) => (
            <button
              key={img.page || i}
              type="button"
              role="tab"
              aria-selected={i === shot}
              className={`bpage-thumb ${i === shot ? 'on' : ''}`}
              onClick={() => setShot(i)}
            >
              <LayerPhoto layer="lakes" image={img} src={img.u} sizes={THUMB_SIZES} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ),
    },
  ].filter(Boolean);

  return (
    <DetailPage
      name={lake.name}
      className="bpage lpage"
      backLabel={t('lake.back')}
      onClose={onClose}
      fav={fav}
      onFav={onFav}
      onShare={onShare}
      resetKey={lake.id}
      toast={toast}
      hero={{
        sharedKey: lake.id,
        cells,
        media: main ? (
          <LayerPhoto
            layer="lakes"
            image={main}
            hero
            className="dsk-hero-img bpage-shot"
            src={fallbackSrc(main.big || main.u, 960)}
            srcSet={srcSetFor(main.big || main.u, 1920)}
            sizes="100vw"
            alt={lake.name}
            width={16}
            height={10}
            loading="eager"
            decoding="async"
          />
        ) : null,
        credit: main ? <ImageCredit image={main} t={t} /> : null,
      }}
      head={(
        <>
          <h1 className="bpage-name">
            <CountryFlag country={lake.cc} size={15} className="bpage-flag" />
            {lake.name}
          </h1>
          {lake.nameLocal && <p className="bpage-local">{lake.nameLocal}</p>}
          <p className="dsk-crumb">{[lake.region, countryName].filter(Boolean).join(', ')}</p>
          {onAddToDay && (
            <button type="button" className="feat-dayplan" onClick={() => onAddToDay({ id: lake.id, cc: lake.cc, name: lake.name, lat: lake.lat, lon: lake.lon })}>
              <SunIcon size={14} />
              <span>{t('feat.addToDay')}</span>
            </button>
          )}
          <div className="bpage-scorerow">
            <ScoreChip rating={rating} size="lg" />
            <span className="bpage-band">{t(`lake.band${rating.tier}`)}</span>
            {isHiddenGem(lake) && (
              <span className="lpage-gem">{t('lake.hiddenGem')}</span>
            )}
          </div>
        </>
      )}
      hook={headline}
      notFor={<NotFor lines={notForLines('lake', lake)} />}
      alert={(
        <>
          {/* The verdict never folds. See the file header. */}
          <div className={`lpage-swim lpage-swim-${swim.tone}`} role="note">
            <span className="lpage-swim-word">{swim.label}</span>
            {swim.source && <span className="lpage-swim-src">{swim.source}</span>}
            {seasonLine && <span className="lpage-swim-season">{seasonLine}</span>}
          </div>
          {hazards.length > 0 && (
            <section className="lpage-hazards">
              <h2>
                <AlertIcon size={15} />
                {t('lake.hazardsHead')}
              </h2>
              <ul>
                {hazards.map((h) => <li key={h.code}>{h.line}</li>)}
              </ul>
            </section>
          )}
        </>
      )}
      map={<PlaceMap lat={lake.lat} lon={lake.lon} label={t('detail.mapOf', { name: lake.name })} />}
      signature={<LakeSignature lake={lake} warmC={warmC} />}
      rows={rows}
      gettingThere={(
        <>
          <a className="bpage-where" href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <MapPinIcon size={15} />
            <span className="bpage-where-text">{t('detail.directions')}</span>
            <span className="bpage-where-coord">
              {fmtCoord(lake.lat)}, {fmtCoord(lake.lon)}
            </span>
            <ChevronRightIcon size={14} />
          </a>
          {lake.base && (
            <button type="button" className="bpage-base" onClick={() => onSelectDest?.(lake.base.id)}>
              <span>
                {t('lake.basedOn', { city: lake.base.city })}
                <small>{t('lake.basedKm', { km: Math.round(lake.base.km) })}</small>
              </span>
              <ChevronRightIcon size={15} />
            </button>
          )}
        </>
      )}
      takeAway={(
        <button type="button" className="tpage-act" onClick={onShare}>
          <LinkIcon size={15} />
          <span>{t('detail.sendLink')}</span>
        </button>
      )}
      exits={exits}
      nearby={(
        <NearbyOutdoors
          row={lake}
          cc={lake.cc}
          headings={{ trail: 'nb.lake.trail', peak: 'nb.lake.peak' }}
          onOpen={onOpenNeighbour}
        />
      )}
      sources={(
        <div className="bpage-sources">
          <ul>
            {lake.wiki && (
              <li>
                <a href={lake.wiki} target="_blank" rel="noopener noreferrer">
                  <LinkIcon size={12} />
                  {t('lake.onWikipedia')}
                </a>
              </li>
            )}
            {lake.osm && (
              <li>
                <a href={`https://www.openstreetmap.org/${lake.osm}`} target="_blank" rel="noopener noreferrer">
                  <LinkIcon size={12} />
                  {t('lake.onOsm')}
                </a>
              </li>
            )}
            {lake.wd && (
              <li>
                <a href={`https://www.wikidata.org/wiki/${lake.wd}`} target="_blank" rel="noopener noreferrer">
                  <LinkIcon size={12} />
                  {t('lake.onWikidata')}
                </a>
              </li>
            )}
          </ul>
          {lake.credit?.length > 0 && (
            <p className="bpage-attrib">{lake.credit.join('. ')}</p>
          )}
          <FigureFooter kinds={facts.map((f) => LAKE_KIND[f.key])} />
        </div>
      )}
    />
  );
}
