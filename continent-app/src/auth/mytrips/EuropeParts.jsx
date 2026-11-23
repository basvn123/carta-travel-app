import React, { useLayoutEffect, useRef, useState } from 'react';
import { stampTilt } from './atlas/pastBeside.js';
import { MiniRoute } from './atlas/MiniRoute.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import {
  CalendarIcon, ChevronRightIcon, GlobeIcon, MountainIcon, PencilIcon, ShareIcon, TrainIcon,
} from '../../components/Icons.jsx';
import { formatMoney } from '../../lib/money.js';
import { RateTrip } from './TripParts.jsx';
import { activeLocale } from '../../lib/localeState.js';
import { EuropeMap } from './atlas/AtlasPlate.jsx';
import { CardMenu } from './parts.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { YearCard } from './YearStudio.jsx';
import { SectHead, Frame2, MoveInk, GradeCells, GradeEmpty } from './atlas/Ink.jsx';

/**
 * The parts of Your Europe with a record (G12 Phase E), drawn as the
 * approved reference: the year bars, the months, what the trips cost, the
 * four extremes, the trip log, the milestone badges, the year card preview
 * and the past trips. Charts are SVG at the column's real width (measured),
 * so text never scales; every colour comes from tokens in 72-atlas.css.
 */

/** The width a chart gets: its box, measured, so 12 px stays 12 px. */
function useWidth(fallback = 358) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const set = () => { const x = Math.round(el.getBoundingClientRect().width); if (x > 0) setW(x); };
    set();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const nf = (n, d = 0) => Number(n).toLocaleString(activeLocale(), { minimumFractionDigits: d, maximumFractionDigits: d });

export function Sect({ title, count = null, action = null, full = false, children, id }) {
  return (
    <section className={`atlas-sect${full ? ' is-full' : ''}`} aria-labelledby={id}>
      <SectHead id={id} title={title} count={count} action={action} />
      {children}
    </section>
  );
}

