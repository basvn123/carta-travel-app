import React, {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState,
} from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSettledFigure } from '../lib/figureChange.js';
import { OriginPicker } from './OriginPicker.jsx';
import { DateField } from './DateField.jsx';
import { Stepper } from './FilterControls.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from '../browse/LifestylePanel.jsx';
import { Button, Segmented } from './ui/index.js';
import { SheetShell } from '../browse/SheetShell.jsx';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { BedIcon, ChevronDownIcon } from './Icons.jsx';

/**
 * The settings line (T381; carta-design "Settings line", DIRECTION.md rule
 * shell R2): one compact row on every priced view that shows every input its
 * prices depend on, each part a button that opens the control that sets it.
 *
 *   origin    the departure airport (OriginPicker, settings face)
 *   dates     always real dates, labelled "Suggested dates" while Carta's
 *             pair stands (a popover with the calendar and a Nights stepper)
 *   party     how many travel (a popover with the shared Stepper)
 *   lifestyle the bed and the habits (opens the one Lifestyle dialog)
 *
 * Language and "Prices in EUR" left the line for Account (T496, owner
 * T485-g): neither moves a price.
 *
 * On a phone (T496, roadmap 1.3a T1 and T2) the line is one sentence and the
 * bed: "Prices for 14 Nov to 21 Nov, 2 people" opens one sheet with From, the
 * dates, Nights, People and one Done; the bed opens the Lifestyle dialog.
 *
 * The values live in App, which fills SettingsContext once; this file only
 * reads and writes them, so any surface can mount a line (or read a value
 * through useSettings / useTravelMonth) without a prop chain.
 *
 * Props, the contract other surfaces build against (register row T380-e):
 *   parts     which parts to draw, in this fixed order; default all four
 *   children  a surface's own filters (a budget ceiling, a month, car-free),
 *             drawn after the parts in the same band, in secondary styling
 *   className extra class on the band
 * The shell's own line also carries an empty `#settings-line-slot` that a tab
 * may portal its filters into (the header search slot works the same way).
 *
 * No accent anywhere: labels --ui 13 px --ink-soft, values --ink, figures
 * --mono (styles in 60-v6-shell.css). On a phone the line never wraps:
 * container queries drop parts from the left (origin, then dates) and keep
 * Lifestyle, which moves the largest share of every figure.
 */

export const SettingsContext = createContext(null);

/** Every global input and its setter, or null outside the app shell. */
export function useSettings() {
  return useContext(SettingsContext);
}

/**
 * The traveller's month (1 to 12), read from their own departure date, or
 * null while the dates are the pair Carta picked: a month fact is shown only
 * when the traveller has a month (carta-design "Month").
 */
export function useTravelMonth() {
  return useContext(SettingsContext)?.travelMonth ?? null;
}

export const SETTINGS_PARTS = ['origin', 'dates', 'party', 'lifestyle'];
const MAX_NIGHTS = 30;
const MAX_PARTY = 12; // the party ceiling the old first-run receipt set

/**
 * A small non-modal popover under a part: Escape or a press outside closes
 * it and focus goes back to the part that opened it. It is fixed under the
 * top bar (top: var(--filter-h), 60-v6-shell.css) and lined up with its part
 * here, so the band itself can clip what does not fit on a phone without
 * clipping the popover.
 */
function SettingsPop({ id, label, anchorRef, onClose, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const a = anchorRef.current;
    if (!el || !a) return;
    const gutter = 16;
    const r = a.getBoundingClientRect();
    const left = Math.max(gutter, Math.min(r.left, window.innerWidth - el.offsetWidth - gutter));
    el.style.left = `${Math.round(left)}px`;
  }, [anchorRef]);
  // Focus moves in once, when the popover opens, never again on a re-render.
  useEffect(() => {
    ref.current?.querySelector('button:not([disabled]), input, [tabindex="0"]')?.focus();
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
      anchorRef.current?.focus();
    };
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
      onClose();
    };
    // Capture phase, so the app's own Escape handlers (which close the page
    // under the line) do not see the key that was meant for this popover.
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onDown);
    };
  }, [anchorRef, onClose]);
  return (
    <div className="settings-pop" id={id} role="dialog" aria-label={label} ref={ref}>
      {children}
    </div>
  );
}

