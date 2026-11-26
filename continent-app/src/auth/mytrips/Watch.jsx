import React, { useEffect, useState } from 'react';
import { chartGeometry } from '../../lib/watchChart.js';
import { useI18n } from '../../i18n/index.jsx';
import { useAuth } from '../AuthContext.jsx';
import { Button, Switch } from '../../components/ui/index.js';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { BedIcon, PlaneIcon, SunIcon, BellIcon } from '../../components/Icons.jsx';
import { SectHead, MoveInk } from './atlas/Ink.jsx';
import { formatMoney } from '../../lib/money.js';
import { activeLocale } from '../../lib/localeState.js';
import {
  listWatched, subscribeWatch, syncWatch, unwatch, setWatchAlert, deltaSinceStart, lowest, latest, browserStorage,
} from '../../lib/watchStore.js';
import { alertsOn, listAlerts, saveAlert, deleteAlert, placeSpec, ALERTS_MOCK } from '../../lib/priceAlerts.js';

/* Volgen on Saved (G12, Phase D): the Gevolgd rail, its cards and sheet.
   Every chart point is a price Viantra measured (lib/watchStore). */

const KIND_ICON = { stay: BedIcon, flight: PlaneIcon, day: SunIcon };
const dayLabel = (iso) => {
  try { return new Date(iso).toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short' }); } catch { return ''; }
};

/** The followed items, current across tabs; synced once with the account
 *  where the rail mounts (as TasteChips does for taste). */
// eslint-disable-next-line react-refresh/only-export-components -- the rail's hook lives with the rail
export function useWatched({ sync = true } = {}) {
  const { user } = useAuth();
  const [items, setItems] = useState(() => listWatched());
  useEffect(() => subscribeWatch(() => setItems(listWatched())), []);
  const userId = user?.id || null;
  useEffect(() => {
    if (!sync || !userId) return undefined;
    let live = true;
    import('../accountThingsCloud.js').then(({ accountThingsCloud }) => {
      if (live) syncWatch({ userId, storage: browserStorage(), cloud: accountThingsCloud }).then(() => live && setItems(listWatched()));
    }).catch(() => {});
    return () => { live = false; };
  }, [sync, userId]);
  return items;
}

/** A line chart of the measured points: the card's small one, or the
 *  sheet's with dates and values on an axis. */
export function WatchChart({ pts, w, h, axis = false, label }) {
  const vals = pts.map((p) => p.eur);
  const g = chartGeometry(vals, w, h, { axis });
  if (!g) return null;
  const { d, last, min, foot, pad, X, Y } = g;
  const mi = g.lowest;
  return (
    <svg className="atlas-chart" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
      {/* Ink (decision 0016): the line and a square per measured week, the
          latest the larger umber square; no area under the line. */}
      <path className="atlas-chart-line" d={d} />
      {g.dots.map((p, i) => {
        const r = (p.now ? 6 : 4) / 2;
        return <rect key={i} className={p.now ? 'is-now' : ''} x={p.x - r} y={p.y - r} width={r * 2} height={r * 2} />;
      })}
      {axis && (
        <>
          <line className="atlas-chart-axis" x1={pad} x2={w - pad} y1={h - foot} y2={h - foot} />
          {[...new Set([0, Math.floor(last / 2), last])].map((i) => (
            <text key={`d${i}`} x={X(i)} y={h - 2} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}>{dayLabel(pts[i].at)}</text>
          ))}
          <text className="is-v" x={X(0)} y={Y(vals[0]) - 9} textAnchor="start">{formatMoney(vals[0])}</text>
          {last > 0 && <text className="is-v" x={X(last)} y={Y(vals[last]) - 10} textAnchor="end">{formatMoney(vals[last])}</text>}
          {mi !== last && mi !== 0 && <text x={X(mi)} y={Y(min) + 18} textAnchor="middle">{formatMoney(min)}</text>}
        </>
      )}
    </svg>
  );
}

/** "€ 28 lager", "€ 9 hoger" or "gelijk", from the first point. */
function moveWords(t, delta) {
  if (!delta) return t('watch.same');
  return t(delta < 0 ? 'watch.lower' : 'watch.higher', { price: formatMoney(Math.abs(delta)) });
}

