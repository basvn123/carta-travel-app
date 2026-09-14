import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import {
  PersonIcon, LinkIcon, CheckIcon, ChevronDownIcon, MapPinIcon,
} from '../components/Icons.jsx';
import { CountryFlag, CountryFlagStack } from '../components/CountryFlag.jsx';
import {
  listGuides, getGuide, reportGuideOpened, fmtMonths, fmtRoute, buildGuideUrl,
} from './guides.js';
import { foreignMemory, foreignTripPoints } from '../auth/foreignTrip.js';

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

function GuideCard({ guide, img, onOpen, t, lang }) {
  const when = fmtMonths(guide.months, lang, t('friends.dateJoin'));
  const nights = guide.nightsTotal;
  const who = guide.ownerName || `@${guide.ownerHandle}`;
  return (
    <button type="button" className="gld-card" onClick={onOpen}>
      <span className="gld-card-photo">
        {img
          ? <img src={img} alt="" loading="lazy" decoding="async" />
          : <span className="gld-card-nophoto" aria-hidden="true"><MapPinIcon size={18} /></span>}
        {guide.countries.length > 0 && (
          <span className="gld-card-flags"><CountryFlagStack countries={guide.countries} size={13} /></span>
        )}
      </span>
      <span className="gld-card-body">
        <b className="gld-card-title">{guide.label || fmtRoute(guide.cities)}</b>
        <span className="gld-card-route">{fmtRoute(guide.cities)}</span>
        <span className="gld-card-facts">
          {nights > 0 && (
            <span className="gld-fact">
              {t(nights === 1 ? 'guides.nightsOne' : 'guides.nights', { n: nights })}
            </span>
          )}
          {when && <span className="gld-fact">{when}</span>}
        </span>
        <span className="gld-card-by">
          <PersonIcon size={11} />
          {t('guides.by', { who })}
        </span>
      </span>
    </button>
  );
}

function GuideView({ planId, destinations, onBack, t, lang }) {
  const [state, setState] = useState({ loading: true, guide: null });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    getGuide(planId)
      .then((guide) => {
        if (!live) return;
        setState({ loading: false, guide });
        // The read is reported only after a successful load, and never for
        // your own guide (the RPC checks that itself), so the author's badge
        // means somebody actually opened it.
        if (guide) reportGuideOpened(planId);
      })
      .catch(() => { if (live) setState({ loading: false, guide: null }); });
    return () => { live = false; };
  }, [planId]);

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
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch { /* a refused clipboard is not worth an error banner */ }
  };

  if (state.loading) return <div className="panel-section"><div className="footnote">{t('saved.loading')}</div></div>;
  if (!guide) {
    return (
      <div className="panel-section">
        <button type="button" className="gld-back" onClick={onBack}>
          <ChevronDownIcon size={14} className="gld-back-chev" /> {t('guides.back')}
        </button>
        <p className="account-section-hint">{t('guides.gone')}</p>
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
        <button type="button" className="gld-back" onClick={onBack}>
          <ChevronDownIcon size={14} className="gld-back-chev" /> {t('guides.back')}
        </button>
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
        <button type="button" className="gld-copy" onClick={copyLink}>
          {copied ? <CheckIcon size={13} /> : <LinkIcon size={13} />}
          {copied ? t('share.copied') : t('guides.copyLink')}
        </button>
      </div>

      {points.length > 0 && (
        <div className="panel-section">
          <div className="gld-map">
            <Suspense fallback={<div className="saved-map-loading" aria-hidden="true" />}>
              <ForeignTripMap
                stops={points}
                showRoute={points.length > 1}
                scrollZoom={false}
                cooperativeGestures
                zoomControls
                easeToSelected={false}
                padBottom={0}
                fitMaxZoom={7}
                fitPadding={{ top: 26, left: 26, right: 26, bottom: 26 }}
              />
            </Suspense>
          </div>
        </div>
      )}

      {guide.stops.length > 0 && (
        <div className="panel-section">
          <div className="section-title">{t('guides.routeTitle')}</div>
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
          <div className="section-title">{t('guides.storyTitle')}</div>
          <p className="gld-story">{memory.story}</p>
        </div>
      )}

      {(memory?.highlights || []).length > 0 && (
        <div className="panel-section">
          <div className="section-title">{t('guides.highlightsTitle')}</div>
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
    </>
  );
}

export function GuidesPanel({ onClose, destinations, openGuideId }) {
  const { t, lang } = useI18n();
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [country, setCountry] = useState('');
  const [open, setOpen] = useState(openGuideId || '');

  useEffect(() => {
    let live = true;
    setLoading(true);
    listGuides({ country: country || null })
      .then((rows) => { if (live) setGuides(rows); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [country]);

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
    <div className="panel open account-panel guides-panel">
      {/* Same chrome as the account and My trips slide-overs, deliberately:
          a third bespoke shell would be a third thing to keep in step. */}
      <div className="panel-header">
        <button className="panel-close" onClick={onClose} aria-label={t('guides.close')}>x</button>
        <div className="panel-tag">{t('guides.tag')}</div>
        <h2 className="panel-city account-heading">{t('guides.title')}</h2>
      </div>

      <div className="panel-section">
        <p className="account-section-hint">{t('guides.lede')}</p>
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
              <div className="gld-filters" role="group" aria-label={t('guides.filterLabel')}>
                <button
                  type="button"
                  className={`gld-chip${country === '' ? ' on' : ''}`}
                  aria-pressed={country === ''}
                  onClick={() => setCountry('')}
                >
                  {t('guides.everywhere')}
                </button>
                {countries.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`gld-chip${country === c ? ' on' : ''}`}
                    aria-pressed={country === c}
                    onClick={() => setCountry(c)}
                  >
                    <CountryFlag country={c} size={12} />
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="panel-section">
            {loading ? (
              <div className="footnote">{t('saved.loading')}</div>
            ) : guides.length === 0 ? (
              <p className="frn-empty">{t('guides.empty')}</p>
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
