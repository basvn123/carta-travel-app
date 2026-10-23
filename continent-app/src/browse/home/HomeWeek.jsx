import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Chip, ChipGroup, Money, Segmented } from '../../components/ui/index.js';
import { CostRow } from '../../components/ui/CostRow.jsx';
import { useAirlines, airlineName } from '../../lib/flights/useAirlines.js';
import { settleFigure } from '../../lib/figureChange.js';
import { WEEK_NIGHTS, WEEK_PLACES, placeDay, weekSum } from '../../lib/homeDemo.js';
import { useReveal } from './useHome.js';

/**
 * The page's point, shown with real figures (T606, after the T605 critique
 * found that no visitor ever saw a cheap flight turn into the true total):
 * "A cheap flight is not a cheap trip". For one place and a few nights, a
 * person: the return flight, Google Flights' cheapest from the traveller's
 * home airport in the sweep, with the airline and when it was checked; the
 * bed and food and drink at the place's own rates; one total. The headline
 * says the two figures side by side.
 *
 * The card follows the owner's Wise reference (huge tabular total, the
 * inputs as two small controls, receipt lines under it). A changed figure
 * settles in place (settleFigure), never counts up. Without a flight from
 * home the line says so and the total is the ground alone.
 *
 * Props
 *   rows       catalogue rows with day costs
 *   flightFor  (placeId) => { perSeat, airline, checked } | null
 *   fromName   the home airport's town, for the flight line
 *   places     catalogue destinations (for the place names)
 *   door, onOpenDest
 */
export function HomeWeek({ rows, flightFor, fromName, places, door, onOpenDest }) {
  const { t, lang } = useI18n();
  const airlines = useAirlines();
  const reveal = useReveal();
  const options = React.useMemo(
    () => WEEK_PLACES.map((id) => ({ id, name: places?.[id]?.city || id, cost: placeDay(rows, id) })).filter((p) => p.cost),
    [rows, places],
  );
  const [pick, setPick] = React.useState(0);
  const [nights, setNights] = React.useState(7);
  const place = options[Math.min(pick, options.length - 1)] || null;
  const flight = place && flightFor ? flightFor(place.id) : null;
  const sum = place ? weekSum(place.cost, nights, flight) : null;
  const totalRef = React.useRef(null);
  React.useEffect(() => { if (totalRef.current) settleFigure(totalRef.current); }, [place?.id, nights]);
  if (!place || !sum) return null;

  const checked = flight?.checked
    ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(flight.checked))
    : null;
  const est = sum.stayEst || sum.foodEst;
  const nightsLabel = (n) => t('home.nightsN', { n });

  return (
    <section className="hv-section hv-week" aria-labelledby="hv-week-title" {...reveal}>
      <div className="hv-week-say">
        <h2 id="hv-week-title" className="hv-h2">{t('home.weekTitle')}</h2>
        <p className="hv-week-line" aria-live="polite">
          {withFigures(
            t(sum.flight ? 'home.weekLine' : 'home.weekLineGround', { place: place.name, nights, flight: '[[flight]]', total: '[[total]]' }),
            { flight: <Money value={sum.flight} />, total: <Money value={sum.total} est={est} /> },
          )}
        </p>
      </div>

      <div className="hv-week-card">
        <div className="hv-week-inputs">
          <ChipGroup label={t('home.weekPlace')} className="hv-week-places">
            {options.map((p, i) => (
              <Chip key={p.id} kind="choice" selected={i === pick} onClick={() => setPick(i)}>{p.name}</Chip>
            ))}
          </ChipGroup>
          <Segmented
            label={t('home.weekNights')}
            value={nights}
            onChange={setNights}
            options={WEEK_NIGHTS.map((n) => ({ value: n, label: nightsLabel(n) }))}
          />
        </div>

        <div className="hv-week-total" ref={totalRef}>
          <span className="hv-week-total-label">{t('home.weekTotal', { n: nights })}</span>
          <span className="hv-week-total-fig"><Money value={sum.total} est={est} /></span>
        </div>

        <dl className="costrows hv-week-rows">
          {sum.flight ? (
            <CostRow kind="flight" label={fromName ? t('home.weekFlight', { from: fromName }) : t('home.returnFlight')}
              sub={[flight.airline ? airlineName(airlines, flight.airline) : null, checked ? t('home.weekChecked', { when: checked }) : null].filter(Boolean).join(', ')}
              value={<Money value={sum.flight} />} />
          ) : (
            <CostRow kind="flight" tone="missing" label={t('home.weekFlightNone')} value={t('home.notPriced')} />
          )}
          <CostRow kind="bed" label={t('cost.bed')} sub={nightsLabel(nights)} value={<Money value={sum.bed} est={sum.stayEst} />} />
          <CostRow kind="food" label={t('cost.food')} sub={t('home.daysN', { n: nights })} value={<Money value={sum.food} est={sum.foodEst} />} />
        </dl>
        <p className="hv-week-note">{t('home.weekNote')}</p>
        <a className="btn btn-secondary hv-week-door" href={`#dest=${encodeURIComponent(place.id)}`} onClick={door(() => onOpenDest(place.id))}>
          <span className="btn-label">{t('home.openPlace', { place: place.name })}</span>
        </a>
      </div>
    </section>
  );
}

/** A translated sentence with its figures set in: each `[[name]]` marker in
 *  the text becomes that figure, in bold, so the word order stays the
 *  language's own (no sentence built by joining strings). */
function withFigures(text, figures) {
  return text.split(/(\[\[\w+\]\])/).map((part, i) => {
    const m = part.match(/^\[\[(\w+)\]\]$/);
    return m && figures[m[1]]
      ? <strong key={i} className="hv-fig">{figures[m[1]]}</strong>
      : <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