/** Nachten per jaar: a bar per year; a tap filters the map and the charts. */
export function YearBars({ data, ramp = {}, year, onYear }) {
  const { t } = useI18n();
  const [ref, w] = useWidth();
  const h = 108;
  const n = Math.max(1, data.length);
  const bw = Math.max(14, Math.min(46, (w - 20) / n - 12));
  const gap = (w - n * bw) / (n + 1);
  const max = Math.max(1, ...data.map((d) => d.nights));
  const base = h - 20;
  return (
    <div ref={ref} className="atlas-chartbox">
      <svg className="atlas-chart atlas-bars" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="group" aria-label={t('mt.nightsPerYear')}>
        <line className="atlas-base" x1="0" x2={w} y1={base + 0.5} y2={base + 0.5} />
        {data.map((d, i) => {
          const bh = ((h - 40) * d.nights) / max;
          const x = gap + i * (bw + gap);
          const pick = () => onYear?.(year === d.year ? null : d.year);
          return (
            <g
              key={d.year}
              role="button"
              tabIndex={0}
              aria-pressed={year === d.year}
              aria-label={t('mt.yearBarAria', { year: d.year, n: d.nights })}
              className={`atlas-bar${year === d.year ? ' is-on' : ''}`}
              onClick={pick}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }}
            >
              <rect className="atlas-bar-hit" x={x - gap / 2} y="0" width={bw + gap} height={h} />
              {/* Every bar keeps its year's paint; a picked year is ringed, never the others dimmed. */}
              <rect className={`is-r${ramp[d.year] ?? 2}`} x={x} y={base - Math.max(2, bh)} width={bw} height={Math.max(2, bh)} rx="2" />
              {year === d.year && <rect className="atlas-bar-ring" x={x - 3.5} y={base - Math.max(2, bh) - 3.5} width={bw + 7} height={Math.max(2, bh) + 3.5} rx="4" />}
              {/* One text with the year first and a space, so the visible text ("2025 9") sits inside the name
                  ("2025: 9 nights"); two text elements read as "20259" (axe label-content-name-mismatch). */}
              <text textAnchor="middle">
                <tspan className="atlas-bar-y" x={x + bw / 2} y={h - 4}>{d.year}</tspan>{' '}
                <tspan className="is-v" x={x + bw / 2} y={h - 26 - bh}>{d.nights}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Wanneer je reist: nights per month, January first. */
export function MonthsChart({ months }) {
  const { t } = useI18n();
  const [ref, w] = useWidth();
  const h = 70;
  const slot = w / 12;
  const bw = Math.min(16, slot - 6);
  const max = Math.max(1, ...months);
  const top = months.indexOf(Math.max(...months));
  const base = h - 18;
  const fmt = new Intl.DateTimeFormat(activeLocale(), { month: 'narrow', timeZone: 'UTC' });
  const long = new Intl.DateTimeFormat(activeLocale(), { month: 'long', timeZone: 'UTC' });
  const label = months.map((v, i) => `${long.format(Date.UTC(2020, i, 1))} ${v}`).join(', ');
  return (
    <div ref={ref} className="atlas-chartbox">
      <svg className="atlas-chart" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={t('mt.monthsAria', { list: label })}>
        <line className="atlas-base" x1="0" x2={w} y1={base + 0.5} y2={base + 0.5} />
        {months.map((v, i) => {
          const bh = v ? Math.max(6, ((h - 22) * v) / max) : 2;
          const x = i * slot + (slot - bw) / 2;
          return (
            <g key={i}>
              {/* An empty month is a short tick on the baseline; the busiest month in umber 800. */}
              <rect className={!v ? 'is-zero' : i === top ? 'is-top' : 'is-on'} x={x} y={base - bh} width={bw} height={bh} rx={v ? 2 : 0} />
              <text x={i * slot + slot / 2} y={h - 3} textAnchor="middle">{fmt.format(Date.UTC(2020, i, 1))}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/**
 * Wat je reizen kostten: what the traveller logged per person, a day or a
 * trip. Only the logged figure is drawn: the memory's spend holds every
 * category (flights too) while Carta's estimate is a bed and a day, so a
 * tick beside it would not be like for like (build spec, honest numbers).
 */
export function CostChart({ trips, per, onPer, missing = 0, onFill }) {
  const { t } = useI18n();
  const rows = trips.map((x) => ({ x, v: per === 'day' ? x.spendPP / Math.max(1, x.nights) : x.spendPP }));
  const max = Math.max(1, ...rows.map((r) => r.v));
  const avg = rows.length ? rows.reduce((s, r) => s + r.v, 0) / rows.length : null;
  const seg = (
    <Frame2 label={t('mt.costTitle')} options={[['day', t('mt.costPerDay')], ['trip', t('mt.costPerTrip')]]} value={per} onChange={onPer} />
  );
  return (
    <Sect id="mt-cost-h" full title={t('mt.costTitle')} action={rows.length ? seg : null}>
      {!rows.length ? (
        <Pressable className="atlas-softbtn" onClick={onFill}>{t('mt.costFill')}</Pressable>
      ) : (
        <>
          <div className="atlas-costkey">
            <span>{t('mt.costKey')}</span>
            {avg != null && <b><i aria-hidden="true" />{t('mt.costAvg', { price: formatMoney(avg) })}</b>}
          </div>
          <ul className="atlas-cost">
            {rows.map((r) => (
              <li key={r.x.id} className="atlas-crow">
                <span className="atlas-cname">{r.x.title} <small>{r.x.year}</small></span>
                <span className="atlas-cval">{formatMoney(r.v)}</span>
                <span className="atlas-ctrack" aria-hidden="true">
                  <span className="atlas-cbar" style={{ width: `${((r.v / max) * 100).toFixed(1)}%` }} />
                  {avg != null && <i className="atlas-cavg" style={{ left: `${((avg / max) * 100).toFixed(1)}%` }} />}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {missing > 0 && rows.length > 0 && (
        <Pressable className="atlas-lnk is-start" onClick={onFill}>{t(missing === 1 ? 'mt.costMissing1' : 'mt.costMissingN', { n: missing })}</Pressable>
      )}
    </Sect>
  );
}

/** Je uitersten: the furthest north, south, east and west stop, with degrees. */
export function Extremes({ ex }) {
  const { t } = useI18n();
  const cells = [
    ['n', 'N', ex.n, t('mt.degN', { n: nf(Math.abs(ex.n.lat), 1) })],
    ['e', t('mt.compassE'), ex.e, t(ex.e.lon < 0 ? 'mt.degW' : 'mt.degE', { n: nf(Math.abs(ex.e.lon), 1) })],
    ['s', t('mt.compassS'), ex.s, t(ex.s.lat < 0 ? 'mt.degS' : 'mt.degN', { n: nf(Math.abs(ex.s.lat), 1) })],
    ['w', t('mt.compassW'), ex.w, t(ex.w.lon < 0 ? 'mt.degW' : 'mt.degE', { n: nf(Math.abs(ex.w.lon), 1) })],
  ];
  return (
    <Sect id="mt-ext-h" title={t('mt.extremes')}>
      <div className="atlas-extremes">
        {/* G16 (owner 2026-11-23): the house style bans a compass rose, so
            the four extremes are ruled rows, N, E, S, W, each a framed
            letter tile, the place and its degrees. */}
        {cells.map(([k, letter, s, deg]) => (
          <div className={`atlas-ext is-${k}`} key={k}>
            <b><i aria-hidden="true">{letter}</i>{s.city}</b>
            <span>{deg}</span>
          </div>
        ))}
      </div>
    </Sect>
  );
}

/** The traveller's own grade (owner review): "8" and a small "/10" on one
 *  baseline, a blaze-style meter under it painted to the grade; the best
 *  trip's number in umber 700 and its meter in umber 800. No pill, so it
 *  reads as Carta's mark and not a stock badge. */
export function GradeBadge({ n, top = false, stamp = '' }) {
  const { t } = useI18n();
  // In a past row the grade is an ink stamp (G12 atlas): a stable tilt from the trip's id, a 10 filled.
  if (stamp) {
    return (
      <span className={`atlas-gstamp${n >= 10 ? ' is-ten' : ''}`} role="img" aria-label={t('mt.gradeAria', { n })}
        style={{ '--tilt': `${stampTilt(stamp)}deg` }}>
        <b aria-hidden="true">{n}</b>
      </span>
    );
  }
  return (
    <span className={`atlas-grade${top ? ' is-top' : ''}`} role="img" aria-label={t('mt.gradeAria', { n })}>
      <span className="atlas-grade-n" aria-hidden="true"><b>{n}</b><small>/10</small></span>
      <span className="atlas-grade-m" aria-hidden="true"><i style={{ width: top ? '100%' : `${Math.max(0, Math.min(10, n)) * 10}%` }} /></span>
    </span>
  );
}

const BADGE_ICON = { region: GlobeIcon, next: GlobeIcon, nightTrain: TrainIcon, longest: CalendarIcon, north: MountainIcon, ten: GlobeIcon };

/** Mijlpalen as round badges: earned in umber, the ones still ahead outlined.
 *  A tap shows the badge's fact line under the row. */
export function Badges({ items }) {
  const { t } = useI18n();
  const [open, setOpen] = useState('');
  const picked = items.find((b) => b.id === open);
  return (
    <Sect id="mt-badges-h" full title={t('mt.milestones')}>
      <div className="atlas-badges">
        {items.map((b) => {
          const Icon = BADGE_ICON[b.key] || GlobeIcon;
          return (
            <Pressable
              key={b.id}
              className={`atlas-badge${b.earned ? '' : ' is-locked'}`}
              // An earned stamp sits at a fixed tilt from its id, like ink pressed by hand.
              style={b.earned ? { '--tilt': `${stampTilt(b.id)}deg` } : undefined}
              aria-label={b.earned ? b.label : t('mt.badgeNotYet', { name: b.label })}
              aria-pressed={open === b.id}
              onClick={() => setOpen(open === b.id ? '' : b.id)}
            >
              <i aria-hidden="true"><Icon size={24} /></i><span className="atlas-badge-l">{b.label}</span>
            </Pressable>
          );
        })}
      </div>
      {picked?.sub && <p className="atlas-badge-sub" role="status">{picked.sub}</p>}
    </Sect>
  );
}

/** Jouw jaarkaart: the studio's card as a live preview, Aanpassen and Delen.
 *  The example card offers Download only (it is not the traveller's year). */
export function YearCardSection({ model, geo, onEdit, onShare, busy = false, example = '' }) {
  const { t } = useI18n();
  return (
    <Sect id="mt-yc-h" full title={t('mt.yearCard')}>
      <div className="atlas-yc-wrap">
        {/* The preview is a mouse and touch shortcut to Aanpassen, which is the named control beside it;
            hidden from the keyboard and screen readers so the card's many words never have to fit a name. */}
        <Pressable className="atlas-ycbtn" tabIndex={-1} aria-hidden="true" onClick={onEdit}>
          <YearCard model={model} geo={geo} width={210} example={example} />
        </Pressable>
        <div className="atlas-yc-acts">
          <Pressable className="atlas-btn is-soft" onClick={onEdit}><PencilIcon size={16} />{t('mt.adjust')}</Pressable>
          <Pressable className="atlas-btn is-primary" onClick={onShare} aria-busy={busy}>
            {example ? t('mt.download') : <><ShareIcon size={16} />{t('mt.share')}</>}
          </Pressable>
        </div>
      </div>
    </Sect>
  );
}

/** One past trip as the Saved photo card (decision 0016): the photo (or its
 *  route on the plate) with the menu as a paper disc, the name, the flags and
 *  "{n} nachten, {month}", the grade as ten cells (the best trip in umber
 *  800), or dashed empty cells and "Geef een cijfer", which opens the ten taps
 *  across the grid under the card. A tap opens its memory there, with the
 *  move against Carta's estimate in ink above it. */
export function PastRow({ x, top = false, withYear = false, rating = false, onRateOpen, onRate, onLift = null, geo = null, trip = null }) {
  const { t } = useI18n();
  const month = monthShort(x.start);
  const meta = [
    x.nights > 0 ? t(x.nights === 1 ? 'saved.nights1' : 'saved.nightsN', { n: x.nights }) : '',
    // Ranked by grade the year headings are gone, so the card says its year.
    withYear && x.year ? [month, x.year].filter(Boolean).join(' ') : month,
  ].filter(Boolean).join(', ');
  const moved = x.vs != null && Math.round(x.vs) !== 0;
  return (
    <>
      <div
        className={`mt-pcard is-past${x.open ? ' is-open' : ''}`}
        // G12 atlas: pointing at a past trip lifts its route on the map.
        onMouseEnter={onLift ? () => onLift(x.id) : undefined}
        onMouseLeave={onLift ? () => onLift('') : undefined}
        onFocus={onLift ? () => onLift(x.id) : undefined}
        onBlur={onLift ? () => onLift('') : undefined}
      >
        <span className="mt-pcard-ph">
          <span className="mt-pcard-img" onClick={x.onOpen} aria-hidden="true">
            {!x.img && geo && trip?.stops?.length ? <MiniRoute geo={geo} trip={trip} /> : (
              <HeroImage url={x.img} city={x.title} iso2={x.iso2} className="mt-pcard-imgel" maxWidth={480} ratio={[4, 3]} sizes="(min-width: 768px) 240px, 50vw" />
            )}
          </span>
          {(x.menuActions?.length > 0 || x.onRemove) && (
            <CardMenu actions={x.menuActions || []} onRemove={x.onRemove} removeLabel={x.removeLabel} />
          )}
        </span>
        <Pressable className="mt-pcard-name is-past" onClick={x.onOpen} aria-expanded={x.open}><span>{x.title}</span></Pressable>
        <span className="mt-pcard-pm">
          {(x.flags || []).map((c) => <CountryFlag key={c} country={c} size={14} />)}
          <span>{meta}</span>
        </span>
        {x.grade != null ? <GradeCells n={x.grade} top={top} label={t('mt.gradeAria', { n: x.grade })} /> : onRate ? (
          <GradeEmpty>
            <Pressable className="ink-give" aria-expanded={rating} onClick={onRateOpen}>{t('mt.giveGrade')}</Pressable>
          </GradeEmpty>
        ) : null}
      </div>
      {rating && x.grade == null && onRate && (
        <div className="mt-pgrid-open atlas-ratebox"><RateTrip title={x.title} onRate={onRate} /></div>
      )}
      {/* Open, the trip shows its move against Carta's estimate above its memory
          (on the card it repeated on almost every trip). */}
      {(x.below || (x.open && moved)) && (
        <div className="mt-pgrid-open">
          {x.open && moved && (
            <MoveInk delta={x.vs} className="mt-past-est">{t(x.vs < 0 ? 'mt.vsUnder' : 'mt.vsOver', { price: formatMoney(Math.abs(x.vs)) })}</MoveInk>
          )}
          {x.below}
        </div>
      )}
    </>
  );
}

/** "sep": a trip's start month, short, in the traveller's language. */
const monthShort = (iso) => {
  if (!iso) return '';
  try { return new Date(`${String(iso).slice(0, 10)}T00:00:00Z`).toLocaleDateString(activeLocale(), { month: 'short', timeZone: 'UTC' }).replace(/\.$/, ''); } catch { return ''; }
};

/**
 * The country sheet (tap a country on the plate): the years and the nights
 * there, what is saved in it, a day as the traveller logged it and as Carta
 * prices it now, with Show saved and Plan a trip. A hand mark is set or
 * taken off here too, unless a trip put the country on the map.
 *   info { cc, name, years, trips, nights, hand, saved, dayYou, dayNow, canToggle, been }
 */
export function CountrySheet({ info, onClose, onToggle, onShowSaved, onPlan }) {
  const { t } = useI18n();
  const been = info.years.length ? info.years.join(', ') : info.hand ? t('mt.ctyByHand') : t('mt.ctyNotYet');
  return (
    <SheetShell title={info.name} onClose={onClose} labelId="mt-cty-title" width={480}>
      <div className="atlas-cty">
        <dl className="atlas-kv">
          <div><dt>{t('mt.ctyBeen')}</dt><dd>{been}</dd></div>
          {info.trips > 0 && <div><dt>{t('mt.ctyTripsNights')}</dt><dd>{info.trips}, {info.nights}</dd></div>}
          <div><dt>{t('mt.ctySaved')}</dt><dd>{info.saved}</dd></div>
          {Number.isFinite(info.dayYou) && <div><dt>{t('mt.ctyDayYou')}</dt><dd>{formatMoney(info.dayYou)}</dd></div>}
          <div><dt>{t('mt.ctyDayNow')}</dt><dd>{Number.isFinite(info.dayNow) ? formatMoney(info.dayNow) : t('mt.ctyNotYet')}</dd></div>
        </dl>
        {info.canToggle && (
          <Pressable className="atlas-lnk is-start" onClick={() => onToggle?.(info.cc)}>
            {t(info.been ? 'mt.ctyUnmark' : 'mt.ctyMark')}
          </Pressable>
        )}
        <div className="atlas-two">
          <Pressable className="atlas-btn is-soft" onClick={onShowSaved}>{t('mt.ctyShowSaved')}</Pressable>
          <Pressable className="atlas-btn is-primary" onClick={onPlan}>{t('mt.ctyPlan')}</Pressable>
        </div>
      </div>
    </SheetShell>
  );
}
