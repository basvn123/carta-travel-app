import React from 'react';
import { eurExact } from '../lib/format.js';

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
 *   t            the i18n function, for the est. words
 */

/** A figure, with the tilde and the est. tag when it stands in for a
 *  measurement. The tag carries its meaning as text, never colour alone. */
export function ReceiptFigure({ eur, est, t }) {
  return (
    <>
      {est && <span className="frr-tilde" aria-hidden="true">~ </span>}
      {eurExact(eur)}
      {est && (
        <abbr className="frr-est" title={t('prov.estTitle')}>
          <span aria-hidden="true">{` ${t('prov.est')}`}</span>
          <span className="frr-sr">{` ${t('prov.estTitle')}`}</span>
        </abbr>
      )}
    </>
  );
}

export function ReceiptCard({
  titleId, headingLevel = 2, title, sub, action = null, lines, sumLabel, total, est, each = null,
  eachText, foot = [], cardRef = null, t,
}) {
  const H = headingLevel === 3 ? 'h3' : 'h2';
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
      {/* Keyed on the total so the figures settle again when it moves. */}
      <dl className="frr-lines" key={total}>
        {lines.map((line) => (
          <div className="frr-line" key={line.key} data-line={line.key}>
            <dt>
              <span className="frr-label">{line.label}</span>
              {(line.prov || []).map((p, i) => {
                if (typeof p === 'string') return <span className="frr-prov" key={i}>{p}</span>;
                // The arithmetic in mono and, on the same row, the words that
                // say where its figure came from.
                return (
                  <span className="frr-prov frr-prov-pair" key={i}>
                    <span className="mono">{p.mono}</span>
                    {p.text && <span>{p.text}</span>}
                  </span>
                );
              })}
            </dt>
            <dd className="mono" data-eur={line.eur}><ReceiptFigure eur={line.eur} est={line.est} t={t} /></dd>
          </div>
        ))}
        <div className="frr-line frr-sum">
          <dt><span className="frr-label">{sumLabel}</span></dt>
          <dd className="mono" aria-live="polite">
            <span className="frr-sum-eur" data-eur={total}><ReceiptFigure eur={total} est={est} t={t} /></span>
            {each != null && eachText && (
              <span className="frr-each">{eachText(`${est ? '~ ' : ''}${eurExact(each)}`)}</span>
            )}
          </dd>
        </div>
      </dl>
      {foot.filter(Boolean).map((line) => <p className="frr-foot" key={line}>{line}</p>)}
    </div>
  );
}
