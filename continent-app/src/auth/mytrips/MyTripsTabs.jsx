import React, { useMemo } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, Tabs } from '../../components/ui/index.js';
import { CountryFlag, COUNTRY_ISO2 } from '../../components/CountryFlag.jsx';
import { LoadingBlock, ErrorBlock } from '../../components/StateBlocks.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { PlusIcon, UploadIcon, ChevronRightIcon } from '../../components/Icons.jsx';
import { countryName } from '../../lib/countryName.js';
import { tabHref } from '../../lib/urlState.js';
import { NextTripCard, TripRow } from './TripCards.jsx';
import { FaceStack } from '../FriendFaces.jsx';

/** A plain click stays in the app; a modified click opens the address. */
export function door(go) {
  return (e) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go();
  };
}

/** A section of one tab: a heading with an optional count and action. */
export function Section({ title, count, action, children, id, className = '' }) {
  return (
    <section className={`mt-section ${className}`.trim()} aria-labelledby={id}>
      <div className="mt-section-head">
        <h3 className="mt-section-title" id={id}>{title}</h3>
        {count > 0 && <Chip kind="count">{count}</Chip>}
        {action && <span className="mt-section-action">{action}</span>}
      </div>
      {children}
    </section>
  );
}

/** An empty tab: the space named, one way forward, no apology. */
export function Empty({ title, line, action }) {
  return (
    <div className="mt-empty">
      <p className="mt-empty-title">{title}</p>
      {line && <p className="mt-empty-line">{line}</p>}
      {action && <div className="mt-empty-actions">{action}</div>}
    </div>
  );
}

export const MT_TABS = ['trips', 'saved', 'europe'];

/**
 * The page head (T923): "My trips", Add a booking and New trip from 700 px,
 * then the three underline tabs with their counts, sticky under the app
 * header, in the style of Explore's category tabs.
 */
export function MyTripsHead({ tab, onTab, counts = {}, onAddBooking, onNewTrip }) {
  const { t } = useI18n();
  const tabs = [
    { id: 'trips', label: t('mt.tabTrips'), count: counts.trips || null },
    { id: 'saved', label: t('mt.tabSaved'), count: counts.saved || null },
    { id: 'europe', label: t('mt.tabEurope'), count: counts.europe || null },
  ];
  return (
    <>
      <div className="mt-head">
        <h1 className="mt-title">{t('saved.title')}</h1>
        <div className="mt-head-acts">
          {onAddBooking && (
            <Button size="sm" iconStart={<UploadIcon size={16} />} onClick={onAddBooking}>{t('mt.addBooking')}</Button>
          )}
          {onNewTrip && (
            <Button size="sm" iconStart={<PlusIcon size={16} />} onClick={onNewTrip}>{t('mt.newTrip')}</Button>
          )}
        </div>
      </div>
      <div className="mt-tabs">
        <Tabs label={t('saved.title')} tabs={tabs} value={tab} onChange={onTab} panelId="mytrips-panel" className="mt-tabs-row" />
      </div>
    </>
  );
}

/* ───────────────────────── Trips ───────────────────────── */

/**
 * Trips (T923): Today while a trip runs (T924), else the next trip as the
 * focal card; then Coming up and Being planned (drafts, with All in Plan),
 * day plans that belong to no trip, and friends' shared trips as one line.
 */
