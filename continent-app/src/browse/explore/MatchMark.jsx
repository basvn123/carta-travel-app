import React from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/index.jsx';
import { CloseIcon, HeartIcon } from '../../components/Icons.jsx';
import { IconButton } from '../../components/ui/index.js';
import { lastInputWasKeyboard } from '../../hooks/useFocusTrap.js';
import { useMedia } from '../settings/settingsBits.jsx';
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
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); }}>
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
 * figure. A bottom sheet on a phone; from 769 px a 360 px popover hung off
 * the mark that leaves the page live (WhyFloat, proposal.md section 6).
 */
export function WhyPopover({ f, place, anchorRef, onClose }) {
  const { t, lang } = useI18n();
  const float = useMedia(FLOAT_FROM);
  const style = useSettings()?.travelStyles?.active || null;
  const styleName = style ? (style.name || (style.nameKey ? t(style.nameKey) : '')) : '';
  const m = matchPoints(f);
  const id = React.useId();
  if (!m) return null;
  const body = <WhyBody f={f} m={m} styleName={styleName} t={t} lang={lang} />;
  const shell = { title: place?.city || '', onClose, anchorRef, labelId: `why-${id}`, closeLabel: t('explore.map.close') };
  if (float) return <WhyFloat {...shell}>{body}</WhyFloat>;
  return <SheetShell {...shell} width={FLOAT_W} className="xwhy-pop">{body}</SheetShell>;
}

// From this width the explanation floats beside its mark, 360 px wide, at
// least 16 px from the window's edges and 8 px from the mark.
const FLOAT_FROM = '(min-width: 769px)';
const FLOAT_W = 360;
const EDGE = 16;
const GAP = 8;
const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * The explanation as a popover (G12 map view round 2, proposal.md section
 * 6): non-modal, so no backdrop and the page stays live. It hangs under the
 * mark, or over it when the window has more room there, kept inside the
 * window. A tap or click outside, Escape, a scroll or a wheel outside, or a
 * resize closes it; Escape and Close hand focus back to the mark. Focus
 * moves to Close on open (a ring only after a key), and a Tab past either
 * end goes back to the mark and closes it.
 */
function WhyFloat({ title, labelId, closeLabel, anchorRef, onClose, children }) {
  const ref = React.useRef(null);
  const closeRef = React.useRef(null);
  const [pos, setPos] = React.useState(null);
  const shut = React.useRef(false);
  // The parent hands a new onClose each render; the listeners stay put.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  // Where the mark stood when the popover was placed: a scroll that moves
  // it closes the popover (the popover would hang off nothing), a scroll
  // that does not (a click that first brought the mark into view) does not.
  const placedAt = React.useRef(null);
  const close = React.useCallback((back) => {
    if (shut.current) return;
    shut.current = true;
    onCloseRef.current();
    if (back) anchorRef?.current?.focus({ preventScroll: true });
  }, [anchorRef]);

  // Placed before paint, so it never shows on the wrong side.
  React.useLayoutEffect(() => {
    const a = anchorRef?.current;
    const el = ref.current;
    if (!a || !el) return;
    const r = a.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(FLOAT_W, vw - 2 * EDGE);
    const h = el.offsetHeight;
    const below = vh - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const up = h > below && above > below;
    const room = Math.max(160, up ? above : below);
    const top = up ? Math.max(EDGE, r.top - GAP - Math.min(h, room)) : r.bottom + GAP;
    const fromRight = r.left + r.width / 2 > vw / 2;
    const left = Math.max(EDGE, Math.min(fromRight ? r.right - w : r.left, vw - w - EDGE));
    placedAt.current = [r.left, r.top];
    setPos({ top: Math.round(top), left: Math.round(left), width: Math.round(w), maxHeight: Math.round(room), up });
  }, [anchorRef]);

  // Focus moves in once the popover is placed and shown (a hidden button
  // refuses focus).
  const placed = pos != null;
  React.useEffect(() => {
    const btn = closeRef.current;
    if (!placed || !btn) return;
    if (!lastInputWasKeyboard()) btn.setAttribute('data-focus-quiet', '');
    btn.focus({ preventScroll: true });
  }, [placed]);

  React.useEffect(() => {
    const inside = (e) => ref.current?.contains(e.target);
    const onDown = (e) => { if (!inside(e) && !anchorRef?.current?.contains(e.target)) close(false); };
    const onEscape = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      close(true);
    };
    const onScroll = (e) => {
      if (inside(e)) return;
      const r = anchorRef?.current?.getBoundingClientRect();
      const at = placedAt.current;
      if (!r || !at || Math.abs(r.left - at[0]) > 2 || Math.abs(r.top - at[1]) > 2) close(false);
    };
    const onWheel = (e) => { if (!inside(e)) close(false); };
    const onResize = () => close(false);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onEscape, true);
    document.addEventListener('scroll', onScroll, true);
    document.addEventListener('wheel', onWheel, { capture: true, passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onEscape, true);
      document.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('wheel', onWheel, { capture: true });
      window.removeEventListener('resize', onResize);
    };
  }, [anchorRef, close]);

  // A Tab past either end goes back to the mark: the popover is not a trap.
  const onTab = (e) => {
    if (e.key !== 'Tab') return;
    const all = [...ref.current.querySelectorAll(FOCUSABLE)];
    if (!all.length) return;
    const end = e.shiftKey ? all[0] : all[all.length - 1];
    if (document.activeElement !== end) return;
    e.preventDefault();
    close(true);
  };

  const style = pos
    ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }
    : { top: 0, left: 0, width: FLOAT_W, visibility: 'hidden' };
  return createPortal(
    <div ref={ref} className={`xwhy-pop xwhy-float${pos?.up ? ' is-up' : ''}`} style={style}
      role="dialog" aria-modal="false" aria-labelledby={labelId} onKeyDown={onTab}>
      <div className="xwhy-float-head">
        <h2 className="xwhy-float-title" id={labelId}>{title}</h2>
        <IconButton ref={closeRef} className="xwhy-float-close" label={closeLabel} onClick={() => close(true)}>
          <CloseIcon size={16} />
        </IconButton>
      </div>
      <div className="xwhy-float-body">{children}</div>
    </div>,
    document.body,
  );
}

/** Why a place matches: the part both shells show. */
function WhyBody({ f, m, styleName, t, lang }) {
  const mo = monthOf(f);
  const head = mo ? t('fit.whyIn', { pct: f.pct, month: monthName(mo, lang) }) : t('fit.whyAll', { pct: f.pct });
  const total = m.rows.reduce((s, r) => s + r.points, 0) || 1;
  return (
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
              {r.tag && <span className="xwhy-tag">{t(r.tag === 'strongest' ? 'fit.tagStrongest' : 'fit.tagStrong')}</span>}
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
  );
}
