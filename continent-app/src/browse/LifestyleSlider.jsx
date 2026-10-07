import React, { useEffect, useId, useRef, useState } from 'react';
import { sayKey } from '../lib/lifestyleSlider.js';

/**
 * The Lifestyle panel's "Where you sleep" answer, drawn as a stepped slider
 * on the trip page (T173). One stop per sleep group the dataset offers, each
 * labelled with the panel's own word, and moving it writes the same
 * choices.stay_tier the panel's tiles write. It is the one Lifestyle control
 * shown another way, never a second setting: change it here and the panel,
 * the toolbar button and every price in the app follow.
 *
 * Under it, one sentence says in words what the figure at this stop buys
 * (M6): the trade-off, not only the number. A native range input, so the
 * arrow keys, Home and End work and the focus ring is the house ring.
 */
export function LifestyleSlider({ stops, index, onPick, figures, t, lang }) {
  const id = useId();
  const n = stops.length;
  const stop = stops[index] || stops[0];
  const word = t(stop.labelKey);
  const eur = (v) => `€${Math.round(v).toLocaleString(lang)}`;
  return (
    <div className="ls-slider" style={{ '--n': n }}>
      <label className="ls-slider-label" htmlFor={id}>{t('lifestyle.stay')}</label>
      <input
        id={id}
        type="range"
        className="ls-slider-input"
        min="0"
        max={n - 1}
        step="1"
        value={index}
        aria-valuetext={word}
        onChange={(e) => onPick(Number(e.target.value))}
      />
      {/* The words under the stops, one equal column each, with the track
          inset so every stop sits over the middle of its column (the CSS
          reads --n). A long word wraps inside its column instead of running
          into the next. Hidden from screen readers: the input already says
          the word through aria-valuetext. */}
      <div className="ls-slider-stops" aria-hidden="true" lang={lang}>
        {stops.map((s, i) => (
          <span key={s.key} className={`ls-slider-stop${i === index ? ' on' : ''}`}>
            {t(s.labelKey)}
          </span>
        ))}
      </div>
      {figures?.total != null && (
        <p className="ls-slider-say" aria-live="polite">
          {t(sayKey(stop.key), { total: eur(figures.total), day: eur(figures.perDay ?? figures.total / 7) })}
        </p>
      )}
      <p className="ls-slider-note">{t('journey.lsNote')}</p>
    </div>
  );
}

const reduceMotion = () => typeof window !== 'undefined'
  && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A receipt figure that runs to its new value in 240 ms when the slider
 * moves, so the eye sees which lines moved and by how much. Under
 * prefers-reduced-motion it changes in one step.
 */
export function MovingEur({ value, lang }) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  useEffect(() => {
    const from = shownRef.current;
    if (value == null || from == null || from === value || reduceMotion()) {
      shownRef.current = value;
      setShown(value);
      return undefined;
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 240);
      const v = from + (value - from) * (1 - (1 - k) ** 3);
      shownRef.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (shown == null) return null;
  return <>{`€${Math.round(shown).toLocaleString(lang)}`}</>;
}
