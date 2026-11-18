/* eslint-disable react-refresh/only-export-components -- small hooks and parts the Settings steps share */
import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { IconButton } from '../../components/ui/index.js';
import { Pressable } from '../../components/ui/Pressable.jsx';

/** The nights as words: "7 nights", "1 night" (the receipt's own words). */
export function nightsText(t, n) {
  return n === 1 ? t('receipt.oneNight') : t('receipt.nNights', { n });
}

/** Whether a media query matches, kept live. */
export function useMedia(query) {
  const [on, setOn] = React.useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches));
  React.useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const f = () => setOn(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [query]);
  return on;
}

/** How long the changes must pause before the status speaks (a11y
 *  critique: a calendar sweep or a stepper must not announce every step). */
export const STATUS_PAUSE_MS = 800;
/** How long the visible line stays (the --dur-note token). */
const STATUS_STAYS_MS = 4000;

/**
 * The one "Prices updated" line: `ping()` after each change; the text
 * arrives once the changes pause, and clears after --dur-note.
 */
export function useLiveStatus(text) {
  const [shown, setShown] = React.useState('');
  const timers = React.useRef({ pause: 0, clear: 0 });
  React.useEffect(() => () => {
    clearTimeout(timers.current.pause);
    clearTimeout(timers.current.clear);
  }, []);
  const ping = React.useCallback(() => {
    clearTimeout(timers.current.pause);
    clearTimeout(timers.current.clear);
    setShown('');
    timers.current.pause = setTimeout(() => {
      setShown(text);
      timers.current.clear = setTimeout(() => setShown(''), STATUS_STAYS_MS);
    }, STATUS_PAUSE_MS);
  }, [text]);
  return { text: shown, ping };
}

/** The glyph of a way there; Best way is the signpost (every way). */
export function wayIcon(mode) {
  return { plane: HouseIcon.flight, train: HouseIcon.train, bus: HouseIcon.bus, car: HouseIcon.car }[mode] || HouseIcon.signpost;
}

/** The euro mark for Prices shown: the band's glyph once it has one, the
 *  ticket meanwhile. */
export const PricesIcon = HouseIcon.euro || HouseIcon.ticket;

/**
 * A choice tile in the Style Studio's look (sst-tile): icon over word, the
 * umber edge, wash and tick when chosen. A radio in a radiogroup: arrows
 * move the choice, one tab stop.
 */
export function ChoiceTiles({ label, options, value, onChange, className = '' }) {
  const ref = React.useRef(null);
  const move = (dir) => {
    const live = options.filter((o) => !o.disabled);
    const i = live.findIndex((o) => o.value === value);
    const next = live[(i + dir + live.length) % live.length];
    onChange(next.value);
    requestAnimationFrame(() => ref.current?.querySelector('[aria-checked="true"]')?.focus());
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={label} className={`sst-tiles set-tiles ${className}`} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <Pressable
            key={o.value}
            role="radio"
            aria-checked={on}
            tabIndex={on || (!value && o === options[0]) ? 0 : -1}
            className={`sst-tile${on ? ' is-on' : ''}`}
            haptic={on ? null : 'tick'}
            onClick={() => onChange(o.value)}
          >
            <span className="sst-tile-tick" aria-hidden="true"><HouseIcon.check size={12} /></span>
            {Icon && <Icon size={26} className="sst-tile-ic" />}
            <span className="sst-tile-label">{o.label}</span>
          </Pressable>
        );
      })}
    </div>
  );
}

/** The nights stepper: minus, the count, plus (1 to 30). */
export function NightsStepper({ nights, onChange, min = 1, max = 30 }) {
  const { t } = useI18n();
  return (
    <div className="set-nights">
      <span className="set-nights-label" id="set-nights-label">{t('settings.nightsLabel')}</span>
      <span className="set-nights-ctl" role="group" aria-labelledby="set-nights-label">
        <IconButton tone="surface" label={t('settings.nightsDec')} disabled={nights <= min}
          haptic="tick" onClick={() => onChange(nights - 1)}>
          <HouseIcon.minus size={18} />
        </IconButton>
        <output className="set-nights-n" aria-live="off" aria-label={t('settings.nightsAria', { n: nights })}>{nights}</output>
        <IconButton tone="surface" label={t('settings.nightsInc')} disabled={nights >= max}
          haptic="tick" onClick={() => onChange(nights + 1)}>
          <HouseIcon.plus size={18} />
        </IconButton>
      </span>
    </div>
  );
}
