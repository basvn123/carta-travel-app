import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { usePageArrival } from '../hooks/usePageArrival.js';
import { useBaseDay } from '../hooks/useBaseDay.js';
import { useDayView } from '../hooks/useDayView.js';
import { Button, Chip } from '../components/ui/index.js';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import {
  PlusIcon, ChevronRightIcon, CheckIcon, CloseIcon, ParkingIcon, BusIcon, TrainIcon, FerryIcon, MapPinIcon,
} from '../components/Icons.jsx';
import { formatMoney } from '../lib/money.js';
import { featureHref, linkOpener } from '../lib/featureHref.js';
import { capFirst } from '../lib/detailSkeleton.js';
import { PageBar } from './PageBar.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { KeyFacts } from './KeyFacts.jsx';
import { SlopeProfile } from './RouteFigures.jsx';
import { SourcesLine } from './ItemParts.jsx';
import { JumpBar, PSection, scrollToSection, useWide } from './PageTemplate.jsx';
import '../styles/89-outdoor-page.css';

/**
 * The outdoor pages on the place page's template (T919 to T922, the owner's
 * approved spec of 2026-10-30, "Outdoor pages: the place page's template,
 * with each kind's own facts").
 *
 * The trail, beach, lake, mountain and cycling pages draw through the shell
 * and the parts here, on the same classes as the destination page
 * (PageTemplate.jsx, 88-place-template.css), so every detail page is one
 * family: the photographs (the 1 + 4 mosaic, a swipe on a phone), the head,
 * four to six facts, a sticky jump bar over one long page, and a side card
 * from 1024 px that holds the page's one primary, "Add to a day plan". Below
 * 1024 px a bar at the foot holds the shortest figure line and "Add to day",
 * and the card's secondaries and its "Stay nearby" line sit in the page.
 *
 * A section, a row or a cell without data is not drawn and its jump link
 * goes with it. Styles: src/styles/89-outdoor-page.css (class prefix .ox-).
 *
 *   OutdoorPage   the shell: page bar, photographs, head, facts, jump bar,
 *                 sections (children), the score fold, sources, the card
 *                 and the foot bar
 *   StayLine      "Stay nearby": the town, its distance and its day price
 *   RouteBlock    the full-width map, then the height profile
 *   HeightProfile the scrubbable profile with a scale on the height axis
 *   GradeCard     the SAC grade as six steps with plain words
 *   CheckRows     icon rows with a title and a line
 *   Facilities    a grid of what is there (and, marked, what is not)
 *   WaterClass    the EU bathing water class as four named steps
 *   MonthStrip    one figure a month as twelve bars
 *   SafetyBlock   112 and the weather, short and fixed
 *   AlongCards    the sights along the way as photo cards
 *   OtherNearby   "Other X nearby": photo cards, a map spot without a photo
 */

/** The model the PDF prints: what this page shows (T430's rule). */
export function outdoorPdfModel({ name, hook = null, facts = [], why = [], before = [], sources = [], extra = null, t }) {
  return {
    name,
    hook: typeof hook === 'string' ? hook : null,
    facts: (facts || []).map((c) => ({ label: c.label, value: typeof c.value === 'string' ? c.value : String(c.text || '') })),
    why: (why || []).map((h) => ({ title: h.title || '', line: h.line || '' })),
    before: (before || []).map((it) => {
      const p = { ...it.params };
      if (p.word) p.word = capFirst(p.word);
      return { title: t(it.titleKey, p), line: t(it.subKey, p), safety: Boolean(it.safety) };
    }),
    sources: (sources || []).filter((x) => x && x.label),
    ...(extra || {}),
  };
}

/** A route's name without the OSM route number in brackets: "Mount Korab
 *  (9/1)" reads "Mount Korab", and the number moves to a badge. */
