import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { monthName } from '../lib/dates.js';
import { fit, showMatch } from '../lib/match.js';
import { isEmptyTaste, normalizeTaste, tripLikesDiffer, tripTaste } from '../lib/taste.js';
import { Button } from '../components/ui/index.js';
import { CheckIcon } from '../components/Icons.jsx';

/**
 * The personal match on the screens (Carta rating v5, Layer 3, T765).
 *
 * The match is read from lib/match.js and never merged into the score: a
 * card reads "8.9 Exceptional" from the ScoreChip and, beside it, "86%
 * match: hiking, quiet" from MatchLine. Below 55% (match.show_min) nothing
 * is shown, and with no taste set every screen is exactly what it was.
 *
 *   <MatchMonth.Provider value={month}>   the month the list speaks about
 *   <MatchLine place={p} />               a card's one line
 *   <WhyItMatches place={dest} />         the page's bars and conflicts
 *
 * The bars are p, the same values F is built from, so they always agree
 * with the percentage.
 */

/** The month (1 to 12) the surrounding list or page speaks about, or null. */
export const MatchMonth = React.createContext(null);

/** The traveller's taste from the app's choices, null when nothing is set. */
export function useTaste() {
  const firstRun = useFirstRun();
  const raw = firstRun?.choices?.taste;
  return React.useMemo(() => (isEmptyTaste(raw) ? null : normalizeTaste(raw)), [raw]);
}

/** The fit of `place` for this traveller and month, or null. */
export function useFit(place, month) {
  const taste = useTaste();
  const ctxMonth = React.useContext(MatchMonth);
  const m = month ?? ctxMonth;
  const profile = place?.taste;
  return React.useMemo(() => (taste && profile ? fit(taste, profile, m) : null), [taste, profile, m]);
}

/** The i18n key of one bar's name: the pick it answers. */
function barKey(b) {
  if (b.kind === 'like') return `taste.like.${b.key}`;
  if (b.kind === 'size') return `taste.size.${b.key}`;
  return `taste.quiet.${b.key}`;
}

/** A bar's name: the capitalised option label the questions use. */
function barLabelKey(b) {
  return b.kind === 'like' ? `pf.like.${b.key}` : `taste.opt.${b.key}`;
}

/** "86% match: hiking, quiet" for a card, or nothing under 55%. */
export function MatchLine({ place, month, className = '' }) {
  const { t } = useI18n();
  const f = useFit(place, month);
  if (!showMatch(f)) return null;
  const why = f.top.slice(0, 2).map((b) => t(barKey(b))).join(', ');
  return (
    <span className={`xmatch ${className}`.trim()} data-match={f.pct}>
      {why ? t('fit.pctWhy', { pct: f.pct, why }) : t('fit.pct', { pct: f.pct })}
    </span>
  );
}

/**
 * "Save as my travel style" at the end of "Help me choose" (T766): the trip's
 * likes become the profile's only on this tap; nothing is written otherwise.
 * Shown when the trip's likes differ from the saved ones.
 */
export function SaveTripTaste({ likes }) {
  const { t } = useI18n();
  const firstRun = useFirstRun();
  const saved = firstRun?.choices?.taste;
  const [done, setDone] = React.useState(false);
  if (!firstRun?.setChoices || (!done && !tripLikesDiffer(saved, likes))) return null;
  if (done) {
    return <p className="xsave-taste is-done" role="status"><CheckIcon size={14} /> {t('fit.saved')}</p>;
  }
  return (
    <p className="xsave-taste">
      <Button variant="secondary" size="sm" onClick={() => {
        firstRun.setChoices((prev) => ({ ...prev, taste: tripTaste(prev.taste, likes) }));
        setDone(true);
      }}>
        {t('fit.saveStyle')}
      </Button>
    </p>
  );
}

/** The month a fit was read for (from its quiet bar or a conflict), or null. */
function monthOf(f) {
  return f.bars.find((b) => b.kind === 'quiet')?.fact?.month || f.conflicts.find((c) => c.month)?.month || null;
}

/** One bar's fact line, from the profile's evidence; '' when it has none. */
function factLine(b, t, lang) {
  const f = b.fact;
  if (!f || typeof f !== 'object') return '';
  if (b.kind === 'size') return f.size ? t('fit.fact.size', { cls: t(`rating.class.${f.size}`) }) : '';
  if (b.kind === 'quiet') {
    if (f.crowd == null) return '';
    const level = t(`fit.fact.crowd.${Math.max(0, Math.min(3, Math.round(f.crowd)))}`);
    return f.month ? t('fit.fact.crowdIn', { level, month: monthName(f.month, lang) }) : level;
  }
  const parts = [];
  if (f.best && Number(f.n) > 0) parts.push(t('fit.fact.best', { n: f.n, best: f.best }));
  if (Number.isFinite(Number(f.minutes)) && f.minutes != null) parts.push(t('fit.fact.minutes', { n: Math.round(f.minutes) }));
  if (f.unesco === true) parts.push(t('fit.fact.unesco'));
  if (Number(f.heritage) > 0 || Number(f.museums) > 0) {
    parts.push(t('fit.fact.culture', { heritage: Number(f.heritage) || 0, museums: Number(f.museums) || 0 }));
  }
  if (Number(f.venues) > 0) parts.push(t('fit.fact.venues', { n: f.venues }));
  return parts.join(' · ');
}

/**
 * "Why it matches you": one bar per pick with its fact line, and every
 * conflict on its own line. Nothing under 55% or with no taste.
 */
export function WhyItMatches({ place, month }) {
  const { t, lang } = useI18n();
  const f = useFit(place, month);
  if (!showMatch(f)) return null;
  return (
    <div className="rate-break rate-break-v2 xwhy" data-testid="why-it-matches">
      {/* The month the match was read for, since quiet and busy depend on it. */}
      <p className="rb-head-text"><strong>{f.conflicts.length || f.bars.some((b) => b.kind === 'quiet')
        ? (monthOf(f) ? t('fit.pctIn', { pct: f.pct, month: monthName(monthOf(f), lang) }) : t('fit.pct', { pct: f.pct }))
        : t('fit.pct', { pct: f.pct })}</strong></p>
      <ul className="rb-parts">
        {f.bars.map((b) => {
          const fact = factLine(b, t, lang);
          return (
            <li key={`${b.kind}-${b.key}`} className="rb-part">
              <span className="rb-part-top">
                <span className="rb-part-name">{t(barLabelKey(b))}</span>
                <span className="rb-part-val mono">{Math.round(b.p * 100)}%</span>
              </span>
              <span className="rb-part-track">
                <span className="rb-part-fill" style={{ width: `${Math.max(2, b.p * 100)}%` }} />
              </span>
              {fact && <span className="rb-part-fact">{fact}</span>}
            </li>
          );
        })}
      </ul>
      {f.conflicts.map((c) => (
        <p key={c.key} className="rate-break-note xwhy-conflict">
          {t(`fit.conflict.${c.key}`, { month: c.month ? monthName(c.month, lang) : '' })}
        </p>
      ))}
    </div>
  );
}
