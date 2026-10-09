import React from 'react';
import { useI18n } from '../i18n/index.jsx';

/**
 * The key facts band of a detail page (T386, carta-design "Detail page
 * grammar" and DIRECTION.md part 4, the timetable row).
 *
 * Four to six facts, open, directly under the head: label over value, the
 * label in the sans and the value in mono with its unit when it is a measured
 * figure, a word (Waymarked, Excellent) in the sans. No card, no colour, no
 * control: it is what a traveller decides on, so nothing about it folds. The
 * cells come from lib/detailSkeleton.js keyFactCells, which keeps the page's
 * order and gives a missing value the strip's placeholder word, so the band
 * never claims a figure the data does not have.
 *
 * A cell may carry `note`, one short line under the value (the bathing water
 * site, "est." on a modelled season), set as metadata. `lead` is one verdict
 * that leads the band in its own words (the lake's swim verdict, which can
 * hurt somebody and so is never a cell among others). `foot` is one visible
 * line under the band for a mark the cells carry (the trail's "~" on a grade
 * estimated from the elevation model), so the reason is on the page and not
 * only in a `title` that touch cannot reach (T406).
 */
export function KeyFacts({ cells, lead = null, foot = null }) {
  const { t } = useI18n();
  const hasCells = Array.isArray(cells) && cells.length > 0;
  if (!hasCells && !lead) return null;
  return (
    <section className="dsk-keyfacts" id="dsk-sec-facts" data-slot="keyfacts" aria-label={t('detail.keyFacts')}>
      {lead}
      {hasCells && (
      <dl className="dsk-kf-list">
        {cells.map((c) => (
          <div key={c.key} className={`dsk-kf${c.missing ? ' is-missing' : ''}`} data-fact={c.key}>
            <dt className="dsk-kf-label">{c.label}</dt>
            <dd className={`dsk-kf-value${c.mono ? ' mono' : ''}`}>
              {c.value}
              {c.note ? <span className="dsk-kf-note">{c.note}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      )}
      {foot ? <p className="dsk-kf-foot">{foot}</p> : null}
    </section>
  );
}

export default KeyFacts;