export function plainName(name, ref = null) {
  const s = String(name || '').trim();
  const m = s.match(/^(.*\S)\s*\(([^()]*)\)$/);
  if (!m) return { name: s, ref: ref || null };
  const inner = m[2].trim();
  // Only a number-like ref leaves the name; "(Lake Bled)" stays.
  if (!/\d/.test(inner) || inner.length > 12) return { name: s, ref: ref || null };
  return { name: m[1], ref: ref || inner };
}

const MONTH_CODES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** A month as 1 to 12, from a number or a code ("jun", "June"); null else. */
export function monthIndex(v) {
  if (typeof v === 'number') return v >= 1 && v <= 12 ? Math.round(v) : null;
  const n = MONTH_CODES.indexOf(String(v || '').slice(0, 3).toLowerCase()) + 1;
  return n || null;
}

/** Month names in the reader's language: short(m) and letter(i0). */
export function useMonthWords() {
  const { lang } = useI18n();
  return React.useMemo(() => {
    const fmt = (style) => {
      try { return new Intl.DateTimeFormat(lang, { month: style, timeZone: 'UTC' }); } catch { return null; }
    };
    const s = fmt('short');
    const l = fmt('narrow');
    const long = fmt('long');
    const at = (m) => new Date(Date.UTC(2026, m - 1, 15));
    return {
      short: (m) => (s ? s.format(at(m)) : String(m)),
      long: (m) => (long ? long.format(at(m)) : String(m)),
      letter: (i0) => (l ? l.format(at(i0 + 1)) : String(i0 + 1)),
    };
  }, [lang]);
}

const TRANSIT_ICONS = { bus: BusIcon, train: TrainIcon, tram: TrainIcon, ferry: FerryIcon };

/**
 * The access block of the data contract as check rows: parking (its name,
 * how far from the place, free or its price a day) and up to three stops
 * (bus, train, tram or ferry, how far on foot). Absent data, no rows.
 */