/** One part: a label over (or before) its value, one button. */
function Part({
  name, label, value, display, mono, onClick, expanded, popId, partRef, hasPopup = 'dialog',
  // The phone face's two buttons draw their own content and name (T496).
  ariaLabel, className = '', children,
}) {
  const { t } = useI18n();
  // A value that changes settles in place (T391, DIRECTION.md 2.3): one dip
  // of its opacity, the box keeping its width; nothing moves that did not
  // change, and nothing at all under reduced motion.
  const valueRef = useRef(null);
  useSettledFigure(valueRef, value);
  return (
    <button
      type="button"
      ref={partRef}
      className={`settings-part settings-part-${name} ${className}`.trim()}
      onClick={onClick}
      aria-haspopup={hasPopup}
      aria-expanded={hasPopup === 'dialog' && (popId || children) ? !!expanded : undefined}
      aria-controls={expanded && popId ? popId : undefined}
      aria-label={ariaLabel || t('settings.changeAria', { label, value })}
    >
      {children || (
        <>
          <span className="settings-part-label" aria-hidden="true">{label}</span>
          <span ref={valueRef} className={`settings-part-value${mono ? ' is-mono' : ''}`} aria-hidden="true">{display ?? value}</span>
        </>
      )}
    </button>
  );
}

function useShortDate() {
  const { lang, languages } = useI18n();
  const bcp47 = languages.find((l) => l.code === lang)?.bcp47 || 'en-GB';
  return (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat(bcp47, { day: 'numeric', month: 'short', timeZone: 'UTC' })
      .format(new Date(Date.UTC(y, m - 1, d)));
  };
}

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function nightsBetween(a, b) {
  if (!a || !b) return 0;
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86400000));
}

/**
 * The date controls every face shares: which end the next pick sets, the
 * calendar, then the trip's length as a Nights stepper (T496, 1.3a: the
 * length is its own choice) and who picked the dates.
 */
function DatesControl({ s, pickEnd, setPickEnd, pickDate, shortDate, onUseCarta }) {
  const { t } = useI18n();
  const nights = nightsBetween(s.departDate, s.returnDate);
  const setNights = (n) => {
    if (!s.departDate) return;
    s.setReturnDate(addDaysISO(s.departDate, Math.max(1, Math.min(MAX_NIGHTS, n))));
  };
  return (
    <>
      {/* One calendar for both ends: the kit Segmented above it says which
          end the next pick sets (the lifted thumb, T426), and a pick of the
          leaving day keeps the trip's length. */}
      <Segmented
        block
        className="settings-ends"
        label={t('settings.dates')}
        value={pickEnd}
        onChange={setPickEnd}
        options={['start', 'end'].map((end) => ({
          value: end,
          label: (
            <span className="settings-end-text">
              <span className="settings-end-label">{t(end === 'start' ? 'settings.leave' : 'settings.return')}</span>
              <span className="is-mono">{shortDate(end === 'start' ? s.departDate : s.returnDate)}</span>
            </span>
          ),
        }))}
      />
      <DateField
        inline
        value={pickEnd === 'start' ? s.departDate : s.returnDate}
        rangeStart={s.departDate}
        rangeEnd={s.returnDate}
        min={pickEnd === 'end' ? (s.departDate || s.dateBounds?.min) : s.dateBounds?.min}
        max={s.dateBounds?.max}
        onChange={pickDate}
      />
      <div className="settings-row">
        <span className="settings-row-label">{t('settings.nightsLabel')}</span>
        <Stepper
          value={Math.max(1, nights)}
          min={1}
          max={MAX_NIGHTS}
          onChange={setNights}
          ariaLabel={t('settings.nightsAria', { n: nights })}
          decLabel={t('settings.nightsDec')}
          incLabel={t('settings.nightsInc')}
        />
      </div>
      {s.ownDates ? (
        s.defaultDates && (
          <Button variant="secondary" size="sm" className="settings-text-btn" onClick={onUseCarta}>
            {t('settings.useCartaDates')}
          </Button>
        )
      ) : (
        <p className="settings-note">{t('settings.cartaDates')}</p>
      )}
    </>
  );
}

