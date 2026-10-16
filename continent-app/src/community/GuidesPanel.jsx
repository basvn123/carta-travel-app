import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import {
  PersonIcon, LinkIcon, CheckIcon, MapPinIcon, CloseIcon, ArrowLeftIcon,
} from '../components/Icons.jsx';
import { Button, Card, Chip, ChipGroup, IconButton } from '../components/ui/index.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { CountryFlag, CountryFlagStack, COUNTRY_ISO2 } from '../components/CountryFlag.jsx';
import { LoadingBlock, ErrorBlock } from '../components/StateBlocks.jsx';
import {
  listGuides, getGuide, reportGuideOpened, fmtMonths, fmtRoute, buildGuideUrl,
} from './guides.js';
import { foreignMemory, foreignTripPoints } from '../auth/foreignTrip.js';
import { ReportGuide } from './ReportGuide.jsx';

// One object for the life of the page: TripMap re-frames when it changes.
const GUIDE_MAP_PAD = { top: 26, left: 26, right: 26, bottom: 26 };
const ForeignTripMap = lazy(() => import('../map/TripMap.jsx').then((m) => ({ default: m.TripMap })));

/**
 * GuidesPanel, the plans people have published.
 *
 * The one browsable surface in this app's social layer, and it browses
 * DOCUMENTS. Migration 011's rule against listing people is untouched: there
 * is no directory here, no profile page, no follow. A handle appears because
 * it is the byline on something its author published, and tapping it does
 * nothing, because a byline is not a door into somebody's account.
 *
 * WHY IT MATTERS MORE THAN A FEED. Everything else in the friends layer is
 * empty until you have friends, which on day one nobody does. This is full
 * from the first visit and gives an account with nobody in it a reason to
 * come back, and gives an author an audience, which is the only honest
 * incentive to publish.
 *
 * PHOTOGRAPHS COME FROM THE READER'S OWN CATALOGUE, never from the payload,
 * the same rule the friend-trip map follows: the reader already had a picture
 * of Ghent before they opened this, so drawing one tells them nothing the
 * city's name had not, and no remote URL from a stranger's payload is ever
 * fetched.
 *
 * WHAT A GUIDE DOES NOT SAY is as designed as what it does. No exact dates
 * (a public diary of the nights you are away is a different product), no
 * crew (they published nothing), no spend. That is enforced in SQL by
 * migration 019, which narrows the friend projection rather than writing a
 * second whitelist beside it.
 */

/** One published guide as a kit tile: the photo, the title, then the route,
 *  its length and months, and the byline, all under the photo. */
function GuideCard({ guide, img, onOpen, t, lang }) {
  const when = fmtMonths(guide.months, lang, t('friends.dateJoin'));
  const nights = guide.nightsTotal;
  const who = guide.ownerName || `@${guide.ownerHandle}`;
  const facts = [
    fmtRoute(guide.cities),
    nights > 0 ? t(nights === 1 ? 'guides.nightsOne' : 'guides.nights', { n: nights }) : '',
    when,
  ].filter(Boolean).join(', ');
  return (
    <Card
      layout="tile"
      className="gld-card"
      media={<HeroImage url={img} city={guide.cities?.[0] || ''} iso2={COUNTRY_ISO2[guide.countries?.[0]] || ''} maxWidth={500} ratio={[4, 3]} sizes="(min-width: 769px) 280px, 90vw" />}
      title={guide.label || fmtRoute(guide.cities)}
      onOpen={onOpen}
      wrap
      meta={(
        <span className="gld-card-meta">
          {guide.countries.length > 0 && <CountryFlagStack countries={guide.countries} size={14} />}
          <span>{facts}</span>
          <span className="gld-card-by"><PersonIcon size={14} /> {t('guides.by', { who })}</span>
        </span>
      )}
    />
  );
}