export function accessRows(access, t, lang) {
  if (!access) return [];
  const dist = (m) => (m >= 1000
    ? `${(m / 1000).toLocaleString(lang, { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);
  const p = access.parking || null;
  const fee = p ? (Number.isFinite(p.eur_day) ? t('ox.parkDay', { price: formatMoney(p.eur_day) })
    : p.fee === false ? t('ox.parkFree') : p.fee === true ? t('ox.parkPaid') : '') : '';
  const stops = (Array.isArray(access.transit) ? access.transit : []).filter((s) => s && s.name).slice(0, 3);
  return [
    p && {
      key: 'park',
      icon: <ParkingIcon size={16} />,
      title: p.name ? t('ox.parkNamed', { name: p.name }) : t('ox.parking'),
      text: [Number.isFinite(p.m) ? t('ox.mAway', { d: dist(p.m) }) : '', fee].filter(Boolean).join(', '),
    },
    ...stops.map((s, i) => {
      const mode = TRANSIT_ICONS[s.mode] ? s.mode : 'bus';
      const Icon = TRANSIT_ICONS[mode];
      return {
        key: `tr-${i}`,
        icon: <Icon size={16} />,
        title: t(`ox.transit.${mode}`, { name: s.name }),
        text: Number.isFinite(s.m) ? t('ox.mWalk', { d: dist(s.m) }) : '',
      };
    }),
  ].filter(Boolean);
}

/** The place's point with the hand-off to the traveller's maps app. */
export function pointRow(lat, lon, t, href) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    key: 'pt',
    icon: <MapPinIcon size={16} />,
    title: t('ox.onMap'),
    text: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    link: href ? <a href={href} target="_blank" rel="noopener noreferrer">{t('ox.directions')}</a> : null,
  };
}

/* ── The side card and the foot bar ──────────────────────────────────── */

/**
 * "Stay nearby": the town you would sleep in, how far it is and what a day
 * there costs a person at the traveller's Lifestyle (useBaseDay, the app's
 * one price engine, in the unit useDayView sets). A link to the town's page.
 */
export function StayLine({ destId, city, km = null, onOpen }) {
  const { t, lang } = useI18n();
  const base = useBaseDay(destId || null);
  const view = useDayView();
  if (!destId || !city) return null;
  const kmText = Number.isFinite(km)
    ? (km < 1 ? '<1' : Math.round(km).toLocaleString(lang)) : null;
  const line = base
    ? (kmText != null
      ? t('ox.stayLine', { km: kmText, price: formatMoney(view.day(base.dayEur)), unit: view.unit })
      : t('ox.stayPrice', { price: formatMoney(view.day(base.dayEur)), unit: view.unit }))
    : (kmText != null ? t('detail.exitKm', { km: kmText }) : '');
  return (
    <a className="ox-stay" href={featureHref('dest', { id: destId }) || undefined}
      aria-label={[t('ox.stayNearby'), t('ox.seeTown', { city }), line].filter(Boolean).join(', ')}
      onClick={linkOpener(() => onOpen?.(destId))}>
      <span className="ox-stay-label">{t('ox.stayNearby')}</span>
      <span className="ox-stay-town">
        <b>{city}</b>
        {line && <small>{line}</small>}
      </span>
      <span className="ox-stay-go" aria-hidden="true"><ChevronRightIcon size={20} /></span>
    </a>
  );
}

/** The card: its title, the key figures as rows, the one primary, the
 *  secondary row and the stay line. `compact` (below 1024 px, in the page)
 *  keeps only the secondaries and the stay line: the facts sit just above it
 *  and the foot bar holds the primary. */
function OxCard({ card, compact = false }) {
  const { t } = useI18n();
  const rows = (card.rows || []).filter((r) => r && r.value != null && r.value !== '');
  const secondary = (card.secondary || []).filter(Boolean);
  if (compact && !secondary.length && !card.stay) return null;
  return (
    <div className={`pt-card ox-card${compact ? ' is-compact' : ''}`}>
      {!compact && card.title && <h2 className="ox-card-title">{card.title}</h2>}
      {!compact && rows.length > 0 && (
        <dl className="ox-kv">
          {rows.map((r) => (
            <div key={r.key || r.label}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {!compact && card.onAdd && (
        <Button variant="primary" className="ox-add" iconStart={<PlusIcon size={20} />} onClick={card.onAdd}>
          {t('feat.addToDay')}
        </Button>
      )}
      {secondary.length > 0 && <div className="ox-card-row">{secondary}</div>}
      {card.stay}
    </div>
  );
}

/** A link styled as a small secondary button (Directions, a booking page). */
export function OxLinkButton({ href, icon = null, children, external = true }) {
  if (!href) return null;
  return (
    <a className="btn btn-secondary btn-sm ox-linkbtn" href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {icon && <span className="btn-icon" aria-hidden="true">{icon}</span>}
      <span className="btn-label">{children}</span>
    </a>
  );
}

/* ── The shell ──────────────────────────────────────────────────────── */

/**
 * props
 *   name, className, backLabel, onClose, onEscape, fav, onFav, onShare,
 *   copied, resetKey, toast, following (the trail's live follow: the map
 *   takes the page and the foot bar steps aside)
 *   photos, photoFallback   the gallery (PhotoGallery's mosaic)
 *   head      { title, sub, iso2, where, rating, gem, rank, badges[], lead }
 *   factsLead a node above the facts (the trail's forecast warning)
 *   facts     KeyFacts cells, four to six
 *   jumps     [{ key, id, label }] in page order
 *   card      { title, rows[{label, value}], onAdd, secondary[], stay }
 *   dock      { fig, note, sub, onSub } for the foot bar
 *   whyRates  the score's explanation, one fold near the sources
 *   sources, sourcesExtra   the foot line and its doors
 *   children  the sections (PSection)
 */
export function OutdoorPage({
  name, className = '', backLabel, onClose, onEscape = null, fav = false, onFav = null,
  onShare = null, shareLabel = '', copied = false, resetKey, toast = null, following = false,
  photos = [], photoFallback = null,
  head, factsLead = null, facts = [], jumps = [], card = null, dock = null,
  whyRates = null, sources = [], sourcesExtra = null, children,
}) {
  const { t } = useI18n();
  const pageRef = React.useRef(null);
  const backRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const headRef = React.useRef(null);
  const whyRef = React.useRef(null);
  const [titleGone, setTitleGone] = React.useState(false);
  const wide = useWide();

  const arrivalRef = usePageArrival(pageRef, resetKey);
  useFocusTrap(pageRef, onEscape || onClose, { initialFocusRef: arrivalRef });

  React.useEffect(() => { scrollRef.current?.scrollTo?.(0, 0); }, [resetKey]);

  // The bar takes the name only once the heading has scrolled away.
  React.useEffect(() => {
    const el = headRef.current;
    const root = scrollRef.current;
    if (!el || !root || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setTitleGone(!entry.isIntersecting), { root, threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [resetKey]);

  const openWhy = (e) => {
    e.preventDefault();
    if (whyRef.current) whyRef.current.open = true;
    scrollToSection(scrollRef.current, 'ox-why');
  };

  const firstJump = jumps.find((j) => j?.id);
  const onDockSub = dock?.onSub || (firstJump ? () => scrollToSection(scrollRef.current, firstJump.id) : null);
  const factsCls = `pt-facts ox-facts${(facts || []).length === 6 ? ' is-six' : ''}`;

  return (
    <div
      ref={pageRef}
      className={`tpage pt-page oxp ${following ? 'following' : ''} ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <PageBar
        t={t}
        backLabel={backLabel}
        onBack={onClose}
        backRef={backRef}
        name={name}
        nameOn={titleGone || following}
        fav={fav}
        onFav={onFav}
        onShare={onShare}
        shareLabel={shareLabel || t('trails.shareLink')}
        copied={copied}
        copiedLabel={t('dest.linkCopied')}
      />

      <div className="tpage-scroll pt-scroll" ref={scrollRef}>
        <div className="pt-wrap">
          <PhotoGallery layout="mosaic" photos={photos} label={name} claimKey={resetKey}
            fallback={photoFallback || { city: name, iso2: head?.iso2 || null }} />

          <div className="pt-body">
            <div className="pt-main">
              <header className="pt-head" ref={headRef}>
                <h1 className="pt-title" tabIndex={-1}>{head.title}</h1>
                {head.sub && <p className="pt-subtitle">{head.sub}</p>}
                {head.where && (
                  <p className="pt-where">
                    {head.iso2 && <CountryFlag country={head.iso2} size={15} />}
                    <span>{head.where}</span>
                  </p>
                )}
                {(head.rating || head.gem || head.rank || head.badges?.length > 0) && (
                  <div className="pt-badges">
                    {head.rating && (whyRates && !head.rating.unscored ? (
                      <a className="pt-score" href="#ox-why" onClick={openWhy}>
                        <ScoreChip rating={head.rating} size="lg" band />
                      </a>
                    ) : (
                      <span className="pt-score"><ScoreChip rating={head.rating} size="lg" band /></span>
                    ))}
                    {head.gem && <HiddenGemTag />}
                    {head.rank && <Chip kind="status" className="pt-badge">{head.rank}</Chip>}
                    {(head.badges || []).filter(Boolean).map((b) => (
                      <Chip key={b} kind="status" className="pt-badge">{b}</Chip>
                    ))}
                  </div>
                )}
                {head.lead && <p className="pt-lead">{head.lead}</p>}
              </header>

              {factsLead}
              <KeyFacts cells={facts} className={factsCls} />

              {!wide && card && <OxCard card={card} compact />}

              <JumpBar items={jumps} scrollRef={scrollRef} ready={`${resetKey}:${React.Children.count(children)}`}
                label={t('detail.railAria')} />

              {children}

              {whyRates && (
                <details className="pt-fold ox-why" id="ox-why" ref={whyRef}>
                  <summary>{t('ox.whyRates')}</summary>
                  <div className="ox-why-body">{whyRates}</div>
                </details>
              )}

              <SourcesLine items={Array.isArray(sources) ? sources : []}>{sourcesExtra}</SourcesLine>
            </div>
            {wide && card && (
              <aside className="pt-side" aria-label={card.title || name}>
                <OxCard card={card} />
              </aside>
            )}
          </div>
        </div>
      </div>

      {!wide && !following && dock && (
        <div className="pt-dock ox-dock">
          <div className="pt-dock-text">
            <p className="pt-dock-price">
              <span className="pt-dock-fig">{dock.fig}</span>
              {dock.note ? <span className="pt-dock-unit"> {dock.note}</span> : null}
            </p>
            {dock.sub && (
              onDockSub ? (
                <Button variant="quiet" size="sm" className="pt-dock-inputs" onClick={onDockSub}>{dock.sub}</Button>
              ) : <span className="ox-dock-sub">{dock.sub}</span>
            )}
          </div>
          {card?.onAdd && (
            <Button variant="primary" className="pt-dock-cta" iconStart={<PlusIcon size={18} />} onClick={card.onAdd}>
              {t('ox.addDay')}
            </Button>
          )}
        </div>
      )}

      {toast && <p className="tpage-toast" role="status">{toast}</p>}
    </div>
  );
}

