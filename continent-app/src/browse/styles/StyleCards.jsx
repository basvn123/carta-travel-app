import React from 'react';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { formatMoney } from '../../lib/money.js';
import { partyText } from '../../lib/party.js';
import { radioGroupKeyDown, useRovingRadios } from '../../components/ui/radioGroup.js';
import { styleIcon, styleName } from './styleBits.jsx';
import '../../styles/79-style-studio.css';

/**
 * The travel style cards (Style Studio, G12): one radio per style, so arrow
 * keys move between styles and a tap or Space switches every price at once.
 * Drawn by the studio's overview, the planner's setup screens and Explore's
 * "Priced for" switcher, so a style looks the same wherever it is chosen.
 *
 *   <StyleCards list={ts.list} activeId={ts.activeId} onPick={ts.switchTo}
 *     label="Your travel styles" figures={useStyleFigures(ts.list, dests)} />
 *
 * Props
 *   list, activeId, onPick(id)   the styles, the one in use, the switch
 *   label                         the radiogroup's accessible name
 *   figures                       Map id -> day euros (useStyleFigures); a
 *                                 style with no figure shows none, never a guess
 *   compact                       one line a card: disc, name, figure (planner,
 *                                 the filter popover)
 *   aside(style)                  a node beside the radio, outside it (the
 *                                 overview's More button); never nested in it
 *   below(style)                  a node under the card (the held strip, the
 *                                 card menu)
 *   fresh                         the id of a style just made: it rises in
 *                                 and its figure counts up once
 *
 * The meta row is icon and word items with gaps, no separators (owner
 * 2026-11-18): who comes, the bed, the way there.
 */
export function StyleCards({
  list, activeId, onPick, label, figures = null, compact = false,
  aside = null, below = null, fresh = '', className = '',
}) {
  const { t } = useI18n();
  const ref = React.useRef(null);
  useRovingRadios(ref);
  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={`sst-cards${compact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
      onKeyDown={(e) => { if (e.target.getAttribute('role') === 'radio') radioGroupKeyDown(e); }}
    >
      {list.map((s) => (
        <StyleCard
          key={s.id}
          s={s}
          t={t}
          on={s.id === activeId}
          fig={figures?.get(s.id) ?? null}
          compact={compact}
          fresh={fresh === s.id}
          onPick={onPick}
          aside={aside ? aside(s) : null}
          below={below ? below(s) : null}
        />
      ))}
    </div>
  );
}

const WAY_GLYPH = { plane: HouseIcon.flight, train: HouseIcon.train, bus: HouseIcon.bus, car: HouseIcon.car, any: HouseIcon.route };

/** The style's meta items: who comes, where it sleeps, the way there. */
// eslint-disable-next-line react-refresh/only-export-components -- shared with the studio's tests and the filter line
export function styleMeta(t, s) {
  const way = WAY_GLYPH[s.way] ? s.way : 'any';
  return [
    { key: 'who', Icon: HouseIcon.people, text: partyText(t, { adults: s.who.adults, children: s.who.kids, babies: s.who.babies }) },
    { key: 'bed', Icon: HouseIcon.bed, text: t(`stay.${s.stay}`) },
    { key: 'way', Icon: WAY_GLYPH[way], text: t(`way.${way}`) },
  ];
}

function StyleCard({ s, t, on, fig, compact, fresh, onPick, aside, below }) {
  const Ico = styleIcon(s);
  const name = styleName(t, s);
  const shown = useCountUp(fig, fresh);
  const price = fig != null ? formatMoney(shown ?? fig, { precision: 'whole' }) : '';
  // The ghost holds the final figure's width, so the count never moves the
  // name beside it.
  const ghost = fig != null ? formatMoney(fig, { precision: 'whole' }) : '';
  return (
    <div className={`sst-card${on ? ' is-on' : ''}${fresh ? ' is-fresh' : ''}${aside ? ' has-aside' : ''}`}>
      <Pressable
        role="radio"
        aria-checked={on}
        className="sst-card-hit"
        data-sid={s.id}
        onClick={() => { if (!on) onPick(s.id); }}
      >
        <span className="sst-disc" aria-hidden="true">
          <Ico size={compact ? 18 : 20} />
        </span>
        <span className="sst-card-text">
          <span className="sst-card-name">{name}</span>
          {!compact && (
            <span className="sst-meta">
              {styleMeta(t, s).map(({ key, Icon, text }) => (
                <span key={key} className="sst-meta-item"><Icon size={16} />{text}</span>
              ))}
            </span>
          )}
          {on && (
            <span className="sst-inuse">
              <span className="sst-tick" aria-hidden="true"><HouseIcon.check size={12} /></span>
              {t('studio.inUse')}
            </span>
          )}
        </span>
        {fig != null && (
          <span className="sst-fig">
            <span className="sst-fig-num">
              <span className="sst-fig-ghost" aria-hidden="true">{ghost}</span>
              <span className="sst-fig-val">{price}</span>
            </span>
            <span className="sst-fig-unit">{t('studio.aDayEach')}</span>
          </span>
        )}
      </Pressable>
      {aside}
      {below}
    </div>
  );
}

const prefersLess = () => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

/** A figure that counts up once from a third of its value (a style just
 *  made), on the house settle curve's length; the end value at once under
 *  reduced motion or when there is nothing to count. */
function useCountUp(value, run) {
  // Under reduced motion the first frame is already the end value: no
  // partial figure, not even for one paint.
  const [shown, setShown] = React.useState(() => (run && value != null && !prefersLess() ? value / 3 : null));
  React.useEffect(() => {
    if (!run || value == null) { setShown(null); return undefined; }
    if (prefersLess()) { setShown(null); return undefined; }
    const from = value / 3;
    const ms = 640;
    let raf = 0;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      const ease = 1 - (1 - k) ** 3;
      setShown(k >= 1 ? null : from + (value - from) * ease);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, value]);
  return shown;
}
