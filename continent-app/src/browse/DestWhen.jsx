import React from 'react';
import { safeUrl } from '../lib/format.js';
import { monthName } from '../lib/dates.js';
import { formatMoney } from '../lib/money.js';
import { CROWD_TIER_KEYS } from '../lib/crowdMonth.js';
import { useStayRecord } from '../lib/staysData.js';
import { crowdStanding, monthsOf, stayByMonth, stayKindsOf, whenVerdict } from '../lib/whenGuide.js';
import { Segmented } from '../components/ui/index.js';
import { bestMonthsFor, riskMonths } from '../lib/heatRisk.js';
import { PSection } from './PageTemplate.jsx';
import { closedMonths, seasonItems } from '../lib/season.js';
import '../styles/94-when-stay.css';

/**
 * The place page's When to go (T1022, owner 2026-11-03: "more insightful,
 * more visual, a written recommendation, every stay type by month, crowds
 * shown professionally"; replaces T912's strip and cells). Styles:
 * 94-when-stay.css.
 *
 *   the verdict    the best months in one line, then why: the days in them,
 *                  the quieter pleasant months, the hot and packed ones, the
 *                  cold or wet ones (lib/whenGuide.js whenVerdict)
 *   the months     one strip of twelve, each a button: the comfort band as a
 *                  bar in its colour, the daytime high, the crowds as dots,
 *                  a mark where a festival falls; the chosen month's line
 *                  under it (weather, crowds, festivals)
 *   the crowds     how busy the place is against Europe's (visitor nights
 *                  per km2, crowdStanding)
 *   stay prices    Hostel / Hotel / Entire place over the same months, from
 *                  the scrape (T1021): the scraped months as bars, the rest
 *                  left out, one sentence per type and the chosen month's
 *                  figure
 *   festivals      every dated one, as before
 *
 * A part without data is not drawn; with nothing the section is not either.
 */
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function Verdict({ t, verdict, monthList }) {
  const { best, range, quieter, hot, cold } = verdict;
  if (!best.length) return null;
  return (
    <div className="when-verdict">
      <p className="when-best">{t('when.best', { months: monthList(best) })}</p>
      <ul className="when-why">
        {range && <li className="is-good">{t('when.mild', { lo: range.lo, hi: range.hi })}</li>}
        {quieter.length > 0 && <li className="is-good">{t('when.quieter', { months: monthList(quieter) })}</li>}
        {hot.length > 0 && <li className="is-warn">{t('when.hot', { months: monthList(hot) })}</li>}
        {cold.length > 0 && <li className="is-cold">{t('when.cold', { months: monthList(cold) })}</li>}
      </ul>
    </div>
  );
}

/** D20: the honest one-line note on extreme heat and fire months, drawn only when there are some. */
export function HeatNote({ t, risk, monthList, basis }) {
  if (!risk || !risk.any.length) return null;
  return (
    <p className="when-risk" role="note">
      {risk.heat.length > 0 && <span>{t('heat.hot', { months: monthList(risk.heat) })} </span>}
      {risk.fire.length > 0 && <span>{t(basis === 'fwi' ? 'heat.fireFwi' : 'heat.fireDry', { months: monthList(risk.fire) })}</span>}
    </p>
  );
}

function StayPrices({ t, lang, rec, kinds, names, month, setMonth, monthList }) {
  const [kind, setKind] = React.useState(null);
  const shown = kinds.includes(kind) ? kind : kinds[0];
  const row = React.useMemo(() => stayByMonth(rec, shown), [rec, shown]);
  if (!row) return null;
  const at = row.values[month - 1];
  const money = (v) => formatMoney(v, { precision: 'whole', locale: lang });
  return (
    <div className="when-stay">
      <div className="when-stay-head">
        <h3 className="when-sub">{t('when.stayTitle')}</h3>
        {kinds.length > 1 && (
          <Segmented size="sm" label={t('when.stayTitle')} value={shown} onChange={setKind}
            options={kinds.map((k) => ({ value: k, label: t(`when.kind.${k}`) }))} />
        )}
      </div>
      <div className="when-bars" role="group" aria-label={t('when.stayTitle')}>
        {row.values.map((v, i) => {
          const m = i + 1;
          const cheap = v != null && !row.flat && row.cheap.includes(m);
          return (
            <button type="button" key={m} className={`when-pb${v == null ? ' is-gap' : ''}${cheap ? ' is-cheap' : ''}${m === month ? ' is-on' : ''}`}
              aria-pressed={m === month} onClick={() => setMonth(m)}
              aria-label={v == null ? names.long[i] : `${names.long[i]}: ${t('when.stayNight', { price: money(v) })}`}>
              <span className="when-pb-v" aria-hidden="true">{v == null ? '' : money(v)}</span>
              <span className="when-pb-bar" style={v == null ? undefined : { '--h': `${Math.round((v / row.hi) * 100)}%` }} />
              <span className="when-init" aria-hidden="true">{names.initial[i]}</span>
            </button>
          );
        })}
      </div>
      <p className="when-stay-line">
        <b>{row.flat ? t('when.stayFlat') : t('when.stayRange', { cheap: monthList(row.cheap), dear: monthList(row.dear) })}</b>
        {at != null && <span>{t('when.stayAt', { month: names.long[month - 1], price: money(at) })}</span>}
      </p>
    </div>
  );
}

