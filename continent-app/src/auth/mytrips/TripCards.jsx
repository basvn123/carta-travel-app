import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Card } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlagStack } from '../../components/CountryFlag.jsx';
import { CheckIcon, ChevronRightIcon, PersonIcon, ListDayIcon, UploadIcon } from '../../components/Icons.jsx';
import { formatMoney } from '../../lib/money.js';
import { CardMenu, Faces, whenText } from './parts.jsx';
import { MarkPlate, ReadyTiles, AfterTrip, ShareMenu } from './TripParts.jsx';
import { JourneyLine } from './atlas/JourneyLine.jsx';

/** A step's state as a drawn mark: done, part done, not yet. */
function StepMark({ state }) {
  if (state === 'done') return <span className="mt-step-mark is-done" aria-hidden="true"><CheckIcon size={14} /></span>;
  return <span className={`mt-step-mark${state === 'part' ? ' is-part' : ''}`} aria-hidden="true" />;
}

/**
 * Ready for the trip (T923): one bar of four segments and the four steps,
 * each from what the trip holds (lib/myTrips.readinessSteps). A step with a
 * count (beds, days) is part done once one is booked or planned.
 */
export function Readiness({ readiness, onAddBooking = null }) {
  const { t } = useI18n();
  if (!readiness) return null;
  const state = (s) => (s.done ? 'done' : s.n > 0 ? 'part' : 'todo');
  const text = (s) => {
    if (s.key === 'dates') return t(s.done ? 'mt.stepDatesDone' : 'mt.stepDatesTodo');
    if (s.key === 'travel') return t(s.done ? 'mt.stepTravelDone' : 'mt.stepTravelTodo');
    if (s.key === 'beds') return t('mt.stepBeds', { n: s.n, of: s.of });
    return t('mt.stepDays', { n: s.n, of: s.of });
  };
  return (
    <section className="mt-ready" aria-labelledby="mt-ready-h">
      <div className="mt-ready-head">
        <h4 className="mt-ready-title" id="mt-ready-h">{t('mt.readyTitle')}</h4>
        <span className="mt-ready-n">{t('mt.readyDone', { n: readiness.done, of: readiness.total })}</span>
      </div>
      <span className="mt-ready-bar" aria-hidden="true">
        {readiness.steps.map((s) => <i key={s.key} className={`is-${state(s)}`} />)}
      </span>
      <ul className="mt-steps">
        {readiness.steps.map((s) => (
          <li key={s.key} className={`mt-step is-${state(s)}`}>
            <StepMark state={state(s)} />
            <span>{text(s)}</span>
            <span className="sr-only">{t(s.done ? 'mt.stepIsDone' : 'mt.stepIsOpen')}</span>
          </li>
        ))}
      </ul>
      {onAddBooking && (
        <Button variant="quiet" size="sm" iconStart={<UploadIcon size={16} />} onClick={onAddBooking}>{t('mt.addBooking')}</Button>
      )}
    </section>
  );
}

/**
 * The next trip (G12, Phase C, the approved reference): the photo inside the
 * content with no words on it, the title row with the flags, the share icon
 * and the menu; the countdown beside the umber mark plate (a tap opens
 * Prijzen tonen); who is going; Ready for the trip as four step tiles; at
 * most one price nudge; Plan the days, the next missing step and Open trip;
 * then "Na deze reis", collapsed. Edit, share and delete stay in the menu.
 */
