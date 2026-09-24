import React, { useMemo, useState } from 'react';
import { legLinks, TRAVEL_MODES, TRAVEL_MODE_LABEL } from '../lib/transportLinks.js';
import { fmtDate, addDays } from '../lib/dates.js';
import { eur } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import {
  TrainIcon, BusIcon, CarIcon, FerryIcon, CalendarIcon, InfoIcon, CheckIcon,
  ChevronDownIcon, PlusIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { cityLabel } from '../lib/placeName.js';
import { PlannerSection } from './PlannerSection.jsx';

/**
 * How you get there, how you get between the stops, and how you get home.
 *
 * Carta does not price any of it. It knows the route and the day, so it hands
 * both to the people who sell the ticket and asks for one thing back: what it
 * cost. That number is the traveller's own, it beats every estimate in the
 * app, and it is what turns the trip total from a guess into a receipt.
 *
 * This is a STEP now, not a block at the bottom of one, so it is built to be
 * scanned before it is filled in:
 *
 *   the strip     the whole journey on one line, origin to stops to origin,
 *                 and tapping a node opens that leg
 *   three blocks  out, between the stops, home, because those are three
 *                 different decisions and only the first is usually a flight
 *   one open      a leg at a time, so a five-stop trip is a screen rather
 *                 than a wall of twenty identical fields
 *   folded money  "what it cost" and "who with" live behind "Add what you
 *                 paid": they are what you come BACK to, after booking
 *
 * Nothing here starts empty. Every leg opens with a mode already chosen, from
 * the trip's own published route where there is one and from the rules in
 * lib/gettingThere.js where there is not, so the traveller is correcting a
 * guess rather than answering the same question once per hop.
 *
 * The date control at the top is the reason the whole itinerary is stored as
 * nights from a single start date rather than as a wall of fixed dates: find a
 * flight two days later that is forty euros cheaper, move the trip, and every
 * leg below moves with it, links included. Nothing else needs editing.
 */

const MODE_ICON = {
  fly: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon, ferry: FerryIcon,
};

/** The party total entered for one leg, as a number, or 0. */
function legEur(v) {
  const n = Number(String(v?.eur ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** What the traveller has told Carta the moving about costs, all legs. */
export function travelTotal(values) {
  return Object.values(values || {}).reduce((sum, v) => sum + legEur(v), 0);
}

/** "2 h 10 by train, 210 km", from the trip's own published leg. Reuses the
 *  wording legLine gives the trip page, minus the fare, which this step is
 *  asking the traveller for rather than telling them. */
function publishedLine(pub, t) {
  if (!pub || pub.minutes == null) return '';
  const h = Math.floor(pub.minutes / 60);
  const m = pub.minutes % 60;
  const time = h ? t('trip.legHm', { h, m: String(m).padStart(2, '0') }) : t('trip.legM', { m });
  return t('travel.publishedLeg', { time, mode: t(TRAVEL_MODE_LABEL[pub.mode] || 'trip.modeTrain').toLowerCase(), km: pub.km });
}

/**
 * One hop, open.
 *
 * `booked` means the traveller told the first step this part is already
 * arranged. Then this is not a question: the leg says so and keeps only the
 * place to write down what it cost, because a booked flight has a price and
 * the trip total still wants it.
 */
function LegBody({ leg, value, onChange, adults, t }) {
  const { lang } = useI18n();
  const mode = value?.mode || '';
  const [payOpen, setPayOpen] = useState(() => Boolean(value?.eur || value?.service));
  // legLinks already leads a flight leg with Google Flights (T7) and keeps the
  // affiliate links right behind it, so there is nothing to splice in here.
  const links = useMemo(() => legLinks({
    from: leg.from,
    to: leg.to,
    mode,
    date: leg.date,
    returnDate: leg.returnDate || '',
    adults,
    subId: `wiz_${leg.kind}`,
    lang,
  }), [leg, mode, adults, lang]);

  if (leg.booked) {
    return (
      <div className="tleg-body">
        <p className="tleg-booked"><CheckIcon size={13} /> {t('travel.bookedLeg')}</p>
        <PaidFields value={value} onChange={onChange} legKey={leg.key} t={t} />
      </div>
    );
  }

  return (
    <div className="tleg-body">
      <div className="tleg-modes" role="group" aria-label={t('travel.howLabel')}>
        {TRAVEL_MODES.map((m) => {
          const Icon = MODE_ICON[m];
          return (
            <button
              key={m}
              type="button"
              className={`tleg-mode ${mode === m ? 'on' : ''}`}
              onClick={() => onChange(leg.key, { mode: mode === m ? '' : m })}
              aria-pressed={mode === m}
            >
              <Icon size={14} />
              <span>{t(TRAVEL_MODE_LABEL[m])}</span>
            </button>
          );
        })}
      </div>

      {/* Which airports actually fly somewhere near this stop, and how long it
          takes to get from the runway to the town. Only on the legs that touch
          home, because the hops between stops are not flown. */}
      {mode === 'fly' && leg.airports?.length > 0 && (
        <div className="tleg-airports">
          <span className="tleg-airports-label">{t('travel.flyInto')}</span>
          {leg.airports.map((a) => (
            <span key={a.iata} className="tleg-airport">
              <b>{a.iata}</b>
              <small>
                {a.transferMin != null
                  ? t('travel.airportTransfer', { km: a.km, n: a.transferMin, mode: t(`mode.${a.transferMode || 'train'}`) })
                  : t('travel.airportKm', { km: a.km })}
              </small>
            </span>
          ))}
        </div>
      )}

      {links.length > 0 && (
        <div className="tleg-links">
          <span className="tleg-links-label">{t('travel.checkOn')}</span>
          {links.map((l) => (
            <a key={l.key} className="tleg-link" href={l.url} target="_blank" rel="noreferrer noopener">
              {l.label} &#8599;
            </a>
          ))}
        </div>
      )}

      {payOpen ? (
        <PaidFields value={value} onChange={onChange} legKey={leg.key} t={t} />
      ) : (
        <button type="button" className="tleg-addpaid" onClick={() => setPayOpen(true)}>
          <PlusIcon size={13} /> {t('travel.addWhatYouPaid')}
        </button>
      )}
    </div>
  );
}

/** What it cost and who with. Folded away by default: it is what a traveller
 *  comes back to after booking, not what they open this step to do. */
function PaidFields({ value, onChange, legKey, t }) {
  return (
    <div className="tleg-paid">
      <label className="tleg-field">
        <span className="tleg-field-label">{t('travel.whatYouPaid')}</span>
        <span className="tleg-input-wrap">
          <span className="tleg-cur" aria-hidden="true">&euro;</span>
          <input
            className="tleg-input"
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={value?.eur ?? ''}
            onChange={(e) => onChange(legKey, { eur: e.target.value })}
            placeholder="0"
            aria-label={t('travel.whatYouPaid')}
          />
        </span>
      </label>
      <label className="tleg-field tleg-field-wide">
        <span className="tleg-field-label">{t('travel.whoWith')}</span>
        <input
          className="tleg-text"
          type="text"
          maxLength={40}
          value={value?.service ?? ''}
          onChange={(e) => onChange(legKey, { service: e.target.value })}
          placeholder={t('travel.whoWithPlaceholder')}
          aria-label={t('travel.whoWith')}
        />
      </label>
    </div>
  );
}

/** One hop as a row that opens. The header carries everything a traveller
 *  scanning the step needs: where to where, when, and how, already answered. */
function LegRow({ leg, value, onChange, adults, open, onToggle, t }) {
  const mode = value?.mode || '';
  const Icon = MODE_ICON[mode];
  const paid = legEur(value);
  return (
    <div className={`tleg ${mode ? 'answered' : ''} ${open ? 'open' : ''}`} id={`leg-${leg.key}`}>
      <button
        type="button"
        className="tleg-head"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`legbody-${leg.key}`}
      >
        <span className="tleg-route">
          <b>{cityLabel(leg.from.city) || leg.from.name}</b>
          <span className="tleg-arrow" aria-hidden="true">&rarr;</span>
          <b>{cityLabel(leg.to.city) || leg.to.name}</b>
        </span>
        <span className="tleg-head-meta">
          {leg.date && (
            <span className="tleg-date"><CalendarIcon size={10} /> {fmtDate(leg.date)}</span>
          )}
          {leg.booked ? (
            <span className="tleg-tag is-booked"><CheckIcon size={10} /> {t('travel.booked')}</span>
          ) : Icon && (
            <span className="tleg-tag"><Icon size={11} /> {t(TRAVEL_MODE_LABEL[mode])}</span>
          )}
          {paid > 0 && <span className="tleg-tag is-paid">{eur(paid)}</span>}
          <ChevronDownIcon size={14} className="tleg-chev" />
        </span>
      </button>
      {/* What the trip's own composer measured for this hop: "2 h 10 by train,
          210 km". It is the reason the mode above is already chosen, so it
          belongs on the row rather than inside the fold. */}
      {leg.published && (
        <p className="tleg-measured">{publishedLine(leg.published, t)}</p>
      )}
      <div id={`legbody-${leg.key}`} hidden={!open}>
        {open && (
          <LegBody leg={leg} value={value} onChange={onChange} adults={adults} t={t} />
        )}
      </div>
    </div>
  );
}

/**
 * The whole journey on one line, and a way into any part of it.
 *
 * Origin, every stop, origin again. It is the only place in the step where the
 * trip is visible as a shape rather than as a list of hops, and tapping a node
 * opens the leg that arrives there, which is what people reach for when they
 * are looking for "the Barcelona flight" rather than "leg three".
 */
function JourneyStrip({ legs, onJump, t }) {
  if (legs.length < 2) return null;
  const nodes = [legs[0].from, ...legs.map((l) => l.to)];
  return (
    <div className="tstrip" role="list" aria-label={t('travel.stripLabel')}>
      {nodes.map((p, i) => (
        <React.Fragment key={`${p.city}-${i}`}>
          {i > 0 && <span className="tstrip-arrow" aria-hidden="true">&rarr;</span>}
          <button
            type="button"
            className="tstrip-node"
            role="listitem"
            // Node 0 is where the trip leaves from, so it belongs to the first
            // leg; every other node is where a leg ARRIVES.
            onClick={() => onJump(legs[Math.max(0, i - 1)].key)}
          >
            <b>{cityLabel(p.city) || p.name}</b>
            {legs[Math.max(0, i - 1)]?.date && i > 0 && (
              <small>{fmtDate(legs[i - 1].date)}</small>
            )}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}

export function TravelLegsSection({
  legs, values, onChange, adults = 1, startDate, onSetStart, dateMin, dateMax,
  openJawHint = '',
}) {
  const { t } = useI18n();
  const total = travelTotal(values);
  // One leg open at a time. It opens on the way out, which is the leg
  // everybody books first and the only one that is usually a flight.
  const [openKey, setOpenKey] = useState(() => legs[0]?.key || '');
  const shift = (days) => {
    if (!startDate || !onSetStart) return;
    const next = addDays(startDate, days);
    if (dateMin && next < dateMin) return;
    if (dateMax && next > dateMax) return;
    onSetStart(next);
  };
  const jump = (key) => {
    setOpenKey(key);
    if (typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      document.getElementById(`leg-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const out = legs.filter((l) => l.kind === 'out');
  const inter = legs.filter((l) => l.kind === 'inter');
  const back = legs.filter((l) => l.kind === 'back');
  const row = (leg) => (
    <LegRow
      key={leg.key}
      leg={leg}
      value={values[leg.key]}
      onChange={onChange}
      adults={adults}
      open={openKey === leg.key}
      onToggle={() => setOpenKey(openKey === leg.key ? '' : leg.key)}
      t={t}
    />
  );

  return (
    <div className="tlegs">
      <JourneyStrip legs={legs} onJump={jump} t={t} />

      {startDate && onSetStart && (
        <div className="tlegs-shift">
          <span className="tlegs-shift-label">{t('travel.moveTrip')}</span>
          <div className="tlegs-shift-ctl">
            <button className="tlegs-shift-btn" onClick={() => shift(-1)} aria-label={t('travel.dayEarlier')}>-1</button>
            <b className="tlegs-shift-date">{fmtDate(startDate)}</b>
            <button className="tlegs-shift-btn" onClick={() => shift(1)} aria-label={t('travel.dayLater')}>+1</button>
          </div>
          <span className="tlegs-shift-note">{t('travel.moveTripNote')}</span>
        </div>
      )}

      {out.length > 0 && (
        <PlannerSection title={<><PlaneIcon size={13} /> {t('travel.secOut')}</>} className="tlegs-sec">
          {openJawHint && <p className="tlegs-jaw"><InfoIcon size={12} /> {openJawHint}</p>}
          <div className="tlegs-list">{out.map(row)}</div>
        </PlannerSection>
      )}

      {inter.length > 0 && (
        <PlannerSection
          title={<><TrainIcon size={13} /> {t('travel.secBetween')}</>}
          className="tlegs-sec"
        >
          <div className="tlegs-list">{inter.map(row)}</div>
        </PlannerSection>
      )}

      {back.length > 0 && (
        <PlannerSection title={<><PlaneIcon size={13} /> {t('travel.secBack')}</>} className="tlegs-sec">
          <div className="tlegs-list">{back.map(row)}</div>
        </PlannerSection>
      )}

      <div className="tlegs-foot">
        <span className="tlegs-total-label"><InfoIcon size={11} /> {t('travel.totalLabel')}</span>
        <b className="tlegs-total">{total > 0 ? eur(total) : t('travel.nothingYet')}</b>
      </div>
    </div>
  );
}

/**
 * The same legs, read-only, for the Finish summary.
 *
 * The full section used to render twice, so the last screen of the wizard
 * re-asked every question the step before it had just answered. This reports
 * instead, and the one control on it goes back to the step that owns them.
 */
export function TravelLegsSummary({ legs, values, onEdit }) {
  const { t } = useI18n();
  const total = travelTotal(values);
  if (!legs.length) return null;
  return (
    <PlannerSection
      title={<><PlaneIcon size={13} /> {t('travel.title')}</>}
      aside={onEdit && (
        <button type="button" className="guide-answered-edit" onClick={onEdit}>
          {t('travel.edit')}
        </button>
      )}
      className="tsum"
    >
      <div className="tsum-list">
        {legs.map((leg) => {
          const v = values[leg.key] || {};
          const Icon = MODE_ICON[v.mode];
          const paid = legEur(v);
          return (
            <div className="tsum-row" key={leg.key}>
              <span className="tsum-route">
                {cityLabel(leg.from.city) || leg.from.name}
                <span className="tleg-arrow" aria-hidden="true">&rarr;</span>
                {cityLabel(leg.to.city) || leg.to.name}
              </span>
              {leg.booked
                ? <span className="tsum-mode"><CheckIcon size={11} /> {t('travel.booked')}</span>
                : Icon && <span className="tsum-mode"><Icon size={12} /> {t(TRAVEL_MODE_LABEL[v.mode])}</span>}
              <span className="tsum-eur">{paid > 0 ? eur(paid) : ''}</span>
            </div>
          );
        })}
      </div>
      <div className="tlegs-foot">
        <span className="tlegs-total-label">{t('travel.totalLabel')}</span>
        <b className="tlegs-total">{total > 0 ? eur(total) : t('travel.nothingYet')}</b>
      </div>
    </PlannerSection>
  );
}
