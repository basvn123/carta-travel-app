import React from 'react';
import { eurExact } from '../lib/format.js';
import { formatEst, formatApprox, formatMoney } from '../lib/money.js';
import { CostRow, CostSum } from './ui/CostRow.jsx';
import { settleFigure } from '../lib/figureChange.js';
import { CostBar } from '../browse/CostBar.jsx';

/**
 * The receipt card, drawn once for every surface that shows the first
 * priced total (T382, register row T209-a): the landing page's
 * demonstration and the first-run receipt on the destination and trip pages
 * render this one component, so the two cannot drift apart again (they had:
 * a visible "est." on one and not the other, a per-person figure without its
 * tilde, two sum sizes).
 *
 * Presentational only. The caller prices the receipt (lib/firstRun.js) and
 * words it (the `receipt` i18n keys); this file only lays it out as the
 * carta-design receipt: a --paper-dim head with the place and the stay, one
 * hairline line per cost with its provenance rows and the figure right
 * aligned in --mono, a 2px --ink rule above the sum, the sum in --mono, and
 * the --accent-bg foot lines (the one-input counterfactual, the room note).
 * Styles are 38-first-run.css (.frr-card and its children).
 *
 * props
 *   titleId      id for the heading, so a section can be labelled by it
 *   headingLevel 2 or 3, to sit in the page's outline
 *   title        the heading text (the place, or "place from origin")
 *   sub          the stay in one line (dates, nights, people)
 *   action       one trailing control in the head, beside the title (the
 *                landing page's "Open {city}"); optional
 *   lines        [{ key, label, prov: [string | { mono, text }], eur, est }];
 *                a { mono, text } row sets the arithmetic in mono with its
 *                provenance words beside it
 *   sumLabel     "Total for 2 people"
 *   total, est   the total and whether it holds an estimate
 *   each         the per-person figure, or null for a party of one
 *   eachText     (eur) => the per-person sentence; it gets the figure with
 *                its tilde when the total is an estimate
 *   foot         [string], the --accent-bg lines under the sum
 *   cardRef      a ref to the card, for the caller's IntersectionObserver
 *   bar          true to draw the cost bar above the lines (T392, design
 *                wave V4; carta-design "The cost bar"): the shell's CostBar,
 *                one segment per line in receipt order, weighted by its euros
 *   t            the i18n function, for the est. words
 *
 * Since T392 a reprice no longer remounts the lines (they were keyed on the
 * total and faded in by a keyframe of their own). Each figure that changed
 * settles in place through settleFigure() (lib/figureChange.js, --dur-2,
 * --ease-out, nothing under reduced motion), the house primitive every
 * surface uses for a figure that updates, so the screen reader's live
 * region on the sum is not torn down and rebuilt either.
 */

/** A figure, with the tilde when it stands in for a measurement, set exactly
 *  as <Money est> sets it (T537: one estimate notation; T590: the tilde
 *  alone on screen, the estimate word left it). The meaning is spoken as
 *  text, never colour alone. `precision` is cents on a receipt,
 *  whole on the budget search (owner, 1.8). */
export function ReceiptFigure({ eur, est, t, precision = 'cents' }) {
  if (!est) return <span className="money">{formatMoney(eur, { precision })}</span>;
  return (
    <span className="money is-est">
      {/* T590: the tilde is the mark on screen; the meaning stays spoken. */}
      <span title={t('prov.estTitle')}>{formatApprox(eur, { precision })}</span>
      <span className="sr-only">{` ${t('prov.estTitle')}`}</span>
    </span>
  );
}

/** A provenance row as one caption: plain words, or the arithmetic with the
 *  words that say where its figure came from. */
function provText(p) {
  if (typeof p === 'string') return p;
  return [p.mono, p.text].filter(Boolean).join(' ');
}

