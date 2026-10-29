import React, { useEffect, useState } from 'react';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Field, Money, Segmented, Switch } from '../../components/ui/index.js';
import { AirlineMark } from '../../components/flights/Flights.jsx';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { liveKey } from '../../lib/flights/useLiveFlights.js';
import { NO_FLIGHT_PREFS } from '../../lib/flights/flights.js';
import { formatMoney } from '../../lib/money.js';
import { flightRows } from './changeFlight.js';
import { RouteCodes } from './RouteCodes.jsx';

const HOURS = Array.from({ length: 25 }, (_, h) => h);
const hh = (h) => `${String(h).padStart(2, '0')}:00`;

/**
 * Change flight (T840, owner board panel 6): one sheet for both ways. The
 * trip's flight preferences on top (only direct, leave between two hours)
 * steer which flight Carta prices and narrow the list; under them every
 * flight of that day the live search found, cheapest first, each with its
 * airline mark, times, stops, duration, what the party pays and what that
 * does to the total. Picking one prices the trip on it; "Add your own fare"
 * goes to the route's fare field. The owner removed the "Google Flights,
 * checked" line from this sheet (2026-10-29, carta-design amended).
 *
 *   dir          'out' | 'back', the way it opens on
 *   cartaFlight  priced.cartaFlight ({ out, back, queries })
 *   answers      the live answers (Map keyed by liveKey); a day without one
 *                reads as still searching for 15 s after the sheet opens
 *   prefs, onPrefs(p), onPick(dir, flight|null), onOwnFare(dir)
 *   party        { paying, babies, bagKey }
 */
export function ChangeFlight({ dir: startDir = 'out', cartaFlight, answers, prefs, onPrefs, onPick, onOwnFare, party, onClose }) {
  const { t, lang } = useI18n();
  const airlines = useAirlines();
  const [dir, setDir] = useState(startDir);
  const [searching, setSearching] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setSearching(false), 15000);
    return () => window.clearTimeout(id);
  }, []);
  const p = { ...NO_FLIGHT_PREFS, ...(prefs || {}) };
  const q = cartaFlight?.queries?.[dir === 'out' ? 0 : 1] || null;
  const answer = q ? answers?.get?.(liveKey(q.o, q.d, q.date)) || null : null;
  const current = cartaFlight?.[dir] || null;
  const { rows, known } = flightRows({ answer, current, prefs: p, party });
  const loading = !known && q && searching;
  const fmtMin = (min) => (Number.isFinite(min) ? t('flight.duration', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') }) : '');
  const stops = (n) => ((Number(n) || 0) === 0 ? t('flight.direct') : n === 1 ? t('flight.stop1') : t('flight.stops', { n }));
  const delta = (d) => {
    if (!Number.isFinite(d) || Math.abs(d) < 0.005) return '';
    return t(d > 0 ? 'tp.bal.more' : 'tp.bal.less', { price: formatMoney(Math.abs(d), { precision: 'cents', locale: lang }) });
  };
  const way = (which) => {
    const qq = cartaFlight?.queries?.[which === 'out' ? 0 : 1];
    return qq ? `${qq.o} ${t('tp.fl.to')} ${qq.d}` : t(which === 'out' ? 'flight.out' : 'flight.back');
  };

  return (
    <SheetShell title={t('tp.fl.title')} onClose={onClose} width={520} className="tpf-sheet" labelId="tpf-title">
      <div className="tpf">
        <Segmented
          block
          size="sm"
          label={t('tp.fl.way')}
          value={dir}
          onChange={setDir}
          options={[{ value: 'out', label: way('out') }, { value: 'back', label: way('back') }]}
        />
        <section className="tpf-prefs" aria-labelledby="tpf-prefs-h">
          <h3 className="tpf-h" id="tpf-prefs-h">{t('tp.fl.prefs')}</h3>
          <Switch label={t('tp.fl.direct')} checked={p.direct} onChange={(v) => onPrefs({ ...p, direct: v })} />
          <div className="tpf-hours">
            <Field as="select" label={t('tp.fl.after')} value={p.after} onChange={(e) => onPrefs({ ...p, after: Math.min(Number(e.target.value), p.before - 1) })}>
              {HOURS.slice(0, 24).map((h) => <option key={h} value={h}>{hh(h)}</option>)}
            </Field>
            <Field as="select" label={t('tp.fl.before')} value={p.before} onChange={(e) => onPrefs({ ...p, before: Math.max(Number(e.target.value), p.after + 1) })}>
              {HOURS.slice(1).map((h) => <option key={h} value={h}>{hh(h)}</option>)}
            </Field>
          </div>
        </section>

        {q && <p className="tpf-way"><RouteCodes from={q.o} to={q.d} /></p>}
        {loading ? (
          <p className="tpf-note" role="status">{t('flight.loading')}</p>
        ) : rows.length === 0 ? (
          <p className="tpf-note">{known ? t('tp.fl.noneFit') : t('flight.unknown')}</p>
        ) : (
          <ul className="tpf-list" role="radiogroup" aria-label={way(dir)}>
            {rows.map((r) => {
              const f = r.leg;
              const name = airlineName(airlines, f.airline) || f.airline;
              return (
                <li key={`${f.airline}-${f.dep}-${f.arr}`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={r.current}
                    className={`tpf-row${r.current ? ' is-on' : ''}`}
                    onClick={() => onPick(dir, r.current ? null : { ...f, from: q?.o, to: q?.d, date: q?.date, checked: answer?.checked || f.checked || null, link: answer?.link || null })}
                  >
                    <AirlineMark code={f.airline} size="sm" />
                    <span className="tpf-main">
                      <span className="tpf-times">{t('flight.times', { dep: f.dep, arr: f.arr })}</span>
                      <span className="tpf-sub">{[name, stops(f.stops), fmtMin(f.min)].filter(Boolean).join(', ')}</span>
                    </span>
                    <span className="tpf-fig">
                      <Money value={r.total} precision="cents" />
                      <span className="tpf-delta">{r.current ? t('tp.fl.now') : delta(r.delta)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!known && !loading && rows.length > 0 && <p className="tpf-note">{t('tp.fl.onlyPriced')}</p>}
        <Button variant="quiet" className="tpf-own" onClick={() => onOwnFare(dir)}>{t('plan.addYourFare')}</Button>
      </div>
    </SheetShell>
  );
}