export function NextTripCard({
  id = '', title, sub, img, iso2, countries = [], countdown = null, when, dates, nights, figure,
  people = [], crewLine = '', party = null, readiness = null, nudge = null,
  onOpen, onPlanDays, nextStep = null, coplanBy = '', menuActions = [], onRemove, removeLabel, onAddBooking = null,
  plateValue = null, plateLabel = '', onUnit = null, onStep = null, onImage = null, onShare = null,
  onEurope = null, countryLabel = '', example = false, lineStops = [],
}) {
  const { t } = useI18n();
  const head = Math.max(party || 0, people.length + 1);
  return (
    <article className={`mt-next-card mt-trip${example ? ' is-example' : ''}`} aria-labelledby={`mt-next-${id}`}>
      <div className="mt-next-media" onClick={onOpen} aria-hidden="true">
        <HeroImage url={img} city={title} iso2={iso2} className="mt-next-img" maxWidth={960} ratio={[16, 9]}
          sizes="(min-width: 1100px) 540px, 100vw" eager />
      </div>
      {lineStops.length > 0 && (
        <JourneyLine
          variant="card"
          stops={lineStops}
          className="mt-next-line"
          label={lineStops.map((s) => `${s.city} ${t(s.nights === 1 ? 'saved.nights1' : 'saved.nightsN', { n: s.nights })}`).join(', ')}
        />
      )}
      <div className="mt-thead">
        <div className="mt-thead-t">
          <h3 className="mt-next-title" id={`mt-next-${id}`}>
            <span>{title}</span>
            {countries.length > 0 && <CountryFlagStack countries={countries} size={16} />}
          </h3>
          {(dates || nights > 0) && (
            <p className="mt-next-dates">
              {[dates, nights > 0 ? t(nights === 1 ? 'saved.nights1' : 'saved.nightsN', { n: nights }) : ''].filter(Boolean).join(', ')}
            </p>
          )}
          {sub && <p className="mt-next-sub">{sub}</p>}
        </div>
        {(onImage || onShare) && <ShareMenu onImage={onImage} onShare={onShare} />}
        {!example && <CardMenu actions={menuActions} onRemove={onRemove} removeLabel={removeLabel} />}
      </div>
      {coplanBy && <p className="mt-next-coplan"><PersonIcon size={14} /> {t('coplan.ownedBy', { who: coplanBy })}</p>}
      <div className="mt-duo">
        {countdown ? (
          <p className="mt-cd">
            <b>{countdown.n}</b>
            <span>{countdown.place
              ? t(countdown.n === 1 ? 'mt.cdDays1' : 'mt.cdDaysN', { place: countdown.place })
              : t(countdown.n === 1 ? 'saved.inDays1' : 'saved.inDaysN', { n: countdown.n })}</span>
          </p>
        ) : when ? <p className="mt-cd is-when"><span>{whenText(t, when)}</span></p> : null}
        {figure && plateValue != null ? (
          <MarkPlate value={plateValue} est={figure.est} label={plateLabel} onOpen={onUnit} />
        ) : (
          <p className="mt-next-money is-none">{t('saved.factNoPrice')}</p>
        )}
      </div>
      <p className="mt-going">
        {head > 1 && <Faces people={people} />}
        <span>{crewLine || (head > 1 ? t('saved.goingN', { n: head }) : t('saved.goingYou'))}</span>
      </p>
      <ReadyTiles readiness={readiness} onStep={onStep} />
      {onAddBooking && (
        <Button variant="quiet" size="sm" className="mt-add-booking" iconStart={<UploadIcon size={16} />} onClick={onAddBooking}>{t('mt.addBooking')}</Button>
      )}
      {nudge && (
        <p className="mt-nudge">
          <span className="mt-nudge-dot" aria-hidden="true" />
          <span>
            {nudge.plan
              ? t('mt2.nudgePlan', { city: nudge.city, pct: nudge.pct })
              : t('mt.nudgeBeds', { price: formatMoney(nudge.eur), date: nudge.since })}
          </span>
        </p>
      )}
      <div className="mt-next-actions">
        {onPlanDays && (
          <Button variant="primary" iconStart={<ListDayIcon size={18} />} onClick={onPlanDays}>{t('mt.planTheDays')}</Button>
        )}
        <div className="mt-acts-two">
          {nextStep && (
            <Button onClick={nextStep.onClick} aria-expanded={nextStep.expanded}>{nextStep.label}</Button>
          )}
          <Button variant={onPlanDays ? 'secondary' : 'primary'} onClick={onOpen}>{t('saved.openTrip')}</Button>
        </div>
      </div>
      {onEurope && <AfterTrip country={countryLabel} nights={nights} onEurope={onEurope} />}
    </article>
  );
}

/**
 * A later trip, a draft or a day plan: a ruled row on the ground (a 4:3
 * photo, 120 x 90 on a phone to 160 x 120 from 1100 px; name, when,
 * figure), the whole row one button, its menu beside it.
 * `onLift` tells the map which route to lift while the row is hovered or
 * focused.
 */
export function TripRow({
  id, title, img, iso2, meta, figure = null, onOpen, menuActions = [], onRemove, removeLabel, children, chip = null, onLift = null,
}) {
  const lift = onLift ? {
    onMouseEnter: () => onLift(id), onMouseLeave: () => onLift(''),
    onFocus: () => onLift(id), onBlur: () => onLift(''),
  } : {};
  return (
    <div className="mt-row-wrap" {...lift}>
      <Card
        layout="row"
        as="div"
        className="mt-row"
        media={<HeroImage url={img} city={title} iso2={iso2} className="mt-row-img" maxWidth={330} ratio={[4, 3]} sizes="(min-width: 1100px) 160px, (min-width: 820px) 144px, 120px" />}
        title={title}
        onOpen={onOpen}
        meta={meta}
        price={figure || chip}
        actions={(menuActions.length || onRemove)
          ? <CardMenu actions={menuActions} onRemove={onRemove} removeLabel={removeLabel} />
          : <ChevronRightIcon size={18} className="mt-row-go" aria-hidden="true" />}
      />
      {children}
    </div>
  );
}