/** One receipt line: the icon for what it buys, the label, its provenance as
 *  a caption and the figure. Exported so a single line can illustrate a
 *  claim elsewhere on the same page set exactly as the receipt sets it
 *  (DIRECTION.md rule landing R8). `line.kind` picks the icon (CostRow's
 *  COST_ICON), else the key does. */
export function ReceiptLine({ line, t, precision = 'cents' }) {
  const sub = (line.prov || []).map(provText).filter(Boolean).join(', ') || null;
  return (
    <CostRow
      kind={line.kind || line.key}
      label={line.label}
      sub={sub}
      value={<span data-eur={line.eur} data-key={line.key}><ReceiptFigure eur={line.eur} est={line.est} t={t} precision={precision} /></span>}
    />
  );
}

/** The sum line. `live` is false where the line illustrates a claim, so a
 *  screen reader hears a reprice once, from the receipt itself. */
export function ReceiptSum({ sumLabel, total, est, each = null, eachText, live = true, t, precision = 'cents' }) {
  const eachFig = each != null && eachText
    ? eachText(est ? formatEst(each, t('money.est'), { precision }) : formatMoney(each, { precision }))
    : null;
  return (
    <CostSum
      label={sumLabel}
      live={live}
      value={<span className="frr-sum-eur" data-eur={total} data-key="sum"><ReceiptFigure eur={total} est={est} t={t} precision={precision} /></span>}
      each={eachFig}
    />
  );
}

/** Settle every figure under `ref` whose data-eur changed since the last
 *  render (the lines, the sum, a priced list). Keyed by the element's
 *  data-key or its position; the first render settles nothing. */
// eslint-disable-next-line react-refresh/only-export-components -- the receipt's own settle hook, shared with the landing's priced list; it stays beside the figures it settles
export function useSettleChanged(ref, signature) {
  const last = React.useRef(null);
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const now = new Map();
    root.querySelectorAll('[data-eur]').forEach((el, i) => {
      now.set(el.getAttribute('data-key') || String(i), [el, el.getAttribute('data-eur')]);
    });
    const prev = last.current;
    last.current = new Map([...now].map(([k, [, v]]) => [k, v]));
    if (!prev) return;
    for (const [k, [el, v]] of now) {
      if (prev.has(k) && prev.get(k) !== v) settleFigure(el);
    }
  }, [ref, signature]);
}

export function ReceiptCard({
  titleId, headingLevel = 2, title, sub, action = null, lines, sumLabel, total, est, each = null,
  eachText, foot = [], cardRef = null, bar = false, t,
}) {
  const H = headingLevel === 3 ? 'h3' : 'h2';
  const linesRef = React.useRef(null);
  useSettleChanged(linesRef, `${lines.map((l) => `${l.key}:${l.eur}`).join('|')}|${total}|${each}`);
  const segments = bar
    ? lines.filter((l) => l.eur > 0).map((l) => ({
      slot: l.key,
      label: l.label,
      weight: l.eur,
      figure: `${l.est ? '~' : ''}${eurExact(l.eur)}`,
    }))
    : [];
  return (
    <div className="frr-card" ref={cardRef}>
      <header className="frr-head">
        {action ? (
          <div className="frr-head-row">
            <H className="frr-title" id={titleId}>{title}</H>
            {action}
          </div>
        ) : <H className="frr-title" id={titleId}>{title}</H>}
        {sub && <p className="frr-sub mono">{sub}</p>}
      </header>
      {segments.length > 1 && (
        <div className="frr-bar"><CostBar t={t} segments={segments} /></div>
      )}
      <dl className="frr-lines costrows" ref={linesRef}>
        {lines.map((line) => <ReceiptLine line={line} t={t} key={line.key} />)}
        <ReceiptSum sumLabel={sumLabel} total={total} est={est} each={each} eachText={eachText} t={t} />
      </dl>
      {foot.filter(Boolean).map((line) => <p className="frr-foot" key={line}>{line}</p>)}
    </div>
  );
}
