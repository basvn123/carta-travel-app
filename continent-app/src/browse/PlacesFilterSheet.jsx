import React from 'react';
import { createPortal } from 'react-dom';
import { Dropdown } from '../components/Dropdown.jsx';
import { CloseIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useAnchoredSheet } from './sheetAnchor.js';
import { durationMs } from '../lib/motion.js';
import { Button, Chip, IconButton } from '../components/ui/index.js';

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
 * The shell (portal, focus trap, swipe to dismiss) uses the shared .fsheet
 * class names, so every filter sheet is one surface with different contents.
 */
export function PlacesFilterSheet({
  onClose: closeNow,
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

  // The sheet leaves the way it came, faster (T394, DIRECTION.md 2.3: a
  // surface arrives in --dur-3 and leaves in --dur-2). The parent unmounts
  // it only once the exit has run; durationMs() is 0 under reduced motion,
  // so then it goes at once. Every door out (the cross, the scrim, Escape,
  // the apply button, a swipe) comes through here.
  // The parent's callback is read through a ref so this one stays stable:
  // the parent passes a fresh arrow on every render, and the focus trap
  // below re-ran on each of them, sending focus back to the cross after
  // every chip toggle.
  const [closing, setClosing] = React.useState(false);
  const closeTimer = React.useRef(0);
  const closeNowRef = React.useRef(closeNow);
  closeNowRef.current = closeNow;
  const onClose = React.useCallback(() => {
    if (closeTimer.current) return;
    const ms = durationMs('--dur-2');
    if (!ms) { closeNowRef.current(); return; }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => { closeTimer.current = 0; closeNowRef.current(); }, ms);
  }, []);
  React.useEffect(() => () => window.clearTimeout(closeTimer.current), []);

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


  return createPortal(
    <div
      className={`fsheet-scrim${anchor ? ' is-anchored' : ''}${closing ? ' is-closing' : ''}`}
      ref={sheetRef}
      onMouseDown={(e) => { if (e.target === sheetRef.current) onClose(); }}
    >
      <div
        className={`fsheet fsheet-explore fsheet-places${anchor ? ' is-anchored' : ''}${closing ? ' is-closing' : ''}`}
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
            <IconButton
              className="fsheet-close"
              onClick={onClose}
              ref={closeRef}
              label={t('filter.closeSheet')}
            >
              <CloseIcon size={16} />
            </IconButton>
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
                        // T428: the kit filter chip; no figure on it, the
                        // list behind the sheet is the answer.
                        <Chip
                          key={o.key}
                          kind="filter"
                          className="fchip"
                          selected={!!o.on}
                          disabled={o.disabled}
                          onClick={() => g.onToggle(o.key)}
                        >
                          {o.label}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {extra}
        </div>

        {/* The one line the apply button cannot say on its own (T367): why
            the count is zero and what to do about it. */}
        {resultCount === 0 && (
          <p className="fsheet-none" role="status">{t('filter.noneLine')}</p>
        )}
        <div className={`fsheet-foot ${resultCount === 0 ? 'is-empty' : ''}`}>
          {/* T440: kit buttons, and no count on the apply button (owner,
              2026-10-13: no catalogue counts as page furniture). An empty
              result still says so in words. */}
          <Button variant="secondary" className="fsheet-clear" onClick={resetAll}
            disabled={activeFilters === 0}>
            {t('filter.clearAll')}
          </Button>
          <Button variant="primary" className={`fsheet-apply${resultCount === 0 ? ' is-empty' : ''}`} onClick={onClose}>
            {resultCount === 0 ? t('filter.showNone') : t('filter.showPlaces')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
