import React, { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Tabs } from '../../components/ui/index.js';
import { ExternalIcon } from '../../components/Icons.jsx';
import { bagTier } from '../../lib/flights/bagFees.js';
import { rule } from '../../lib/price/config.js';
import { chooseFlight, optionsFor } from '../../lib/recommend/adapters/flight.js';
import { OptionRow } from './LinePicker.jsx';
import { checkedText, stopsText, withSlot } from './finderText.js';
import { useBcp47 } from '../flow/flowHooks.js';
import { slotTotals } from '../../lib/recommend/slots.js';

const GROUPS = ['cheapest', 'quickest', 'times'];

/** "1 h 35" from minutes. */
const duration = (t, min) => (Number.isFinite(min) ? t('tf.pick.duration', { h: Math.floor(min / 60), m: String(min % 60).padStart(2, '0') }) : '');

/** A day as the reader's calendar writes it: "Sat 21 Nov". */
const dayText = (iso, lang) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

/**
 * The flight picker's body (T800). It opens on the swept pick at once, then
 * asks /api/flights for the trip's out and back days (optionsFor) and shows
 * them as three tabs, cheapest, quickest and best times, each with an "Out"
 * and a "Back" group. A row: the airline's own mark, the times, the
 * airline, direct or its stops with the change airport, the duration, that
 * flight's own price a person and the difference to the trip. The price is
 * Google Flights', with when it was checked and the link out. A fare the
 * traveller typed is theirs, with no Google Flights line. When the live day
 * fails or is empty the swept pick stays and one line says so.
 *
 *   onPending(slot | null)   the flight slot as the picked flights would make it
 */
export function FlightOptions({ trip, slot, onPending, ui }) {
  const { t, lang } = useI18n();
  const bcp47 = useBcp47();
  const airlines = ui.useAirlines();
  const { airlineName } = ui;
  const { AirlineMark } = ui;
  const [opts, setOpts] = useState(undefined); // undefined loading, null failed, object loaded
  const [tab, setTab] = useState('cheapest');
  const [choice, setChoice] = useState({ out: null, back: null });
  const facts = slot.pick?.facts || {};
  const typed = slot.pick?.id === 'yours';
  const drive = slot.pick?.id === 'drive';
  const offline = typed || drive || !trip.gateway;

  useEffect(() => {
    if (offline) return undefined;
    let alive = true;
    optionsFor(trip, { lang }).then((o) => { if (alive) setOpts(o || null); }, () => { if (alive) setOpts(null); });
    return () => { alive = false; };
  }, [trip.id]); // eslint-disable-line react-hooks/exhaustive-deps -- once per trip; a swap does not refetch the day

  // The slot the picked flights make, out then back (chooseFlight is order free).
  useEffect(() => {
    if (!choice.out && !choice.back) { onPending(null); return; }
    let next = trip;
    for (const dir of ['out', 'back']) {
      const o = choice[dir];
      if (o) next = withSlot(next, chooseFlight(next, o), slotTotals);
    }
    onPending(next.slots.find((s) => s.id === 'flight'));
  }, [choice]); // eslint-disable-line react-hooks/exhaustive-deps -- recomputed when a flight is picked

  const empty = opts === null || (opts && !opts.out && !opts.back)
    || (opts && GROUPS.every((g) => !(opts.out?.groups[g]?.length || opts.back?.groups[g]?.length)));
  const bag = bagTier(trip.state?.baggage || trip.base?.state?.baggage || rule('request.default_bag'));
  const checked = Math.max(0, ...[opts?.out?.checked, opts?.back?.checked, facts.checked].filter(Number.isFinite));

  const currentRow = (dir) => {
    const leg = facts[dir];
    if (!leg) return null;
    return (
      <OptionRow
        key={`cur-${dir}`}
        t={t}
        lang={lang}
        lead={<AirlineMark code={leg.airline} />}
        label={t('flight.times', { dep: leg.dep, arr: leg.arr })}
        sub={[airlineName(airlines, leg.airline), stopsText(t, leg.stops), duration(t, leg.minutes)].filter(Boolean).join(', ')}
        eur={leg.price ?? leg.perSeat}
        chosen
        selected={!choice[dir]}
        onPick={() => setChoice((c) => ({ ...c, [dir]: null }))}
      />
    );
  };

  const group = (dir) => {
    const leg = facts[dir];
    const live = opts?.[dir]?.groups?.[tab] || [];
    const from = dir === 'out' ? trip.origin : trip.gateway?.iata;
    const to = dir === 'out' ? trip.gateway?.iata : trip.origin;
    const date = dir === 'out' ? trip.dates?.out : trip.dates?.back;
    const same = (o) => leg && o.facts.flightNo && o.facts.flightNo === leg.flightNo;
    return (
      <section className="tff-fgroup" key={dir} aria-label={t(`tf.pick.dir.${dir}`, { day: dayText(date, bcp47), from, to })}>
        <h4 className="tff-fgroup-head">{t(`tf.pick.dir.${dir}`, { day: dayText(date, bcp47), from, to })}</h4>
        <div className="tff-opts" role="radiogroup" aria-label={t(`tf.pick.dir.${dir}`, { day: dayText(date, bcp47), from, to })}>
          {currentRow(dir)}
          {live.filter((o) => !same(o)).map((o) => (
            <OptionRow
              key={o.id}
              t={t}
              lang={lang}
              lead={<AirlineMark code={o.facts.airline} />}
              label={t('flight.times', { dep: o.facts.dep, arr: o.facts.arr })}
              sub={[
                airlineName(airlines, o.facts.airline),
                o.facts.stops > 0 && o.facts.via ? t('tf.pick.via', { stops: stopsText(t, o.facts.stops), via: o.facts.via }) : stopsText(t, o.facts.stops),
                duration(t, o.facts.minutes),
              ].filter(Boolean).join(', ')}
              eur={o.facts.price ?? o.facts.perSeat}
              delta={o.eur != null && slot.eur != null ? o.eur - slot.eur : null}
              selected={choice[dir]?.id === o.id}
              onPick={() => setChoice((c) => ({ ...c, [dir]: o.legGroup == null ? null : o }))}
            />
          ))}
        </div>
      </section>
    );
  };

  if (typed || drive) {
    return (
      <div className="tff-opts" role="radiogroup" aria-label={t(slot.labelKey)}>
        <OptionRow t={t} lang={lang} label={t(typed ? 'tf.opt.flight.yours' : 'tf.opt.flight.drive')} eur={slot.eur} chosen selected onPick={() => {}} />
      </div>
    );
  }

  return (
    <div className="tff-flights">
      {!empty && opts && (
        <Tabs
          label={t('tf.pick.title.flight')}
          className="tff-ftabs"
          tabs={GROUPS.map((g) => ({ id: g, label: t(`tf.opt.flight.${g}`) }))}
          value={tab}
          onChange={setTab}
        />
      )}
      {opts === undefined && <p className="tff-flights-note" role="status">{t('flight.loading')}</p>}
      {empty && <p className="tff-flights-note" role="status">{t('tf.pick.noFlights')}</p>}
      {group('out')}
      {group('back')}
      <p className="tff-gf">
        {t(`tf.pick.bag.${bag}`)}{' '}
        {checked > 0 && <>{checkedText(t, checked, lang)}. </>}
        {facts.link && (
          <a href={facts.link} target="_blank" rel="noopener noreferrer">
            {t('tf.pick.mayChange')}<ExternalIcon size={12} />
          </a>
        )}
      </p>
    </div>
  );
}