function WatchCard({ item, onOpen }) {
  const { t } = useI18n();
  const Icon = KIND_ICON[item.kind] || SunIcon;
  const first = item.pts[0]?.eur;
  const now = latest(item)?.eur;
  const delta = deltaSinceStart(item) || 0;
  return (
    <Pressable className="atlas-watch" onClick={() => onOpen(item)}>
      <span className="atlas-watch-k">
        <Icon size={16} />{t(`watch.kind.${item.kind}`)}
        {item.alert && <span className="atlas-watch-bell" aria-label={t('watch.alertOn')}><BellIcon size={14} /></span>}
      </span>
      <span className="atlas-watch-n">{item.label}</span>
      {item.pts.length > 1 ? (
        <WatchChart pts={item.pts} w={208} h={44} label={t('watch.chartAria', { name: item.label, from: formatMoney(first), to: formatMoney(now) })} />
      ) : (
        // One measurement is no line and no move: the empty frame says when
        // the next point comes instead of "gelijk" (never an invented point).
        <span className="atlas-watch-wait">{t('watch.weekly')}</span>
      )}
      <span className="atlas-watch-p">
        <b className="num">{formatMoney(now)}</b>
        {item.pts.length > 1 && <MoveInk delta={delta}>{moveWords(t, delta)}</MoveInk>}
      </span>
    </Pressable>
  );
}

/** The Gevolgd rail: one card per followed thing. */
export function WatchRail({ items, onOpen }) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <section className="atlas-sect" aria-labelledby="atlas-watch-h">
      <SectHead id="atlas-watch-h" title={t('watch.title')} count={items.length} />
      <div className="atlas-rail">
        {items.map((it) => <WatchCard key={it.id} item={it} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

/** The followed thing's sheet: the full chart, Nu, Sinds je volgt, Laagst
 *  gezien, the 10% mail (the existing price alerts, migration 073), Bekijk
 *  de plek and Stop met volgen. */
export function WatchSheet({ item, dest = null, example = false, onOpenPlace, onClose }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const Icon = KIND_ICON[item.kind] || SunIcon;
  const now = latest(item)?.eur;
  const low = lowest(item);
  const delta = deltaSinceStart(item) || 0;
  const [alert, setAlert] = useState(!!item.alert);
  const userId = user?.id || (ALERTS_MOCK ? 'mock' : null);
  const ref = item.placeKey || '';
  // The mail is the account's price alert on the place; the switch is the
  // traveller's own act, the consent the alert asks for.
  const toggle = async (on) => {
    setAlert(on);
    if (example) return;
    setWatchAlert(item.id, on);
    if (!alertsOn() || !userId || !ref.startsWith('dest:')) return;
    if (on) {
      const month = new Date().getMonth() + 2;
      const spec = placeSpec({ dest, month: month > 12 ? month - 12 : month, nights: 3, adults: 2, bed: 'home' });
      if (spec) saveAlert({ kind: 'place', ref, label: item.label, spec, share: 0.1, lang });
    } else {
      const res = await listAlerts(userId);
      (res.alerts || []).filter((a) => a.kind === 'place' && a.ref === ref && !a.fired_at).forEach((a) => deleteAlert(a.id));
    }
  };
  const stop = () => { if (!example) unwatch(item.id); onClose(); };
  return (
    <SheetShell title={item.label} onClose={onClose} labelId="atlas-watch-title" width={460} className="atlas-watch-sheet">
      <p className="atlas-watch-src"><Icon size={16} />{item.source}</p>
      <WatchChart pts={item.pts} w={420} h={170} axis label={t('watch.chartAria', { name: item.label, from: formatMoney(item.pts[0]?.eur), to: formatMoney(now) })} />
      <dl className="atlas-kv">
        <div><dt>{t('watch.now')}</dt><dd className="num">{formatMoney(now)} {item.unitNote && <span>{t(`watch.unit.${item.unitNote.replace(/\W+/g, '').toLowerCase()}`)}</span>}</dd></div>
        <div><dt>{t('watch.since')}</dt><dd className="num">{moveWords(t, delta)}</dd></div>
        {low && <div><dt>{t('watch.lowest')}</dt><dd className="num">{formatMoney(low.eur)}, {dayLabel(low.at)}</dd></div>}
      </dl>
      <Switch className="atlas-watch-alert" label={t('watch.mail10')} checked={alert} onChange={toggle} />
      <div className="atlas-two">
        <Button onClick={() => { onClose(); onOpenPlace?.(item); }}>{t('watch.openPlace')}</Button>
        <Button onClick={stop}>{t('watch.stop')}</Button>
      </div>
    </SheetShell>
  );
}
