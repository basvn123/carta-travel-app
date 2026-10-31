import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Card } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlagStack } from '../../components/CountryFlag.jsx';
import { CheckIcon, ChevronRightIcon, PersonIcon, ListDayIcon, UploadIcon } from '../../components/Icons.jsx';
import { formatMoney } from '../../lib/money.js';
import { CardMenu, TripPrice, Faces, whenText } from './parts.jsx';

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
 * The next trip, the page's focal card (T923): the photo with the countdown
 * in a solid pill, the title, the dates and nights, who is going, Ready for
 * the trip, the price a person a day and for the party, at most one price
 * nudge, then Plan the days (the one primary), the next missing step and
 * Open trip. Edit, share and delete live in the menu.
 */
export function NextTripCard({
  id = '', title, sub, img, iso2, countries = [], countdown = null, when, dates, nights, figure,
  people = [], crewLine = '', party = null, readiness = null, nudge = null,
  onOpen, onPlanDays, nextStep = null, coplanBy = '', menuActions = [], onRemove, removeLabel, onAddBooking = null,
}) {
  const { t } = useI18n();
  const head = Math.max(party || 0, people.length + 1);
  return (
    <article className="mt-next-card" aria-labelledby={`mt-next-${id}`}>
      <div className="mt-next-media" onClick={onOpen} aria-hidden="true">
        <HeroImage url={img} city={title} iso2={iso2} className="mt-next-img" maxWidth={960} ratio={[3, 2]}
          sizes="(min-width: 1024px) 520px, 100vw" eager />
        {(countdown || when) && (
          <span className="mt-photo-pill">
            {countdown
              ? (countdown.place
                ? t(countdown.n === 1 ? 'mt.countdown1' : 'mt.countdownN', { n: countdown.n, place: countdown.place })
                : t(countdown.n === 1 ? 'saved.inDays1' : 'saved.inDaysN', { n: countdown.n }))
              : whenText(t, when)}
          </span>
        )}
      </div>
      <div className="mt-next-body">
        <div className="mt-next-top">
          <div className="mt-next-heading">
            <h3 className="mt-next-title" id={`mt-next-${id}`}>{title}</h3>
            {(dates || nights > 0) && (
              <p className="mt-next-dates">
                {[dates, nights > 0 ? t(nights === 1 ? 'saved.nights1' : 'saved.nightsN', { n: nights }) : ''].filter(Boolean).join(', ')}
              </p>
            )}
            {sub && <p className="mt-next-sub">{sub}</p>}
          </div>
          {countries.length > 0 && <CountryFlagStack countries={countries} size={16} />}
          <CardMenu actions={menuActions} onRemove={onRemove} removeLabel={removeLabel} />
        </div>
        {coplanBy && <p className="mt-next-coplan"><PersonIcon size={14} /> {t('coplan.ownedBy', { who: coplanBy })}</p>}
        <p className="mt-going">
          {head > 1 && <Faces people={people} />}
          <span>{crewLine || (head > 1 ? t('saved.goingN', { n: head }) : t('saved.goingYou'))}</span>
        </p>
        <Readiness readiness={readiness} onAddBooking={onAddBooking} />
        {figure ? (
          <p className="mt-next-money">
            <TripPrice figure={figure} className="mt-next-fig" />
            {figure.total > 0 && head > 1 && (
              <span className="mt-next-party">{t('mt.forParty', { price: formatMoney(figure.total), n: figure.party || head })}</span>
            )}
          </p>
        ) : (
          <p className="mt-next-money is-none">{t('saved.factNoPrice')}</p>
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
          {nextStep && (
            <Button onClick={nextStep.onClick} aria-expanded={nextStep.expanded}>{nextStep.label}</Button>
          )}
          <Button variant={onPlanDays ? 'secondary' : 'primary'} onClick={onOpen}>{t('saved.openTrip')}</Button>
        </div>
      </div>
    </article>
  );
}

/**
 * A later trip, a draft or a day plan: the kit's compact row (72 px photo,
 * name, when, price), the whole row one button, its menu beside it.
 */
export function TripRow({
  title, img, iso2, meta, figure = null, onOpen, menuActions = [], onRemove, removeLabel, children, chip = null,
}) {
  return (
    <div className="mt-row-wrap">
      <Card
        layout="row"
        as="div"
        className="mt-row"
        media={<HeroImage url={img} city={title} iso2={iso2} className="mt-row-img" maxWidth={330} ratio={[1, 1]} sizes="72px" />}
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
