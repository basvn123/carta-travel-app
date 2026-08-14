import React from 'react';
import { createPortal } from 'react-dom';
import { TRIP_KINDS } from '../lib/trip_kinds.js';
import { Dropdown } from '../components/Dropdown.jsx';
import { GemIcon } from '../components/GemRating.jsx';
import { PlaneIcon, CarIcon } from '../components/TransportIcons.jsx';
import { LifestyleIcon, CloseIcon } from '../components/Icons.jsx';
import { eur, count } from '../lib/format.js';
import { offeredStayTiers } from '../lib/runtime_pricing.js';
import { useI18n } from '../i18n/index.jsx';
import { Stepper, DualRange } from '../components/FilterControls.jsx';
import { RATING_MIN, RATING_MAX } from '../lib/rating.js';

// How many trip-style chips are shown before "show all". Six covers the kinds
// people actually reach for; the rest stay one tap away instead of adding a
// row and a half of scroll to a sheet nobody wanted to scroll.
const STYLE_PREVIEW = 6;
const REACH_STEPS = [3, 5, 8, 12];

/* ── Small building blocks, all on the 8pt scale ───────────────────────────
   A section is a caption plus a stack of fields; a field is a label tied to
   its control by 8px and separated from the next by 16px, so proximity says
   what belongs together (the old sheet spaced both the same and read as one
   undifferentiated list). */

function Section({ title, children }) {
  return (
    <section className="fsheet-section">
      <h3 className="fsheet-caption">{title}</h3>
      <div className="fsheet-fields">{children}</div>
    </section>
  );
}

function Field({ label, children, wide, className = '' }) {
  return (
    <div className={`fsheet-field ${wide ? 'is-wide' : ''} ${className}`}>
      {label && <span className="fsheet-label">{label}</span>}
      {children}
    </div>
  );
}