export function TripsTab({
  authed, configured, loading, error, onRetry, today = null, next, coming = [], planning = [], dayPlans = [],
  friendsShared, friendFaces = [], onOpenFriends, onPlanTrip, onAllInPlan, onSignIn, signInLine = true,
}) {
  const { t } = useI18n();
  const nothing = !today && !next && !coming.length && !planning.length && !dayPlans.length;
  return (
    <>
      {loading && authed ? (
        <LoadingBlock label={t('saved.loading')} rows={2} shape="card" />
      ) : error ? (
        <ErrorBlock message={t('state.savedFailed')} onRetry={onRetry} retryLabel={t('layer.retry')} />
      ) : nothing ? (
        <Empty
          title={t('saved.noTripsYet')}
          line={t('mt.emptyTripsLine')}
          action={<Button variant="primary" onClick={onPlanTrip}>{t('saved.planTrip')}</Button>}
        />
      ) : (
        <>
          {today}
          {next && (
            <div className="mt-next">
              <NextTripCard {...next} />
              {next.below}
            </div>
          )}
          {(coming.length > 0 || planning.length > 0) && (
            <div className="mt-two">
              {coming.length > 0 && (
                <Section id="mt-coming" title={t('mt.comingUp')}>
                  <div className="mt-rows">
                    {coming.map((r) => <TripRow key={r.id} {...r}>{r.below}</TripRow>)}
                  </div>
                </Section>
              )}
              {planning.length > 0 && (
                <Section
                  id="mt-planning"
                  title={t('mt.beingPlanned')}
                  action={(
                    <a className="mt-link" href={tabHref('planstart')} onClick={door(onAllInPlan)}>
                      {t('mt.allInPlan')}<ChevronRightIcon size={16} />
                    </a>
                  )}
                >
                  <div className="mt-rows">
                    {planning.map((r) => <TripRow key={r.id} {...r}>{r.below}</TripRow>)}
                  </div>
                </Section>
              )}
            </div>
          )}
          {dayPlans.length > 0 && (
            <Section id="mt-days" title={t('saved.dayPlans')} count={dayPlans.length}>
              <div className="mt-rows">
                {dayPlans.map((r) => <TripRow key={r.id} {...r} />)}
              </div>
            </Section>
          )}
          {!authed && configured && signInLine && (
            <p className="mt-signin-line">
              <Button variant="quiet" size="sm" onClick={onSignIn}>{t('saved.signIn')}</Button>
            </p>
          )}
        </>
      )}
      {/* T466: the friends line is the faces of the friends showing you a
          trip, then the count; the whole line opens Friends. */}
      {friendsShared > 0 && onOpenFriends && (
        <Button variant="secondary" block className="mt-friends-line" onClick={onOpenFriends}>
          <FaceStack people={friendFaces} />
          <span className="mt-friends-text">{t(friendsShared === 1 ? 'saved.friendsShared1' : 'saved.friendsSharedN', { n: friendsShared })}</span>
          <span className="mt-friends-open">{t('saved.friendsOpen')}<ChevronRightIcon size={16} /></span>
        </Button>
      )}
    </>
  );
}

/**
 * Every country in the catalogue as a chip; the ones a finished trip already
 * put on the record are ticked and fixed, the rest toggle the hand-marked list
 * (Polarsteps' scratch map). Changes save as they are made.
 */
export function VisitedCountriesSheet({ fromTrips, manual, onToggle, onClose }) {
  const { t } = useI18n();
  const all = useMemo(() => Object.keys(COUNTRY_ISO2)
    .map((c) => ({ c, label: countryName(COUNTRY_ISO2[c], c) }))
    .sort((a, b) => a.label.localeCompare(b.label)), []);
  return (
    <SheetShell title={t('saved.countriesSheetTitle')} onClose={onClose} labelId="mt-countries-title" width={560}>
      <div className="mt-country-grid" role="group" aria-labelledby="mt-countries-title">
        {all.map(({ c, label }) => {
          const viaTrip = fromTrips.has(c);
          const on = viaTrip || manual.includes(c);
          return (
            <Chip
              key={c}
              kind="filter"
              selected={on}
              disabled={viaTrip}
              icon={<CountryFlag country={c} size={14} />}
              onClick={() => onToggle(c)}
              aria-describedby={viaTrip ? 'mt-via-trip' : undefined}
            >
              {label}
            </Chip>
          );
        })}
      </div>
      <p className="mt-sheet-note" id="mt-via-trip">{t('saved.countryViaTrip')}</p>
      <div className="mt-sheet-foot">
        <Button variant="primary" onClick={onClose}>{t('saved.done')}</Button>
      </div>
    </SheetShell>
  );
}
