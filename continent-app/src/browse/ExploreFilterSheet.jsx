import React from 'react';
import { createPortal } from 'react-dom';
import { Dropdown } from '../components/Dropdown.jsx';
import { GemIcon } from '../components/GemRating.jsx';
import { CloseIcon } from '../components/Icons.jsx';
import { count } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import { DualRange } from '../components/FilterControls.jsx';
import { useAnchoredSheet } from './sheetAnchor.js';
import { RATING_MIN, RATING_MAX } from '../lib/rating.js';

const REACH_STEPS = [3, 5, 8, 12];

/**
 * The Explore filters, one surface for every screen width: the modal bottom
 * sheet the phone always had, now also what the desktop button opens (as the
 * user model asks: one set of filters, one place, no tray).
 *
 * What is deliberately NOT here any more: dates, nights, party size,
 * baggage, travel mode, stay tier, price mode and the price window. The
 * Explore page stepped away from all-in pricing, so the filters that only
 * existed to feed the pricing engine went with it. What narrows the grid
 * now is where, how good, how big and how far.
 */

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

export function ExploreFilterSheet({
  onClose,
  anchorRef,
  countryFilter, setCountryFilter, availableCountries,
  ratingRange, setRatingRange,
  gemOnly, setGemOnly,
  unescoOnly, setUnescoOnly,
  topBeachOnly, setTopBeachOnly,
  bigOnly, setBigOnly,
  topPick, setTopPick,
  reachHours, setReachHours, reachAvailable,
  activeFilters, resetAll,
  resultCount,
}) {
  const { t } = useI18n();
  const sheetRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const closeRef = React.useRef(null);
  // On a pointer screen this hangs off the Filters button instead of rising
  // from the bottom edge behind a dimmed page. See sheetAnchor.js.
  const anchor = useAnchoredSheet(anchorRef);
  const [rLo, rHi] = ratingRange;
  const ratingNarrowed = !(rLo === RATING_MIN && rHi === RATING_MAX);

  // Focus trap + Escape, same contract as the old phone sheet.
  React.useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
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

  // Swipe-down dismiss on touch, from the grab handle.
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

  const topPickValue = topPick ? String(topPick.n) : 'all';
  const onTopPick = (v) => {
    setTopPick(v === 'all' ? null : { by: 'beauty', n: parseInt(v, 10) });
  };

  const countHalves = (resultCount === 1 ? t('filter.showOne') : t('filter.showN')).split('{n}');

  return createPortal(
    <div
      className={`fsheet-scrim${anchor ? ' is-anchored' : ''}`}
      ref={sheetRef}
      onMouseDown={(e) => { if (e.target === sheetRef.current) onClose(); }}
    >
      <div
        className={`fsheet fsheet-explore${anchor ? ' is-anchored' : ''}`}
        ref={panelRef}
        style={anchor || undefined}
        role="dialog"
        /* Still aria-modal even when it looks like a menu: focus is trapped
           inside it and the invisible scrim swallows every click behind it,
           so the page really is inert. Saying otherwise would promise a
           screen reader an exit that is not there. */
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
          {/* ── Where, and how far away it may be. ── */}
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

            <Field label={t('explore.placeSize')} wide>
              <ChoiceChips
                ariaLabel={t('explore.placeSize')}
                value={bigOnly ? 'big' : 'all'}
                onChange={(v) => setBigOnly(v === 'big')}
                narrowFrom="all"
                columns={2}
                options={[
                  { value: 'all', label: t('explore.sizeAll') },
                  { value: 'big', label: t('explore.sizeBig'), title: t('explore.sizeBigTitle') },
                ]}
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

          {/* ── How good it has to be. ── */}
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

            <Field label={t('filter.topPicks')} wide>
              <ChoiceChips
                ariaLabel={t('filter.topPicks')}
                value={topPickValue}
                onChange={onTopPick}
                narrowFrom="all"
                options={[
                  { value: 'all', label: t('filter.all') },
                  { value: '10', label: t('filter.bestRatedN', { n: 10 }) },
                  { value: '25', label: t('filter.bestRatedN', { n: 25 }) },
                ]}
              />
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
        </div>

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
              <span className="fsheet-apply-main">
                {countHalves[0]}
                <span className="fsheet-apply-count">{count(resultCount)}</span>
                {countHalves[1]}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