export { PSection };

/* ── Route: the map, then the height profile ─────────────────────────── */

/** The full-width Route block: the map (with its own 2D / 3D and full
 *  screen row, MapShell) then the profile, then a row of hand-offs. */
export function RouteBlock({ map = null, profile = null, actions = null }) {
  if (!map && !profile && !actions) return null;
  return (
    <>
      {(map || profile) && (
        <div className="ox-route">
          {map && <div className="ox-route-map">{map}</div>}
          {profile && <div className="ox-route-prof">{profile}</div>}
        </div>
      )}
      {actions && <div className="ox-dl">{actions}</div>}
    </>
  );
}

/**
 * The scrubbable profile (RouteFigures.jsx SlopeProfile) with a scale on the
 * height axis: the highest, the middle and the lowest height beside the
 * drawing, in the same rows as the drawing (the profile's own parts are laid
 * into this grid). Steepness is shaded on the umber ramp with its key.
 */
export function HeightProfile({ elevation, plain = false, ...rest }) {
  const { t, lang } = useI18n();
  const profile = elevation?.profile;
  if (!Array.isArray(profile) || profile.length < 2) return null;
  let lo = elevation.ele_min_m;
  let hi = elevation.ele_max_m;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = Infinity; hi = -Infinity;
    for (const p of profile) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }
  }
  const n = (v) => Math.round(v).toLocaleString(lang);
  return (
    <div className={`ox-prof${plain ? ' is-plain' : ''}`}>
      <div className="ox-prof-axis" aria-hidden="true">
        <span>{n(hi)} m</span>
        <span>{n((hi + lo) / 2)}</span>
        <span>{n(lo)} m</span>
      </div>
      <SlopeProfile
        elevation={elevation}
        plain={plain}
        labels={{
          row: t('sig.rowEle'),
          aria: t('sig.scrubAria'),
          at: (v) => t('sig.eleAt', v),
          range: (v) => t('sig.eleRange', v),
          under: t('sig.slopeUnder'),
          mid: t('sig.slopeMid'),
          over: t('sig.slopeOver'),
        }}
        {...rest}
      />
    </div>
  );
}

