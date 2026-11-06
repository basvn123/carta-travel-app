import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton, Money } from '../../components/ui/index.js';
import { BedIcon, BusIcon, ChevronRightIcon, FerryIcon, TrainIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { AirlineMark } from '../../components/flights/Flights.jsx';
import { fmtDate } from '../../lib/dates.js';

const MODE_ICON = { train: TrainIcon, bus: BusIcon, ferry: FerryIcon, fly: PlaneIcon };

/**
 * Still to book as passes (T1003, owner 2026-11-02: "swipe and see the other
 * things to book; the flight is plain text, structure it"). After the way
 * airline and itinerary apps lay out a booking (TripIt's swipeable cards, a
 * boarding pass's two ends): one card per part not yet booked, side by side,
 * swiped on a phone and scrolled on a desktop.
 *
 *   flight  the airline, the date, the two airports large with their times
 *           and the plane on the line between them
 *   stay    the town and its nights, check-in and check-out as two ends
 *   leg     the two towns as two ends, the mode on the line between them
 *
 * Under a perforation: the figure and Book (the operator's own site). The
 * segments above the cards are the booked count and the pager in one: one
 * segment a part, filled when booked, the card in view marked, and a tap on
 * one brings its card in. With a mouse or a trackpad (no swipe), Previous
 * and Next beside the count step a card at a time (T1004).
 *
 *   rows      bookRows() output, every bookable part, booked or not
 *   headId    the heading's id
 */
export function BookPasses({ rows, headId }) {
  const { t } = useI18n();
  const todo = rows.filter((r) => !r.booked);
  const track = useRef(null);
  const [at, setAt] = useState(0);
  const [atEnd, setAtEnd] = useState(false);

  // The card in view: the one whose left edge is nearest the track's.
  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cards = [...el.children];
        const left = el.getBoundingClientRect().left;
        let best = 0;
        let dist = Infinity;
        cards.forEach((c, i) => {
          const d = Math.abs(c.getBoundingClientRect().left - left);
          if (d < dist) { dist = d; best = i; }
        });
        // Scrolled to the end with two cards in view: the last one is "at".
        const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
        setAtEnd(end);
        setAt(end ? cards.length - 1 : best);
      });
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [todo.length]);

  const goTo = (i) => {
    const el = track.current;
    const card = el?.children[i];
    if (!card) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
  };

  // One segment a part: the booked ones first (filled), then one per card;
  // the count above reads the same rows, so the two always agree.
  const nBooked = rows.length - todo.length;

  return (
    <section className="tbp" aria-labelledby={headId}>
      <div className="tbp-top">
        <h2 className="tbp-h" id={headId}>{t(todo.length ? 'tp.next.title' : 'tp.next.done')}</h2>
        <span className="tbp-n">{t('tp.bookedOf', { n: nBooked, of: rows.length })}</span>
        {todo.length > 1 && (
          <span className="tbp-steps">
            <IconButton tone="plain" label={t('detail.trackPrev')} disabled={at === 0} onClick={() => goTo(at - 1)}>
              <ChevronRightIcon size={18} className="tbp-prev" />
            </IconButton>
            <IconButton tone="plain" label={t('detail.trackNext')} disabled={atEnd} onClick={() => goTo(at + 1)}>
              <ChevronRightIcon size={18} />
            </IconButton>
          </span>
        )}
      </div>
      <div className="tbp-pager">
        {Array.from({ length: nBooked }, (_, i) => <span key={`b${i}`} className="tbp-seg is-booked" aria-hidden="true" />)}
        {todo.map((r, i) => (
          <button key={r.key} type="button" className={`tbp-seg${i === at ? ' is-at' : ''}`}
            aria-label={`${r.title}, ${t('tp.pass.of', { n: i + 1, of: todo.length })}`}
            aria-current={i === at ? 'true' : undefined} onClick={() => goTo(i)} />
        ))}
      </div>
      {todo.length > 0 && (
        <ol className="tbp-track" ref={track}>
          {todo.map((r) => <li key={r.key} className="tbp-card" data-row={r.key}><Pass row={r} /></li>)}
        </ol>
      )}
    </section>
  );
}

function Pass({ row }) {
  const { t } = useI18n();
  const p = row.pass || {};
  const fig = Number.isFinite(row.eur) && row.eur > 0;
  const day = (iso) => (iso ? fmtDate(iso, true) : '');

  let head;
  let ends;
  if (p.kind === 'flight') {
    head = (
      <>
        <span className="tbp-brand">
          {p.airline ? <AirlineMark code={p.airline} size="sm" /> : <span className="tbp-glyph"><PlaneIcon size={16} /></span>}
          <span className="tbp-brand-name">{p.airlineName || row.title}</span>
        </span>
        <span className="tbp-when">{day(p.date)}</span>
      </>
    );
    ends = (
      <div className="tbp-ends">
        <span className="tbp-end">
          <span className="tbp-code">{p.from}</span>
          {p.dep && <span className="tbp-time">{p.dep}</span>}
        </span>
        <span className="tbp-line" aria-hidden="true"><PlaneIcon size={16} /></span>
        <span className="tbp-end is-to">
          <span className="tbp-code">{p.to}</span>
          {p.arr && <span className="tbp-time">{p.arr}</span>}
        </span>
      </div>
    );
  } else if (p.kind === 'stay') {
    head = (
      <>
        <span className="tbp-brand">
          <span className="tbp-glyph"><BedIcon size={16} /></span>
          <span className="tbp-brand-name">{p.what}</span>
        </span>
        <span className="tbp-when">{t(p.nights === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n: p.nights })}</span>
      </>
    );
    ends = (
      <>
        <span className="tbp-place">{p.city}</span>
        <div className="tbp-ends is-dates">
          <span className="tbp-end">
            <span className="tbp-k">{t('tp.pass.in')}</span>
            <span className="tbp-date">{day(p.checkin)}</span>
          </span>
          <span className="tbp-line is-quiet" aria-hidden="true" />
          <span className="tbp-end is-to">
            <span className="tbp-k">{t('tp.pass.out')}</span>
            <span className="tbp-date">{day(p.checkout)}</span>
          </span>
        </div>
      </>
    );
  } else {
    const Icon = MODE_ICON[p.mode] || TrainIcon;
    head = (
      <>
        <span className="tbp-brand">
          <span className="tbp-glyph"><Icon size={16} /></span>
          <span className="tbp-brand-name">{row.title}</span>
        </span>
        <span className="tbp-when">{day(p.date)}</span>
      </>
    );
    ends = (
      <div className="tbp-ends is-towns">
        <span className="tbp-end"><span className="tbp-town">{p.from}</span></span>
        <span className="tbp-line" aria-hidden="true"><Icon size={16} /></span>
        <span className="tbp-end is-to"><span className="tbp-town">{p.to}</span></span>
      </div>
    );
  }

  return (
    <article className={`tbp-pass is-${p.kind || 'leg'}`} aria-label={[row.title, row.sub].filter(Boolean).join(', ')}>
      <div className="tbp-head">{head}</div>
      {ends}
      <div className="tbp-foot">
        <span className="tbp-fig">
          {fig ? (row.yours ? <Money value={row.eur} precision="cents" /> : <Money value={row.eur} est precision="whole" />) : null}
          {fig && row.yours && <small>{t('plan.yours')}</small>}
        </span>
        {row.link && (
          <Button href={row.link.href} external variant="primary" size="sm" className="tbp-book" aria-label={row.link.label}>
            {t('tp.book')}
          </Button>
        )}
      </div>
    </article>
  );
}