// Label on the left, control on the right, one line. For the steppers, where
// stacking the label above a 44px control wastes a whole row per count.
function InlineField({ label, hint, children }) {
  return (
    <div className="fsheet-inline">
      <span className="fsheet-inline-text">
        <span className="fsheet-label">{label}</span>
        {hint && <span className="fsheet-hint">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

// A single-choice chip set: every option stays visible, one tap switches.
// Radio semantics rather than a listbox, because that is what it is.
// `narrowFrom` names the option that filters nothing out (Any, All): picking
// anything else is hiding destinations from the map, so that chip fills with
// the accent instead of ink.
function ChoiceChips({ value, onChange, options, ariaLabel, columns, narrowFrom }) {
  return (
    <div
      className={`fchips ${columns ? `cols-${columns}` : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={`fchip ${on ? 'on' : ''} ${on && narrowFrom != null && o.value !== narrowFrom ? 'narrow' : ''}`}
            onClick={() => onChange(o.value)}
            title={o.title}
          >
            {o.icon}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The phone filter surface: a modal bottom sheet over a scrim, with a fixed
 * header, a scrolling body and a sticky action bar carrying the live result
 * count. It replaces the old inline drawer, which grew the header, scrolled
 * for a screen and a half, and left the bottom nav and the trip button
 * floating over its controls.
 */
export function FilterSheet({
  onClose,
  data, choices, setChoices,
  priceMode, setPriceMode,
  countryFilter, setCountryFilter, availableCountries,
  priceRange, setPriceRange, priceBounds, priceHistogram,
  tripKinds, setTripKinds,
  ratingRange, setRatingRange,
  gemOnly, setGemOnly,
  unescoOnly, setUnescoOnly,
  topBeachOnly, setTopBeachOnly,
  topPick, setTopPick,
  reachHours, setReachHours, reachAvailable,
  onOpenLifestyle,
  onNightsCommit,
  nights,
  activeFilters, resetAll,
  resultCount, cheapest,
  priceNarrowed, ratingNarrowed,
}) {
  const { t } = useI18n();
  const sheetRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const closeRef = React.useRef(null);
  const [styleExpanded, setStyleExpanded] = React.useState(false);

  const baggageOpts = data?.meta?.baggage_options || {};
  const stayTierOptions = React.useMemo(
    () => offeredStayTiers(data?.meta), [data?.meta]);
  const flying = (choices.transport_mode || 'plane') !== 'car';
  const [rLo, rHi] = ratingRange;

  // Focus moves into the sheet on open and back to whatever opened it on
  // close, and Tab cycles inside: without the trap, tabbing walks off into the
  // map behind the scrim, which is exactly what a modal must not allow.
  React.useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // An open country menu owns Escape first: this listener captures, so
        // without the guard one press would throw the whole sheet away.
        if (panelRef.current?.querySelector('.dropdown-menu')) return;
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = panelRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!items || items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [onClose]);

  // Swipe the grab handle (or the header) down to dismiss, the gesture the
  // handle promises. Under ~90px it springs back, so a scroll that starts on
  // the header does not throw the sheet away.
  const drag = React.useRef({ id: null, y0: 0, dy: 0 });
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse') return;
    drag.current = { id: e.pointerId, y0: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (drag.current.id !== e.pointerId) return;
    const dy = Math.max(0, e.clientY - drag.current.y0);
    drag.current.dy = dy;
    if (panelRef.current) {
      panelRef.current.style.transition = 'none';
      panelRef.current.style.transform = `translateY(${dy}px)`;
    }
  };
  const onPointerUp = (e) => {
    if (drag.current.id !== e.pointerId) return;
    const { dy } = drag.current;
    drag.current = { id: null, y0: 0, dy: 0 };
    if (panelRef.current) {
      panelRef.current.style.transition = '';
      panelRef.current.style.transform = '';
    }
    if (dy > 90) onClose();
  };

  const stayValue = choices.stay_tier || 'home';
  const topPickValue = topPick ? `${topPick.by}.${topPick.n}` : 'all';
  const onTopPick = (v) => {
    if (v === 'all') { setTopPick(null); return; }
    const [by, n] = v.split('.');
    setTopPick({ by, n: parseInt(n, 10) });
  };

  // "Show 855 places" split around its number, so the figure can be set in
  // mono without hardcoding English word order.
  const countHalves = (resultCount === 1 ? t('filter.showOne') : t('filter.showN')).split('{n}');

  const styleShown = styleExpanded
    ? TRIP_KINDS
    : TRIP_KINDS.filter((k, i) => i < STYLE_PREVIEW || tripKinds.includes(k.key));
  const styleHidden = TRIP_KINDS.length - styleShown.length;

  const toggleKind = (key) => setTripKinds(
    tripKinds.includes(key) ? tripKinds.filter((k) => k !== key) : [...tripKinds, key]);

  return createPortal(
    <div
      className="fsheet-scrim"
      ref={sheetRef}
      onMouseDown={(e) => { if (e.target === sheetRef.current) onClose(); }}
    >
      <div
        className="fsheet"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fsheet-title"
      >
        <div
          className="fsheet-head"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="fsheet-grab" aria-hidden="true" />
          <div className="fsheet-head-row">
            <h2 className="fsheet-title" id="fsheet-title">{t('filter.filters')}</h2>
            <button
              type="button"
              className="fsheet-close"
              onClick={onClose}
              ref={closeRef}
              aria-label={t('filter.closeSheet')}
            >
              <CloseIcon size={16} />
            </button>
          </div>
        </div>

        <div className="fsheet-body">
          {/* ── What the trip is: the handful of answers that define a price
                before anything is filtered out of the map. ── */}
          <Section title={t('filter.groupTrip')}>
            <Field label={t('filter.travelBy')} wide>
              <ChoiceChips
                ariaLabel={t('filter.travelBy')}
                value={choices.transport_mode || 'plane'}
                onChange={(v) => setChoices({ ...choices, transport_mode: v })}
                columns={2}
                options={[
                  { value: 'plane', label: t('filter.byPlane'), icon: <PlaneIcon />, title: t('filter.byPlaneTitle') },
                  { value: 'car', label: t('filter.byCar'), icon: <CarIcon />, title: t('filter.byCarTitle') },
                ]}
              />
            </Field>

            <InlineField label={t('filter.people')}>
              <Stepper
                value={choices.group_size}
                min={1}
                max={20}
                onChange={(v) => setChoices({ ...choices, group_size: v })}
                ariaLabel={t('filter.people')}
                decLabel={t('filter.fewerPeople')}
                incLabel={t('filter.morePeople')}
              />
            </InlineField>

            <InlineField label={t('filter.nights')} hint={t('filter.nightsHint')}>
              <Stepper
                value={nights}
                min={1}
                max={60}
                onChange={onNightsCommit}
                ariaLabel={t('filter.nights')}
                decLabel={t('filter.fewerNights')}
                incLabel={t('filter.moreNights')}
                title={t('filter.nightsTitle')}
              />
            </InlineField>

            {flying && (
              <Field label={t('filter.baggage')} wide>
                <ChoiceChips
                  ariaLabel={t('filter.baggage')}
                  value={choices.baggage_key}
                  onChange={(key) => {
                    const opt = baggageOpts[key];
                    setChoices({
                      ...choices,
                      baggage_key: key,
                      baggage_per_direction_eur: opt?.per_direction_eur || 0,
                    });
                  }}
                  options={Object.entries(baggageOpts).map(([k, v]) => ({ value: k, label: v.label }))}
                />
              </Field>
            )}
          </Section>

          {/* ── Budget: the spend window, what the price counts, and how the
                nights and the on-the-ground spend are modelled. ── */}
          <Section title={t('filter.groupBudget')}>
            <Field label={t('filter.show')} wide>
              <ChoiceChips
                ariaLabel={t('filter.show')}
                value={priceMode}
                onChange={setPriceMode}
                columns={2}
                options={[
                  { value: 'total', label: t('filter.total') },
                  { value: 'pp', label: t('filter.perPerson') },
                ]}
              />
            </Field>

            {priceBounds && priceRange && (
              <Field
                label={priceMode === 'pp' ? t('filter.pricePP') : t('filter.priceTotal')}
                wide
              >
                <div className="fsheet-band">
                  <DualRange
                    min={priceBounds[0]}
                    max={priceBounds[1]}
                    value={priceRange}
                    onChange={setPriceRange}
                    fmt={eur}
                    hist={priceHistogram}
                    ariaLabel={priceMode === 'pp' ? t('filter.pricePP') : t('filter.priceTotal')}
                    hideValueRow
                  />
                  <div className={`fsheet-readout ${priceNarrowed ? 'is-narrowed' : ''}`}>
                    {priceNarrowed ? (
                      <span className="fsheet-nums">
                        {eur(priceRange[0])}
                        <span className="fsheet-to">{t('filter.to')}</span>
                        {eur(priceRange[1])}
                      </span>
                    ) : (
                      <span>{t('filter.anyPrice')}</span>
                    )}
                  </div>
                </div>
              </Field>
            )}

            {stayTierOptions.length > 1 && (
              <Field label={t('filter.stay')} wide>
                <ChoiceChips
                  ariaLabel={t('filter.stay')}
                  value={stayValue}
                  onChange={(v) => setChoices({ ...choices, stay_tier: v })}
                  options={stayTierOptions.map((k) => ({ value: k, label: t(`stay.${k}`) }))}
                />
              </Field>
            )}

            <Field label={t('filter.topPicks')} wide>
              <ChoiceChips
                ariaLabel={t('filter.topPicks')}
                value={topPickValue}
                onChange={onTopPick}
                narrowFrom="all"
                options={[
                  { value: 'all', label: t('filter.all') },
                  { value: 'price.10', label: t('filter.cheapestN', { n: 10 }) },
                  { value: 'price.25', label: t('filter.cheapestN', { n: 25 }) },
                  { value: 'beauty.10', label: t('filter.bestRatedN', { n: 10 }) },
                  { value: 'beauty.25', label: t('filter.bestRatedN', { n: 25 }) },
                ]}
              />
            </Field>

            {onOpenLifestyle && (
              <button
                type="button"
                className="fsheet-link-btn"
                onClick={onOpenLifestyle}
                title={t('filter.setLifestyleTitle')}
              >
                <LifestyleIcon size={15} />
                <span>{t('filter.setLifestyle')}</span>
              </button>
            )}
          </Section>

          {/* ── Quality: the 0-10 traveller score plus the independent
                heritage / coast / hidden-gem switches. ── */}
          <Section title={t('filter.groupQuality')}>
            <Field label={t('filter.rating')} wide>
              <div className="fsheet-band">
                <DualRange
                  min={0}
                  max={RATING_MAX * 10}
                  value={[Math.round(rLo * 10), Math.round(rHi * 10)]}
                  onChange={([a, b]) => setRatingRange([a / 10, b / 10])}
                  fmt={(v) => (v / 10).toFixed(1)}
                  axis={[
                    { value: 0, label: '0' },
                    { value: RATING_MAX * 5, label: '5' },
                    { value: RATING_MAX * 10, label: '10' },
                  ]}
                  ariaLabel={t('filter.rating')}
                  hideValueRow
                />
                <div className={`fsheet-readout ${ratingNarrowed ? 'is-narrowed' : ''}`}>
                  {ratingNarrowed ? (
                    <span className="fsheet-nums">
                      {rLo.toFixed(1)}
                      <span className="fsheet-to">{t('filter.to')}</span>
                      {rHi.toFixed(1)}
                    </span>
                  ) : (
                    <span>{t('filter.anyRating')}</span>
                  )}
                </div>
              </div>
            </Field>

            <Field label={t('filter.highlights')} wide>
              <div className="fchips">
                <button
                  type="button"
                  className={`fchip ${gemOnly ? 'on narrow' : ''}`}
                  onClick={() => setGemOnly(!gemOnly)}
                  aria-pressed={gemOnly}
                  title={t('rating.gemsTitle')}
                >
                  <GemIcon filled size={10} />
                  <span>{t('rating.hiddenGemsOnly')}</span>
                </button>
                <button
                  type="button"
                  className={`fchip ${unescoOnly ? 'on narrow' : ''}`}
                  onClick={() => setUnescoOnly(!unescoOnly)}
                  aria-pressed={unescoOnly}
                  title={t('filter.unescoTitle')}
                >
                  <span>UNESCO</span>
                </button>
                <button
                  type="button"
                  className={`fchip ${topBeachOnly ? 'on narrow' : ''}`}
                  onClick={() => setTopBeachOnly(!topBeachOnly)}
                  aria-pressed={topBeachOnly}
                  title={t('filter.topBeachesTitle')}
                >
                  <span>{t('filter.topBeaches')}</span>
                </button>
              </div>
            </Field>
          </Section>

          {/* ── Where, and how far it may be from the airport. ── */}
          <Section title={t('filter.groupWhere')}>
            <Field label={t('filter.country')} wide>
              <Dropdown
                multiple
                value={countryFilter}
                onChange={setCountryFilter}
                options={availableCountries.map(([iso2, name]) => ({ value: iso2, label: name }))}
                placeholder={t('filter.allCountries', { n: availableCountries.length })}
                searchPlaceholder={t('filter.searchCountry')}
                multiLabel={(vals) => {
                  if (vals.length === 1) {
                    const hit = availableCountries.find(([iso2]) => iso2 === vals[0]);
                    return hit ? hit[1] : vals[0];
                  }
                  return t('filter.nCountries', { n: vals.length });
                }}
              />
            </Field>

            <Field label={t('filter.reach')} wide>
              {reachAvailable ? (
                <ChoiceChips
                  ariaLabel={t('filter.reach')}
                  value={reachHours == null ? 'any' : String(reachHours)}
                  onChange={(v) => setReachHours(v === 'any' ? null : parseInt(v, 10))}
                  narrowFrom="any"
                  options={[
                    { value: 'any', label: t('filter.reachAny'), title: t('filter.reachAnyTitle') },
                    ...REACH_STEPS.map((h) => ({
                      value: String(h),
                      label: t('filter.reachHours', { n: h }),
                      title: t('filter.reachHoursTitle', { n: h }),
                    })),
                  ]}
                />
              ) : (
                <p className="fsheet-note">{t('filter.reachNoData')}</p>
              )}
            </Field>

          </Section>

          {/* ── What kind of place it should be. Six styles show, the rest
                stay behind one tap rather than a row and a half of scroll. ── */}
          <Section title={t('filter.groupStyle')}>
            <Field label={t('filter.tripType')} wide>
              <div className="fchips" role="group" aria-label={t('filter.tripType')}>
                {styleShown.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    className={`fchip ${tripKinds.includes(k.key) ? 'on narrow' : ''}`}
                    onClick={() => toggleKind(k.key)}
                    aria-pressed={tripKinds.includes(k.key)}
                  >
                    <span>{t(`kind.${k.key}`)}</span>
                  </button>
                ))}
              </div>
              {(styleHidden > 0 || styleExpanded) && (
                <button
                  type="button"
                  className="fsheet-more"
                  onClick={() => setStyleExpanded((v) => !v)}
                  aria-expanded={styleExpanded}
                >
                  {styleExpanded ? t('filter.showFewer') : t('filter.showAllN', { n: TRIP_KINDS.length })}
                </button>
              )}
            </Field>
          </Section>
        </div>

        {/* ── Sticky action bar: the count is the answer to the whole sheet, so
              it rides the primary button and never scrolls out of the thumb
              zone. ── */}
        <div className={`fsheet-foot ${resultCount === 0 ? 'is-empty' : ''}`}>
          <button
            type="button"
            className="fsheet-clear"
            onClick={resetAll}
            disabled={activeFilters === 0}
          >
            {t('filter.clearAll')}
          </button>
          <button
            type="button"
            className={`fsheet-apply ${resultCount === 0 ? 'is-empty' : ''}`}
            onClick={onClose}
          >
            {resultCount === 0 ? (
              <span className="fsheet-apply-main">{t('filter.showNone')}</span>
            ) : (
              <>
                {/* The count is a measured fact, so it is set in mono inside
                    the sentence. Reading the template unsubstituted is what
                    lets every locale keep its own word order. */}
                <span className="fsheet-apply-main">
                  {countHalves[0]}
                  <span className="fsheet-apply-count">{count(resultCount)}</span>
                  {countHalves[1]}
                </span>
                {cheapest != null && (
                  <span className="fsheet-apply-sub">{t('filter.fromPrice', { p: eur(cheapest) })}</span>
                )}
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