/* ── Before you go ──────────────────────────────────────────────────── */

/** SAC scale tag (OSM) to its T step. */
export const SAC_STEP = {
  hiking: 1, mountain_hiking: 2, demanding_mountain_hiking: 3,
  alpine_hiking: 4, demanding_alpine_hiking: 5, difficult_alpine_hiking: 6,
};

/** The grade as six steps, T1 to T6, the reached ones filled, with its
 *  plain words and what the scale assumes. `est` says it was estimated. */
export function GradeCard({ level, est = false }) {
  const { t } = useI18n();
  if (!(level >= 1 && level <= 6)) return null;
  return (
    <div className="ox-grade">
      <span className="ox-scale" role="img" aria-label={t('ox.gradeAria', { n: level })}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <span key={i} className={i <= level ? 'is-on' : ''} aria-hidden="true">T{i}</span>
        ))}
      </span>
      <span className="ox-grade-text">
        <b>{t('ox.gradeTitle', { n: level, word: t(`ox.grade.t${level}`) })}</b>
        <span>
          {t(`ox.grade.t${level}d`)}
          {' '}
          {t('ox.gradeAssumes')}
          {est ? ` ${t('ox.gradeEst')}` : ''}
        </span>
      </span>
    </div>
  );
}

/** Rows of an icon, a title and a line, two across from 700 px. */
export function CheckRows({ rows, single = false }) {
  const list = (rows || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <ul className={`ox-chk${single ? ' is-single' : ''}`}>
      {list.map((r) => (
        <li key={r.key} className={r.warn ? 'is-warn' : ''}>
          <span className="pt-tip-icon ox-chk-icon" aria-hidden="true">{r.icon}</span>
          <span className="ox-chk-text">
            <b>{r.title}</b>
            {r.text && <span>{r.text}</span>}
            {r.link}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** What is there, as a grid: an icon, the word, one small note. `no` marks
 *  a thing that is known to be absent, with a cross and in quieter ink. */
export function Facilities({ items }) {
  const { t } = useI18n();
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <ul className="ox-facil">
      {list.map((f) => (
        <li key={f.key} className={f.no ? 'is-no' : ''}>
          <span className="ox-facil-icon" aria-hidden="true">{f.no ? <CloseIcon size={16} /> : (f.icon || <CheckIcon size={16} />)}</span>
          <span className="ox-facil-word">
            {f.no && <span className="sr-only">{t('ox.notHere')} </span>}
            {f.label}
          </span>
          {f.note && <small>{f.note}</small>}
        </li>
      ))}
    </ul>
  );
}

const WQ = ['Poor', 'Sufficient', 'Good', 'Excellent'];

/** The EU bathing water class as four named steps, filled to the class. */
export function WaterClass({ cls, year = null, site = null }) {
  const { t } = useI18n();
  const k = WQ.indexOf(cls);
  if (k < 0) return null;
  return (
    <div className="ox-wq">
      <div className="ox-wq-top">
        <b>{t(`ox.wq.${cls}`)}</b>
        <span>{year ? t('ox.wqYear', { year }) : t('ox.wqName')}</span>
      </div>
      <div className="ox-wq-steps" role="img" aria-label={t('ox.wqAria', { word: t(`ox.wq.${cls}`) })}>
        {WQ.map((w, i) => <span key={w} className={i <= k ? 'is-on' : ''} aria-hidden="true" />)}
      </div>
      <div className="ox-wq-lbl" aria-hidden="true">
        {WQ.map((w) => <span key={w}>{t(`ox.wq.${w}`)}</span>)}
      </div>
      {site && <p>{t('ox.wqSite', { site })}</p>}
    </div>
  );
}

/** One figure a month as twelve bars, the best months stronger and the
 *  current month outlined (carta-design's month strip). */
export function MonthStrip({ values, unit = '°', best = [], now = null, label, monthLetter }) {
  const vals = Array.isArray(values) ? values.map(Number) : [];
  if (vals.length !== 12 || vals.some((v) => !Number.isFinite(v))) return null;
  const max = Math.max(...vals);
  const min = Math.min(...vals) - 2;
  const span = Math.max(1, max - min);
  return (
    <figure className="ox-months" aria-label={label}>
      {vals.map((v, i) => (
        <div key={i} className={`ox-mo${best.includes(i) ? ' is-best' : ''}${i === now ? ' is-now' : ''}`}>
          <span className="ox-mo-t">{Math.round(v)}{unit}</span>
          <span className="ox-mo-bar" style={{ height: `${Math.round(((v - min) / span) * 56 + 6)}px` }} aria-hidden="true" />
          <span className="ox-mo-l" aria-hidden="true">{monthLetter ? monthLetter(i) : i + 1}</span>
        </div>
      ))}
    </figure>
  );
}

/** The short fixed safety block: the emergency number and the weather. */
export function SafetyBlock({ extra = [] }) {
  const { t } = useI18n();
  const cells = [
    { key: 'sos', label: t('ox.safety.emergency'), value: '112' },
    { key: 'wx', label: t('ox.safety.weather'), value: t('ox.safety.weatherText') },
    ...extra.filter(Boolean),
  ];
  return (
    <dl className="ox-safety">
      {cells.map((c) => (
        <div key={c.key}>
          <dt>{c.label}</dt>
          <dd>{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ── Cards ──────────────────────────────────────────────────────────── */

/** A small drawn map spot for a card without a photograph: contour lines
 *  and the place's dot, never a grey box. */
export function MapSpot({ seed = 0 }) {
  const s = Math.abs(Number(seed) || 0) % 7;
  const cx = 70 + s * 6;
  const cy = 46 + (s % 3) * 4;
  return (
    <svg className="ox-spot" viewBox="0 0 160 120" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <rect width="160" height="120" className="ox-spot-ground" />
      <path className="ox-spot-line" d={`M-10 ${92 - s} C40 ${70 + s} 90 ${104 - s} 170 ${78 + s}`} />
      <path className="ox-spot-line" d={`M-10 ${30 + s} C30 ${50 - s} 110 ${18 + s} 170 ${40 - s}`} />
      <ellipse className="ox-spot-ring" cx={cx} cy={cy} rx="34" ry="22" />
      <ellipse className="ox-spot-ring" cx={cx} cy={cy} rx="18" ry="11" />
      <circle className="ox-spot-dot" cx={cx} cy={cy} r="6" />
    </svg>
  );
}

/** The sights along the way: a photograph (or the map spot), the name,
 *  one line. */
export function AlongCards({ items }) {
  const list = (items || []).filter((x) => x && x.title);
  if (!list.length) return null;
  return (
    <ul className="ox-along">
      {list.map((h, i) => (
        <li key={h.key} className="ox-acard">
          <span className="ox-acard-media">
            {h.photo?.url
              ? <img src={h.photo.thumb || h.photo.url} alt="" loading="lazy" decoding="async" />
              : <MapSpot seed={i + 1} />}
          </span>
          <span className="ox-acard-text">
            <b>{h.title}</b>
            {h.line && <small>{h.line}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * "Other X nearby": the computed ways out (usePlaceExits) as photo cards,
 * each a link to its page. A card without a photograph shows the map spot.
 * `hrefOf(row)` gives the page's address for a real link.
 */
export function OtherNearby({ exits, hrefOf = null }) {
  const list = (exits || []).filter((e) => e && e.title);
  if (!list.length) return null;
  return (
    <ul className="ox-sim">
      {list.map((e, i) => (
        <li key={e.key} className="ox-simcard">
          <a className="ox-sim-link" href={(hrefOf && hrefOf(e.row)) || '#'} onClick={linkOpener(e.onOpen)}>
            <span className="ox-sim-media">
              {e.photoUrl
                ? <img src={e.photoUrl} alt="" loading="lazy" decoding="async" />
                : <MapSpot seed={i + 3} />}
            </span>
            <span className="ox-sim-name">{e.title}</span>
          </a>
          <span className="ox-sim-meta">
            {e.rating && !e.rating.unscored && <ScoreChip rating={e.rating} size="sm" band={false} />}
            {e.meta && <span>{e.meta}</span>}
          </span>
          {e.kindLabel && <span className="ox-sim-tag">{e.kindLabel}</span>}
        </li>
      ))}
    </ul>
  );
}
