import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Card } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { CheckIcon } from '../../components/Icons.jsx';
import { formatMoney } from '../../lib/money.js';
import { SheetHead } from '../flow/PlanStage.jsx';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { useDoorRun, useLoaderDone } from './finderHooks.js';
import { answerChips, joinList, stopsText, tripName } from './finderText.js';
import { planOf } from './planOf.js';

/** How many flight rows show before "Show more flights". */
const FIRST_ROWS = 10;

/** A day as the reader's calendar writes it: "Sat 21 Nov". */
const dayText = (iso, lang) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');

/** The checks a door's loader shows, ticking on its real stages. */
function Checks({ lines }) {
  const { t } = useI18n();
  const working = lines.findIndex((l) => !l.done);
  return (
    <ol className="tff-checks" aria-live="polite">
      {lines.map((l, i) => {
        const state = l.done ? 'is-done' : i === working ? 'is-working' : 'is-waiting';
        return (
          <li key={l.key} className={`tff-check ${state}`}>
            <span className="tff-check-mark" aria-hidden="true">{l.done && <CheckIcon size={12} />}</span>
            <span>{l.text}</span>
            {l.done && <span className="sr-only">{t('tf.load.done')}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** The answers a door narrows by, as the loader's chips: the named places first. */
function useAnswerChips(settings, originName) {
  const { t, lang } = useI18n();
  const months = useMonths();
  const bcp47 = useBcp47();
  const when = whenText(t, settings.when, months, bcp47);
  const places = (settings.places || []).map((p) => ({ id: `place:${p.kind}:${p.id}`, label: p.name })).filter((c) => c.label);
  return { when, chips: [...places, ...answerChips(settings, { t, lang, originName, when, locale: lang })] };
}

/** One leg of a row: the airline's own mark, the times, the stops, the day. */
function Leg({ leg, dir, ui, lang, showHome }) {
  const { t } = useI18n();
  const { AirlineMark } = ui;
  const day = dayText(leg.date, lang);
  return (
    <span className="ffl-leg">
      <AirlineMark code={leg.airline} size="sm" />
      <span className="ffl-leg-text">
        <span className="ffl-times">{t('flight.times', { dep: leg.dep, arr: leg.arr })}</span>
        <span className="ffl-leg-sub">
          {[t(dir === 'out' ? 'ff.out' : 'ff.back', { day }), stopsText(t, leg.stops), showHome && dir === 'out' ? t('ff.from', { code: leg.from }) : '']
            .filter(Boolean).join(', ')}
        </span>
      </span>
    </span>
  );
}

/**
 * Find my flight first (T864): a flight results page narrowed by every
 * answer already given (the named places, or the likes and the weather when
 * the place is open; the dates or month and nights; the airports in reach;
 * the budget), one row per place: its photo and name, the flight there and
 * home with the airline's mark, the times, the stops and the day, and the
 * fare for the group door to door, cheapest first. Google Flights' figure,
 * whole euros as in every list. The whole row picks it: the flight becomes a
 * trip (one base there for the nights), and the stays and days are added
 * from the trip page.
 *
 *   onPick(plan)   the row's trip as the finder's plan (planOf)
 *   onBack()       the doors
 *   onChange()     the setup's answers (the trip settings)
 */
export function FlightFirstScreen({ ui, settings, onBack, onPick, onChange, headEnd = null }) {
  const { t, lang } = useI18n();
  const bcp47 = useBcp47();
  const titleRef = useRef(null);
  const run = useDoorRun(settings, 'flight');
  const rows = run.result;
  const ready = Array.isArray(rows) || run.result === null;
  const { done } = useLoaderDone(ready, 900);
  const [shown, setShown] = useState(FIRST_ROWS);
  const homes = new Set((rows || []).map((r) => r.flight.facts.out.from));
  const originName = run.origin?.name || '';
  // The answers name the traveller's own town (Ghent), as Tell Carta did.
  const { when, chips } = useAnswerChips(settings, settings.from?.name || originName);
  const destinations = run.data?.destinations || {};
  const people = Math.max(1, settings.party.adults + settings.party.kids);
  const dates = when.start && when.end ? t('tf.chip.dates', { start: when.start, end: when.end }) : when.start;

  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, [done]);

  const head = (
    <>
      <SheetHead onBack={onBack} backLabel={t('pf.back')} end={headEnd} />
      <h2 className="pf-title" tabIndex={-1} ref={titleRef}>{t(done ? 'ff.title' : 'ff.load.title')}</h2>
      {chips.length > 0 && (
        <ul className="tff-chips" aria-label={t('tf.chip.label')}>
          {chips.map((c) => <li key={c.id} className="tff-chip">{c.label}</li>)}
        </ul>
      )}
    </>
  );

  if (!done) {
    return (
      <div className="pf-step tff-load">
        {head}
        <Checks lines={[
          { key: 'places', text: t('ff.load.places'), done: run.stages.flights },
          { key: 'flights', text: dates ? t('tf.load.flights', { city: originName, dates }) : t('tf.load.flightsAny', { city: originName }), done: run.stages.flights },
          { key: 'priced', text: t('ff.load.price', { n: people }), done: run.stages.priced },
        ]} />
      </div>
    );
  }

  if (!rows?.length) {
    return (
      <div className="pf-step tff-load">
        {head}
        <p className="tff-fail" role="status">{t('ff.none')}</p>
        <div className="pf-foot">
          <Button variant="primary" block onClick={onChange}>{t('ff.change')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="pf-step ffl-step">
      {head}
      <ol className="ffl" aria-label={t('ff.listLabel')}>
        {rows.slice(0, shown).map(({ trip, flight }) => {
          const d = destinations[trip.places[0].id];
          const name = tripName(trip, destinations, lang) || trip.country;
          const fare = formatMoney(flight.eurGroup, { locale: lang });
          return (
            <li key={trip.id}>
              <Card
                as="div"
                className="ffl-card"
                data-place={trip.places[0].id}
                media={<HeroImage url={d?.image?.url} city={name} iso2={trip.iso2} className="ffl-photo" maxWidth={160} sizes="72px" ratio={[1, 1]} />}
                title={name}
                onOpen={() => onPick(planOf(trip))}
                meta={(
                  <>
                    <span className="ffl-where"><CountryFlag country={trip.iso2} size={14} />{trip.country}</span>
                    <Leg leg={flight.facts.out} dir="out" ui={ui} lang={bcp47} showHome={homes.size > 1} />
                    <Leg leg={flight.facts.back} dir="back" ui={ui} lang={bcp47} showHome={false} />
                  </>
                )}
                price={(
                  <span className="ffl-fare">
                    <span className="ffl-fare-n money">{fare}</span>
                    <span className="ffl-fare-lbl">{people === 1 ? t('ff.forOne') : t('ff.forN', { n: people })}</span>
                  </span>
                )}
              />
            </li>
          );
        })}
      </ol>
      {rows.length > shown && (
        <div className="ffl-more">
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + FIRST_ROWS)}>{t('ff.more')}</Button>
        </div>
      )}
      <p className="ffl-note">{t('ff.mayChange')}</p>
    </div>
  );
}

/**
 * I know where I'm going, the build (T865): the loader while Carta drafts
 * and prices the route through the named places, then straight on to the
 * trip page (onLand with the trip's plan). A route that cannot be built
 * says so in one line and goes back to the places.
 */
export function KnowBuildScreen({ settings, onBack, onLand }) {
  const { t, lang } = useI18n();
  const titleRef = useRef(null);
  const run = useDoorRun(settings, 'know');
  const ready = run.result !== undefined;
  const { done } = useLoaderDone(ready, 900);
  const { chips } = useAnswerChips(settings, settings.from?.name || run.origin?.name || '');
  const places = useMemo(() => joinList((settings.places || []).map((p) => p.name), lang), [settings.places, lang]);
  const landed = useRef(false);
  useEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!done || !run.result || landed.current) return;
    landed.current = true;
    onLand(planOf(run.result));
  }, [done, run.result]); // eslint-disable-line react-hooks/exhaustive-deps -- lands once, on the built trip
  const failed = done && !run.result;
  return (
    <div className="pf-step tff-load">
      <SheetHead onBack={onBack} backLabel={t('pf.back')} />
      <h2 className="pf-title" tabIndex={-1} ref={titleRef}>{t('kw.load.title')}</h2>
      {chips.length > 0 && (
        <ul className="tff-chips" aria-label={t('tf.chip.label')}>
          {chips.map((c) => <li key={c.id} className="tff-chip">{c.label}</li>)}
        </ul>
      )}
      {failed ? (
        <>
          <p className="tff-fail" role="status">{t('kw.fail')}</p>
          <div className="pf-foot">
            <Button variant="primary" block onClick={onBack}>{t('pf.back')}</Button>
          </div>
        </>
      ) : (
        <Checks lines={[
          { key: 'route', text: t('kw.load.route', { places }), done: run.stages.flights },
          { key: 'priced', text: t('kw.load.price'), done: run.stages.priced },
        ]} />
      )}
    </div>
  );
}
