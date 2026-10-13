import React, {
  createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState,
} from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSettledFigure } from '../lib/figureChange.js';
import { OriginPicker } from './OriginPicker.jsx';
import { DateField } from './DateField.jsx';
import { Stepper } from './FilterControls.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from '../browse/LifestylePanel.jsx';
import { Button, Chip, Segmented } from './ui/index.js';

/**
 * The settings line (T381; carta-design "Settings line", DIRECTION.md rule
 * shell R2): one compact row on every priced view that shows every input its
 * prices depend on, each part a button that opens the control that sets it.
 *
 *   origin    the departure airport (OriginPicker, settings face)
 *   dates     the traveller's own dates, or "Any dates" while Carta's pair
 *             stands (a popover with the two DateFields)
 *   party     how many travel (a popover with the shared Stepper)
 *   lifestyle the bed and the habits (opens the one Lifestyle dialog)
 *   language  the six catalogues (a popover listing them)
 *   currency  "Prices in EUR", a fixed word: EUR is the only currency
 *
 * The values live in App, which fills SettingsContext once; this file only
 * reads and writes them, so any surface can mount a line (or read a value
 * through useSettings / useTravelMonth) without a prop chain.
 *
 * Props, the contract other surfaces build against (register row T380-e):
 *   parts     which parts to draw, in this fixed order; default all six
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

export const SETTINGS_PARTS = ['origin', 'dates', 'party', 'lifestyle', 'language', 'currency'];
const MAX_PARTY = 12; // the first-run receipt's ceiling (FirstRunReceipt.jsx MAX_PARTY)

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
function Part({ name, label, value, display, mono, onClick, expanded, popId, partRef, hasPopup = 'dialog' }) {
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
      className={`settings-part settings-part-${name}`}
      onClick={onClick}
      aria-haspopup={hasPopup}
      aria-expanded={hasPopup === 'dialog' && popId ? !!expanded : undefined}
      aria-controls={expanded ? popId : undefined}
      aria-label={t('settings.changeAria', { label, value })}
    >
      <span className="settings-part-label" aria-hidden="true">{label}</span>
      <span ref={valueRef} className={`settings-part-value${mono ? ' is-mono' : ''}`} aria-hidden="true">{display ?? value}</span>
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

export function SettingsLine({ parts = SETTINGS_PARTS, className = '', children, slot = false }) {
  const s = useSettings();
  const { t, lang, setLang, languages } = useI18n();
  const shortDate = useShortDate();
  const [open, setOpen] = useState(null); // 'dates' | 'party' | 'language' | null
  const [pickEnd, setPickEnd] = useState('start');
  const baseId = useId();
  const datesRef = useRef(null);
  const partyRef = useRef(null);
  const langRef = useRef(null);
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
    if (p === 'dates') setPickEnd('start');
    setOpen((v) => (v === p ? null : p));
  };

  const ownDates = !!s.ownDates;
  const datesValue = ownDates
    ? t('settings.datesRange', { start: shortDate(s.departDate), end: shortDate(s.returnDate) })
    : t('settings.anyDates');
  const party = Number.isFinite(s.party) ? s.party : 2;
  const profileKey = matchProfile(s.lifestyle || {});
  const bed = t(`stay.${s.stayTier || 'home'}`);
  const vibe = profileKey ? t(PROFILE_LABEL_KEYS[profileKey]) : t('lifestyle.custom');
  const langCode = String(lang || 'en').toUpperCase();

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
              label={t('settings.dates')}
              value={datesValue}
              mono={ownDates}
              partRef={datesRef}
              popId={`${baseId}-dates`}
              expanded={open === 'dates'}
              onClick={() => toggle('dates')}
            />
            {open === 'dates' && (
              <SettingsPop id={`${baseId}-dates`} label={t('settings.dates')} anchorRef={datesRef} onClose={close}>
                {/* One calendar for both ends: the kit Segmented above it says
                    which end the next pick sets (the lifted thumb, T426), and
                    a pick of the leaving day keeps the trip's length. */}
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
                <p className="settings-note">
                  <span className="is-mono">{t('settings.nights', { n: nightsBetween(s.departDate, s.returnDate) })}</span>
                </p>
                {ownDates ? (
                  s.defaultDates && (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="settings-text-btn"
                      onClick={() => {
                        s.setDepartDate(s.defaultDates.start);
                        s.setReturnDate(s.defaultDates.end);
                        close();
                        datesRef.current?.focus();
                      }}
                    >
                      {t('settings.useCartaDates')}
                    </Button>
                  )
                ) : (
                  <p className="settings-note">{t('settings.cartaDates')}</p>
                )}
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
                  {/* The habits drop first on a phone: the bed is the larger
                      half of the bill, so it is the part that stays. */}
                  <span className="settings-vibe">{vibe}</span>
                </>
              )}
              onClick={s.openLifestyle}
            />
          </div>
        )}

        {show('language') && (
          <div className="settings-slot settings-slot-language">
            <Part
              name="language"
              label={t('settings.language')}
              value={langCode}
              mono
              partRef={langRef}
              popId={`${baseId}-language`}
              expanded={open === 'language'}
              onClick={() => toggle('language')}
            />
            {open === 'language' && (
              <SettingsPop id={`${baseId}-language`} label={t('settings.language')} anchorRef={langRef} onClose={close}>
                {/* Six kit filter chips (T426): the one selected state, a tint
                    and a tick. A pick sets the language and closes, as before. */}
                <div className="settings-langs" role="group" aria-label={t('settings.language')}>
                  {languages.map((l) => (
                    <Chip
                      key={l.code}
                      lang={l.bcp47}
                      selected={l.code === lang}
                      onClick={() => { setLang(l.code); close(); langRef.current?.focus(); }}
                    >
                      {l.label}
                    </Chip>
                  ))}
                </div>
              </SettingsPop>
            )}
          </div>
        )}

        {show('currency') && (
          <span className="settings-currency">{t('settings.currency')}</span>
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
