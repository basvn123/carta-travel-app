import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { HeartIcon } from '../../components/Icons.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { useSettings } from '../../components/SettingsLine.jsx';
import { monthName } from '../../lib/dates.js';
import { matchPoints, showMatch } from '../../lib/match.js';
import { useFit } from '../WhyItMatches.jsx';
import { SheetShell } from '../SheetShell.jsx';

/**
 * The match as a mark (G12 map view round 2, proposal.md section 6): a small
 * saffron pill with the style's heart and the figure ("61%") where a row or
 * a card shows a place, in place of the "86% match: culture, cities"
 * sentence. Nothing under 55% or without a taste, as before (showMatch).
 * A press opens WhyPopover: why the figure is what it is, as points that add
 * up to it (lib/match.js matchPoints). The mark is a button of its own, so
 * it sits outside a row's link.
 */
export function MatchMark({ place, month, className = '' }) {
  const { t } = useI18n();
  const f = useFit(place, month);
  const ref = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  if (!showMatch(f)) return null;
  return (
    <>
      <Pressable ref={ref} className={`xmatch-mark ${className}`.trim()} data-match={f.pct}
        aria-label={t('fit.markAria', { pct: f.pct })} aria-haspopup="dialog" aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}>
        <HeartIcon size={14} className="xmatch-heart" />
        <span className="xmatch-pct" aria-hidden="true">{f.pct}%</span>
      </Pressable>
      {open && <WhyPopover f={f} place={place} anchorRef={ref} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The month a fit was read for (its quiet bar or a conflict), or null. */
function monthOf(f) {
  return f.bars.find((b) => b.kind === 'quiet')?.fact?.month || f.conflicts.find((c) => c.month)?.month || null;
}
const barLabelKey = (b) => (b.kind === 'like' ? `pf.like.${b.key}` : `taste.opt.${b.key}`);

/**
 * Why a place matches: the style and its heart, the figure, one stacked bar
 * and one row per interest (its points, a track as wide as its weight,
 * filled as far as the place fits it), the two strongest tagged; a conflict
 * takes its points off in a hatched saffron row. The rows add up to the
 * figure. A bottom sheet on a phone, hung off the mark from 769 px
 * (SheetShell's anchored panel).
 */
export function WhyPopover({ f, place, anchorRef, onClose }) {
  const { t, lang } = useI18n();
  const style = useSettings()?.travelStyles?.active || null;
  const styleName = style ? (style.name || (style.nameKey ? t(style.nameKey) : '')) : '';
  const m = matchPoints(f);
  const id = React.useId();
  if (!m) return null;
  const mo = monthOf(f);
  const head = mo ? t('fit.whyIn', { pct: f.pct, month: monthName(mo, lang) }) : t('fit.whyAll', { pct: f.pct });
  const total = m.rows.reduce((s, r) => s + r.points, 0) || 1;
  return (
    <SheetShell title={place?.city || ''} onClose={onClose} anchorRef={anchorRef} width={360}
      labelId={`why-${id}`} closeLabel={t('explore.map.close')} className="xwhy-pop">
      <div className="xwhy-body" data-testid="why-points" data-pct={f.pct}>
        <p className="xwhy-style">
          <span className="xwhy-heart" aria-hidden="true"><HeartIcon size={16} /></span>
          <span><span className="xwhy-kicker">{t('fit.yourStyle')}</span> {styleName}</span>
        </p>
        <p className="xwhy-fig"><strong>{f.pct}%</strong> <span>{head.replace(`${f.pct}%`, '').trim()}</span></p>
        <div className="xwhy-stack" aria-hidden="true">
          {m.rows.map((r, i) => (
            <span key={`${r.kind}-${r.key}`} className={`xwhy-seg is-${Math.min(i, 3)}`}
              style={{ width: `${(r.points / total) * 100}%` }} />
          ))}
        </div>
        <ul className="xwhy-rows">
          {m.rows.map((r, i) => (
            <li key={`${r.kind}-${r.key}`} className="xwhy-row" data-points={r.points}>
              <span className="xwhy-row-top">
                <span className={`xwhy-sw is-${Math.min(i, 3)}`} aria-hidden="true" />
                <span className="xwhy-name">{t(barLabelKey(r))}</span>
                {r.tag && <span className="xwhy-tag">{t(r.tag === 'strongest' ? 'fit.strongest' : 'fit.strong')}</span>}
                <span className="xwhy-pts" aria-label={t('fit.points', { n: r.points })}>+{r.points}</span>
              </span>
              <span className="xwhy-track" style={{ width: `${Math.max(8, r.share * 100)}%` }} aria-hidden="true">
                <span className="xwhy-fill" style={{ width: `${Math.max(2, r.p * 100)}%` }} />
              </span>
            </li>
          ))}
          {m.conflict > 0 && f.conflicts.map((c, i) => (
            <li key={c.key} className="xwhy-row is-conflict" data-points={i === 0 ? -m.conflict : 0}>
              <span className="xwhy-row-top">
                <span className="xwhy-sw is-hatch" aria-hidden="true" />
                <span className="xwhy-name">{t(`fit.short.${c.key}`, { month: c.month ? monthName(c.month, lang) : '' })}</span>
                {i === 0 && <span className="xwhy-pts" aria-label={t('fit.points', { n: -m.conflict })}>-{m.conflict}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </SheetShell>
  );
}