/** A check date (YYYY-MM-DD) as month and year in the reader's language, or null. */
function seasonChecked(iso, lang) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}/.test(iso)) return null;
  const d = new Date(`${iso.slice(0, 7)}-15T12:00:00Z`);
  try {
    return new Intl.DateTimeFormat(lang, { month: 'short', year: 'numeric' }).format(d);
  } catch {
    return iso.slice(0, 7);
  }
}

export function DestWhen({ p }) {
  const { t, lang, destination, data, water, monthPick, festivals, monthList, heatGuard } = p;
  const rec = useStayRecord(destination.id);
  const months = React.useMemo(() => monthsOf(destination.climate, destination.crowding),
    [destination.climate, destination.crowding]);
  const risk = React.useMemo(() => riskMonths(destination.climate), [destination.climate]);
  const bestShown = React.useMemo(() => bestMonthsFor(destination.climate, !!heatGuard).best,
    [destination.climate, heatGuard]);
  const verdict = React.useMemo(() => whenVerdict(months, bestShown),
    [months, bestShown]);
  const standing = React.useMemo(() => crowdStanding(destination.id, data?.destinations),
    [destination.id, data?.destinations]);
  const kinds = React.useMemo(() => stayKindsOf(rec), [rec]);
  // One formatter pass a language for the 12 names (monthName builds an Intl formatter a call).
  const names = React.useMemo(() => ({
    long: MONTHS.map((m) => monthName(m, lang, true)),
    initial: MONTHS.map((m) => (monthName(m, lang, false) || '').slice(0, 1).toUpperCase()),
  }), [lang]);
  const dated = React.useMemo(() => festivals.filter((f) => f.months?.length), [festivals]);
  // The month a tap chose, else the traveller's, else the first best month.
  const [picked, setMonth] = React.useState(null);
  const month = picked ?? monthPick ?? verdict?.best?.[0] ?? new Date().getMonth() + 1;

  // T1202 (D18): the months the place is shut (its own hut, lift or lido,
  // or every ferry to the island) and the seasonal huts, lifts and ferries
  // nearby, from OSM opening_hours (lib/season.js).
  const season = destination.season;
  const shut = closedMonths(season);
  const closed = new Set(shut);
  const shutWord = t(season?.conf === 'low' ? 'season.maybeClosed' : 'season.closed');
  const items = seasonItems(season);
  const checked = seasonChecked(season?.checked, lang);

  const swim = water?.n_sites > 0 && Number.isFinite(water?.excellent_pct) ? water : null;
  if (!months && !kinds.length && !dated.length && !swim && !shut.length && !items.length) return null;

  const sel = months?.[month - 1] || null;
  const fests = dated.filter((f) => f.months.includes(month));
  const festMonths = new Set(dated.flatMap((f) => f.months));
  const crowdWord = (c) => (c == null ? null : t(CROWD_TIER_KEYS[c]));
  const pct = standing == null ? null : Math.round((standing >= 0.5 ? standing : 1 - standing) * 100);

  return (
    <PSection id="pt-when" title={t('dest.whenTitle')}>
      {verdict && <Verdict t={t} verdict={verdict} monthList={monthList} />}
      <HeatNote t={t} risk={risk} monthList={monthList} basis={destination.climate?.risk?.fire_basis} />

      {months && (
        <div className="when-months">
          <div className="when-strip" role="group" aria-label={t('dest.whenTitle')}>
            {months.map((m, i) => (
              <button type="button" key={m.month} aria-pressed={m.month === month} onClick={() => setMonth(m.month)}
                className={`when-m is-${m.tier}${verdict?.best.includes(m.month) ? ' is-best' : ''}${m.month === month ? ' is-on' : ''}${closed.has(m.month) ? ' is-closed' : ''}`}
                aria-label={[names.long[i], closed.has(m.month) && shutWord, t(`when.rate.${m.tier}`), `${m.hi}°`, crowdWord(m.crowd)].filter(Boolean).join(', ')}>
                <span className="when-hi" aria-hidden="true">{m.hi}°</span>
                <span className="when-bar" aria-hidden="true" />
                {m.crowd != null && (
                  <span className="when-dots" data-c={m.crowd} aria-hidden="true"><i /><i /><i /><i /></span>
                )}
                <span className="when-init" aria-hidden="true">{names.initial[i]}</span>
                {festMonths.has(m.month) && <span className="when-fest" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <ul className="when-key" aria-hidden="true">
            {['great', 'good', 'mixed', 'poor'].map((k) => <li key={k} className={`is-${k}`}>{t(`when.rate.${k}`)}</li>)}
            {months.some((m) => m.crowd != null) && <li className="is-crowd">{t('when.crowds')}</li>}
            {shut.length > 0 && <li className="is-closed">{shutWord}</li>}
          </ul>
          {sel && (
            <div className="when-detail" aria-live="polite">
              <p className="when-detail-head">
                <b>{names.long[month - 1]}</b>
                <span className={`when-tag is-${sel.tier}`}>{t(`when.rate.${sel.tier}`)}</span>
                {sel.crowd != null && <span className="when-tag is-crowd">{crowdWord(sel.crowd)}</span>}
                {closed.has(month) && <span className="when-tag is-closed">{shutWord}</span>}
              </p>
              <p className="when-detail-text">{t('when.weather', { hi: sel.hi, lo: sel.lo, rain: sel.rain })}</p>
              {fests.length > 0 && <p className="when-detail-text">{fests.map((f) => f.name).join(', ')}</p>}
            </div>
          )}
        </div>
      )}

      {(shut.length > 0 || items.length > 0) && (
        <div className="when-season">
          {shut.length > 0 && (
            <p className="when-season-shut">
              <b>{t(season.why === 'ferry' ? 'season.closedFerry' : 'season.closedOwn', { months: monthList(shut) })}</b>
              {season.conf === 'low' ? <span>{t('season.guide')}</span> : checked && <span>{t('season.checked', { date: checked })}</span>}
            </p>
          )}
          {items.length > 0 && (
            <>
              <p className="when-season-head">{t('season.nearby')}</p>
              <ul className="when-season-items">
                {items.map((r) => (
                  <li key={`${r.k}:${r.n}`}>
                    {t('season.item', { name: r.n, kind: t(`season.kind.${r.k}`), months: monthList(r.open) })}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {pct != null && (
        <p className="when-crowd-line">
          <span className="when-gauge" aria-hidden="true"><i style={{ '--at': `${Math.round(standing * 100)}%` }} /></span>
          {t(standing >= 0.5 ? 'when.crowdBusier' : 'when.crowdQuieter', { pct })}
        </p>
      )}

      {kinds.length > 0 && (
        <StayPrices t={t} lang={lang} rec={rec} kinds={kinds} names={names} month={month} setMonth={setMonth} monthList={monthList} />
      )}

      {swim && (
        <p className="when-swim">
          <b>{t('destx.swim')}</b>
          <span>{t('destx.swimValue', { n: swim.n_sites, pct: Math.round(swim.excellent_pct) })}</span>
        </p>
      )}

      {dated.length > 0 && (
        <ul className="pt-fests" aria-label={t('dest.festivalsTitle')}>
          {dated.map((f) => (
            <li key={f.name}>
              <span className="pt-fest-when">{monthList(f.months)}</span>
              <span className="pt-fest-name">
                {safeUrl(f.url) ? <a href={safeUrl(f.url)} target="_blank" rel="noreferrer">{f.name}</a> : f.name}
                {f.what && lang === 'en' && <small>{f.what}</small>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PSection>
  );
}
