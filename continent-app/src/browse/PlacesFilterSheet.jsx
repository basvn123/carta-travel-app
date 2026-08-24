import React from 'react';
import { createPortal } from 'react-dom';
import { Dropdown } from '../components/Dropdown.jsx';
import { CloseIcon } from '../components/Icons.jsx';
import { count } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import { useAnchoredSheet } from './sheetAnchor.js';

/**
 * The Destinations filters, in the shape Explore already uses: one modal
 * sheet on every width, opened by the one Filters button in the toolbar.
 *
 * What it holds is decided by the tab, not by this file. DestinationsTab
 * builds a list of groups
 *
 *   { key, label, options: [{ key, label, n, on, disabled }], onToggle }
 *
 * and this renders them, which is what lets the same description drive both
 * the quick chip row under the toolbar and the full set in here. A filter
 * that exists in one place and not the other is the bug this shape prevents.
 *
 * The country picker is the one control every tab shares. It used to exist on
 * three tabs out of six, and on the other three the only way to reach a
 * country was to type its name into the search field and hope the match
 * landed, which is not a filter, it is a trick you have to know.
 *
 * The shell (portal, focus trap, swipe to dismiss) is deliberately the same
 * as ExploreFilterSheet's, down to the class names, so the two sheets are one
 * surface with two contents.
 */
export function PlacesFilterSheet({
  onClose,
  anchorRef,
  groups = [],
  country, setCountry, countryOptions = [],
  extra = null,
  activeFilters = 0,
  resetAll,
  resultCount = 0,
}) {
  const { t } = useI18n();
  const sheetRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const closeRef = React.useRef(null);
  // Hangs off the Filters button on a pointer screen, stays a bottom sheet on
  // a phone. See sheetAnchor.js.
  const anchor = useAnchoredSheet(anchorRef);

  // Focus trap + Escape, the same contract the Explore sheet keeps.
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

  const countHalves = (resultCount === 1 ? t('filter.showOne') : t('filter.showN')).split('{n}');

  return createPortal(
    <div
      className={`fsheet-scrim${anchor ? ' is-anchored' : ''}`}
      ref={sheetRef}
      onMouseDown={(e) => { if (e.target === sheetRef.current) onClose(); }}
    >
      <div
        className={`fsheet fsheet-explore fsheet-places${anchor ? ' is-anchored' : ''}`}
        ref={panelRef}
        style={anchor || undefined}
        role="dialog"
        /* Still aria-modal even when it looks like a menu: focus is trapped
           inside it and the invisible scrim swallows every click behind it,
           so the page really is inert. Saying otherwise would promise a
           screen reader an exit that is not there. */
        aria-modal="true"
        aria-labelledby="pfsheet-title"
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
            <h2 className="fsheet-title" id="pfsheet-title">{t('filter.filters')}</h2>
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
          {countryOptions.length > 0 && (
            <section className="fsheet-section">
              <h3 className="fsheet-caption">{t('filter.groupWhere')}</h3>
              <div className="fsheet-fields">
                <div className="fsheet-field is-wide">
                  <span className="fsheet-label">{t('filter.country')}</span>
                  <Dropdown
                    value={country || ''}
                    onChange={(v) => setCountry(v)}
                    options={[
                      { value: '', label: t('places.allCountries') },
                      ...countryOptions.map(([cc, name]) => ({ value: cc, label: name })),
                    ]}
                    placeholder={t('places.allCountries')}
                    searchPlaceholder={t('filter.searchCountry')}
                  />
                </div>
              </div>
            </section>
          )}

          {groups.length > 0 && (
            <section className="fsheet-section">
              <h3 className="fsheet-caption">{t('places.filterGroup')}</h3>
              <div className="fsheet-fields">
                {groups.map((g) => (
                  <div className="fsheet-field is-wide" key={g.key}>
                    <span className="fsheet-label">{g.label}</span>
                    <div className="fchips" role="group" aria-label={g.label}>
                      {g.options.map((o) => (
                        <button
                          key={o.key}
                          type="button"
                          className={`fchip ${o.on ? 'on narrow' : ''}`}
                          aria-pressed={o.on}
                          disabled={o.disabled}
                          onClick={() => g.onToggle(o.key)}
                        >
                          {o.Icon && <o.Icon size={13} />}
                          <span>{o.label}</span>
                          {o.n != null && <span className="fchip-n">{count(o.n)}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {extra}
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