function GuideView({ planId, destinations, onBack, t, lang }) {
  const [state, setState] = useState({ loading: true, guide: null });
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let live = true;
    setState({ loading: true, guide: null, failed: false });
    getGuide(planId)
      .then((guide) => {
        if (!live) return;
        setState({ loading: false, guide, failed: false });
        // The read is reported only after a successful load, and never for
        // your own guide (the RPC checks that itself), so the author's badge
        // means somebody actually opened it.
        if (guide) reportGuideOpened(planId);
      })
      // A failed read is not a guide that was taken down (T390, brief V3-12):
      // it used to land on "not published any more", which told somebody on a
      // train in a tunnel that the guide was gone.
      .catch(() => { if (live) setState({ loading: false, guide: null, failed: true }); });
    return () => { live = false; };
  }, [planId, tries]);

  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(id);
  }, [copied]);

  const guide = state.guide;
  const memory = useMemo(() => (guide ? foreignMemory(guide.payload) : null), [guide]);
  const points = useMemo(
    () => (guide ? foreignTripPoints(guide.stops, memory, destinations) : []),
    [guide, memory, destinations],
  );

  const copyLink = async () => {
    const url = buildGuideUrl(planId);
    if (!url) return;
    setCopyFailed(false);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Said in one line under the button, so a refused clipboard does not
      // look like a copied link.
      setCopyFailed(true);
    }
  };

  if (state.loading) return <div className="panel-section"><LoadingBlock label={t('saved.loading')} rows={3} /></div>;
  if (!guide) {
    return (
      <div className="panel-section">
        <Button variant="quiet" size="sm" className="gld-back" iconStart={<ArrowLeftIcon size={16} />} onClick={onBack}>{t('guides.back')}</Button>
        {state.failed ? (
          <ErrorBlock message={t('guides.loadFailed')} onRetry={() => setTries((n) => n + 1)} retryLabel={t('layer.retry')} />
        ) : (
          <p className="account-section-hint">{t('guides.gone')}</p>
        )}
      </div>
    );
  }

  const who = guide.ownerName || `@${guide.ownerHandle}`;
  const months = [...new Set(guide.stops.map((s) => s.month).filter(Boolean))];
  const when = fmtMonths(months, lang, t('friends.dateJoin'));
  const nights = guide.stops.reduce((n, s) => n + (Number(s.nights) || 0), 0);

  return (
    <>
      <div className="panel-section">
        <Button variant="quiet" size="sm" className="gld-back" iconStart={<ArrowLeftIcon size={16} />} onClick={onBack}>{t('guides.back')}</Button>
        <h2 className="gld-title">{guide.label || fmtRoute(guide.stops.map((s) => s.city))}</h2>
        <div className="gld-byline">
          <span className="gld-by"><PersonIcon size={12} /> {t('guides.by', { who })}</span>
          {nights > 0 && (
            <span className="gld-meta">
              {t(nights === 1 ? 'guides.nightsOne' : 'guides.nights', { n: nights })}
            </span>
          )}
          {when && <span className="gld-meta">{when}</span>}
        </div>
        <Button size="sm" iconStart={copied ? <CheckIcon size={16} /> : <LinkIcon size={16} />} onClick={copyLink} aria-live="polite">
          {copied ? t('share.copied') : t('guides.copyLink')}
        </Button>
        {copyFailed && <p className="auth-error" role="alert">{t('share.copyFailed')}</p>}
      </div>

      {points.length > 0 && (
        <div className="panel-section">
          <div className="gld-map">
            <Suspense fallback={<div className="saved-map-loading" aria-hidden="true" />}>
              <ForeignTripMap
                stops={points}
                showRoute={points.length > 1}
                scrollZoom={false}
                zoomControls
                easeToSelected={false}
                padBottom={0}
                fitMaxZoom={7}
                fitPadding={GUIDE_MAP_PAD}
              />
            </Suspense>
          </div>
        </div>
      )}

      {guide.stops.length > 0 && (
        <div className="panel-section">
          <h3 className="gld-h">{t('guides.routeTitle')}</h3>
          <ol className="gld-stops">
            {guide.stops.map((s) => (
              <li className="gld-stop" key={`${s.position}${s.destination_id || s.city}`}>
                <span className="gld-stop-mark">
                  {s.country ? <CountryFlag country={s.country} size={13} /> : <MapPinIcon size={13} />}
                </span>
                <span className="gld-stop-city">{s.city}</span>
                {Number(s.nights) > 0 && (
                  <span className="gld-stop-nights">
                    {t(Number(s.nights) === 1 ? 'guides.nightsOne' : 'guides.nights', { n: s.nights })}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {memory?.story && (
        <div className="panel-section">
          <h3 className="gld-h">{t('guides.storyTitle')}</h3>
          <p className="gld-story">{memory.story}</p>
        </div>
      )}

      {(memory?.highlights || []).length > 0 && (
        <div className="panel-section">
          <h3 className="gld-h">{t('guides.highlightsTitle')}</h3>
          <ul className="gld-highlights">
            {memory.highlights.map((h, i) => (
              <li key={`${i}${String(h).slice(0, 12)}`}>{typeof h === 'string' ? h : h?.text || ''}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="panel-section">
        <p className="gld-note">{t('guides.privacyNote')}</p>
      </div>

      {/* The notice-and-action door (DSA Article 16, migration 037): on
          every guide, for every reader, signed in or not. */}
      <div className="panel-section">
        <ReportGuide key={planId} planId={planId} />
      </div>
    </>
  );
}

export function GuidesPanel({ onClose, destinations, openGuideId, onPublish = null }) {
  const { t, lang } = useI18n();
  // A real dialog over the page (T434 audit P1-8): it names itself, keeps
  // Tab inside and closes on Escape.
  const boxRef = useRef(null);
  useFocusTrap(boxRef, onClose);
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [country, setCountry] = useState('');
  const [open, setOpen] = useState(openGuideId || '');

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    listGuides({ country: country || null })
      .then((rows) => { if (live) setGuides(rows); })
      .catch(() => { if (live) { setGuides([]); setFailed(true); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [country, tries]);

  // Every country that actually has a guide, so the filter can never offer a
  // chip that returns nothing. Built from the unfiltered first load only,
  // which is why it holds its own state rather than reading `guides`.
  const [countries, setCountries] = useState([]);
  useEffect(() => {
    if (country || countries.length) return;
    setCountries([...new Set(guides.flatMap((g) => g.countries))].sort());
  }, [guides, country, countries.length]);

  const imgFor = (g) => {
    for (const id of g.destinationIds) {
      const u = destinations?.[id]?.image?.url;
      if (u) return u;
    }
    return null;
  };

  return (
    <div className="panel open account-panel guides-panel" role="dialog" aria-modal="true" aria-labelledby="guides-title" ref={boxRef}>
      <div className="panel-header gld-head">
        <h1 className="gld-page-title" id="guides-title">{t('guides.title')}</h1>
        <IconButton label={t('guides.close')} onClick={onClose}><CloseIcon size={16} /></IconButton>
      </div>

      {open ? (
        <GuideView
          planId={open}
          destinations={destinations}
          onBack={() => setOpen('')}
          t={t}
          lang={lang}
        />
      ) : (
        <>
          {countries.length > 1 && (
            <div className="panel-section">
              <ChipGroup label={t('guides.filterLabel')} className="gld-filters">
                <Chip kind="choice" selected={country === ''} onClick={() => setCountry('')}>{t('guides.everywhere')}</Chip>
                {countries.map((c) => (
                  <Chip key={c} kind="choice" selected={country === c} icon={<CountryFlag country={c} size={14} />} onClick={() => setCountry(c)}>
                    {c}
                  </Chip>
                ))}
              </ChipGroup>
            </div>
          )}

          <div className="panel-section">
            {loading ? (
              <LoadingBlock label={t('saved.loading')} rows={3} shape="card" />
            ) : failed ? (
              <ErrorBlock message={t('state.guidesFailed')} onRetry={() => setTries((n) => n + 1)} retryLabel={t('layer.retry')} />
            ) : guides.length === 0 ? (
              <div className="frn-empty empty-act">
                <p>{t('guides.empty')}</p>
                {/* A guide is a saved trip its owner made public, so the way
                    to write the first one starts in My trips. */}
                {onPublish && (
                  <Button onClick={onPublish}>{t('guides.publishCta')}</Button>
                )}
              </div>
            ) : (
              <div className="gld-grid">
                {guides.map((g) => (
                  <GuideCard
                    key={g.tripPlanId}
                    guide={g}
                    img={imgFor(g)}
                    onOpen={() => setOpen(g.tripPlanId)}
                    t={t}
                    lang={lang}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