export function SettingsLine({ parts = SETTINGS_PARTS, className = '', children, slot = false }) {
  const s = useSettings();
  const { t } = useI18n();
  const isDesktop = useIsDesktop();
  const shortDate = useShortDate();
  const [open, setOpen] = useState(null); // 'dates' | 'party' | 'sheet' | null
  const [pickEnd, setPickEnd] = useState('start');
  const baseId = useId();
  const datesRef = useRef(null);
  const partyRef = useRef(null);
  const summaryRef = useRef(null);
  // A pick on the leaving end moves the trip and keeps its length, then hands
  // the next pick to the return; a pick on the return end sets it, unless it
  // lands on or before the leaving day, which then moves instead.
  const pickDate = useCallback((iso) => {
    if (!s || !iso) return;
    const nights = Math.max(1, nightsBetween(s.departDate, s.returnDate));
    if (pickEnd === 'end' && s.departDate && iso > s.departDate) {
      s.setReturnDate(iso);
      return;
    }
    s.setDepartDate(iso);
    s.setReturnDate(addDaysISO(iso, nights));
    setPickEnd('end');
  }, [s, pickEnd]);
  const close = useCallback(() => setOpen(null), []);
  if (!s) return null;

  const show = (p) => parts.includes(p);
  const toggle = (p) => {
    if (p === 'dates' || p === 'sheet') setPickEnd('start');
    setOpen((v) => (v === p ? null : p));
  };

  const ownDates = !!s.ownDates;
  const nights = nightsBetween(s.departDate, s.returnDate);
  // Always the real dates (1.3a D1, 2.20): the label says who picked them,
  // so the assumption behind every figure is on screen.
  const range = s.departDate && s.returnDate
    ? t('settings.datesRange', { start: shortDate(s.departDate), end: shortDate(s.returnDate) })
    : '';
  const datesValue = range
    ? t(nights === 1 ? 'settings.datesNight' : 'settings.datesNights', { range, n: nights })
    : t('settings.pickDates');
  const datesLabel = ownDates ? t('settings.dates') : t('settings.datesSuggested');
  const party = Number.isFinite(s.party) ? s.party : 2;
  const people = t(party === 1 ? 'settings.peopleOne' : 'settings.peopleMany', { n: party });
  const profileKey = matchProfile(s.lifestyle || {});
  const bed = t(`stay.${s.stayTier || 'home'}`);
  const vibe = profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom');
  const resetToCartaDates = () => {
    if (!s.defaultDates) return;
    s.setDepartDate(s.defaultDates.start);
    s.setReturnDate(s.defaultDates.end);
  };
  const closeSheet = () => { close(); summaryRef.current?.focus(); };

  // The phone face (1.3a T1): one sentence for the dates and the party, one
  // button for the bed. The sentence opens the one settings sheet (T2); the
  // bed opens the Lifestyle dialog, since a sheet never holds a sheet.
  if (!isDesktop) {
    const summary = t('settings.summary', { dates: range || t('settings.pickDates'), people });
    return (
      <div className={`settings-line settings-line-phone ${className}`.trim()} role="group" aria-label={t('settings.label')}>
        {(show('dates') || show('party') || show('origin')) && (
          <Part
            name="summary"
            className="settings-summary"
            partRef={summaryRef}
            value={summary}
            expanded={open === 'sheet'}
            ariaLabel={t('settings.summaryAria', { summary })}
            onClick={() => toggle('sheet')}
          >
            <span className="settings-summary-text" aria-hidden="true">
              {/* "Prices for" is the first thing a narrow phone drops; it
                  only stands while the dates are Carta's suggestion. */}
              {!ownDates && <span className="settings-summary-pre">{`${t('settings.summaryPre')} `}</span>}
              {summary}
            </span>
            <ChevronDownIcon size={16} className="settings-summary-chev" />
          </Part>
        )}
        {show('lifestyle') && s.openLifestyle && (
          <Part
            name="bed"
            className="settings-bed"
            value={`${bed}, ${vibe}`}
            ariaLabel={t('settings.changeAria', { label: t('settings.lifestyle'), value: `${bed}, ${vibe}` })}
            onClick={s.openLifestyle}
          >
            <BedIcon size={16} className="settings-bed-icon" />
            <span className="settings-bed-text" aria-hidden="true">{bed}</span>
            <ChevronDownIcon size={16} className="settings-summary-chev" />
          </Part>
        )}
        {open === 'sheet' && (
          <SheetShell
            title={t('settings.label')}
            labelId={`${baseId}-sheet`}
            className="settings-sheet"
            closeLabel={t('a11y.close')}
            onClose={closeSheet}
          >
            {show('origin') && (
              <section className="settings-sheet-sec">
                <h3 className="settings-sheet-h">{t('settings.from')}</h3>
                <OriginPicker
                  data={s.data}
                  origin={s.origin}
                  onChangeOrigin={s.setOrigin}
                  fromLabel={t('settings.from')}
                />
              </section>
            )}
            {show('dates') && (
              <section className="settings-sheet-sec">
                <h3 className="settings-sheet-h">{datesLabel}</h3>
                <DatesControl
                  s={s}
                  pickEnd={pickEnd}
                  setPickEnd={setPickEnd}
                  pickDate={pickDate}
                  shortDate={shortDate}
                  onUseCarta={resetToCartaDates}
                />
              </section>
            )}
            {show('party') && (
              <section className="settings-sheet-sec settings-row">
                <h3 className="settings-sheet-h settings-row-label">{t('settings.party')}</h3>
                <Stepper
                  value={party}
                  min={1}
                  max={MAX_PARTY}
                  onChange={(n) => s.setParty(n)}
                  ariaLabel={t('settings.partyAria', { n: party })}
                  decLabel={t('settings.partyDec')}
                  incLabel={t('settings.partyInc')}
                />
              </section>
            )}
            {/* The sheet's one primary. Every change holds at once; Done
                only closes. */}
            <Button variant="primary" block className="settings-done" onClick={closeSheet}>
              {t('settings.done')}
            </Button>
          </SheetShell>
        )}
      </div>
    );
  }

  return (
    <div className={`settings-line ${className}`.trim()} role="group" aria-label={t('settings.label')}>
      <div className="settings-line-parts">
        {show('origin') && (
          <div className="settings-slot settings-slot-origin">
            <OriginPicker
              variant="settings"
              data={s.data}
              origin={s.origin}
              onChangeOrigin={s.setOrigin}
            />
          </div>
        )}

        {show('dates') && (
          <div className="settings-slot settings-slot-dates">
            <Part
              name="dates"
              label={datesLabel}
              value={datesValue}
              mono
              partRef={datesRef}
              popId={`${baseId}-dates`}
              expanded={open === 'dates'}
              onClick={() => toggle('dates')}
            />
            {open === 'dates' && (
              <SettingsPop id={`${baseId}-dates`} label={datesLabel} anchorRef={datesRef} onClose={close}>
                <DatesControl
                  s={s}
                  pickEnd={pickEnd}
                  setPickEnd={setPickEnd}
                  pickDate={pickDate}
                  shortDate={shortDate}
                  onUseCarta={() => { resetToCartaDates(); close(); datesRef.current?.focus(); }}
                />
              </SettingsPop>
            )}
          </div>
        )}

        {show('party') && (
          <div className="settings-slot settings-slot-party">
            <Part
              name="party"
              label={t('settings.party')}
              value={String(party)}
              mono
              partRef={partyRef}
              popId={`${baseId}-party`}
              expanded={open === 'party'}
              onClick={() => toggle('party')}
            />
            {open === 'party' && (
              <SettingsPop id={`${baseId}-party`} label={t('settings.party')} anchorRef={partyRef} onClose={close}>
                <Stepper
                  value={party}
                  min={1}
                  max={MAX_PARTY}
                  onChange={(n) => s.setParty(n)}
                  ariaLabel={t('settings.partyAria', { n: party })}
                  decLabel={t('settings.partyDec')}
                  incLabel={t('settings.partyInc')}
                />
              </SettingsPop>
            )}
          </div>
        )}

        {show('lifestyle') && s.openLifestyle && (
          <div className="settings-slot settings-slot-lifestyle">
            <Part
              name="lifestyle"
              label={t('settings.lifestyle')}
              value={`${bed}, ${vibe}`}
              display={(
                <>
                  <span>{bed}</span>
                  <span className="settings-vibe">{vibe}</span>
                </>
              )}
              onClick={s.openLifestyle}
            />
          </div>
        )}
      </div>
      {(children || slot) && (
        <div className="settings-line-extra" id={slot ? 'settings-line-slot' : undefined}>
          {children}
        </div>
      )}
    </div>
  );
}
