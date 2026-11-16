/*
 * Rail and RailCard (G1, house style 2026-11, DESIGN.md "Rails"): the row
 * of large rounded photo cards (Top rated in Europe, Hiking bases, Hidden
 * gems). The head: the title left, "See all" in umber and two round arrow
 * buttons right. A card: the photo (16 px corners; a missing photo is the
 * world tile), the name with its Score plate, the flag and country (and the
 * hidden gem mark), then the formation. Text never sits on the photo; the
 * save button is a paper disc.
 *
 * It keeps every behaviour of browse/StoryRail.jsx (owner rule: no function
 * removed): the section is labelled by its heading; the arrows carry the same
 * labels (explore.railPrev, explore.railNext) and are disabled at the ends
 * (the same strip-position logic); ArrowLeft and ArrowRight move focus card
 * to card and bring the card into view; "See all" is a real button (or a
 * link when the caller gives an href).
 *
 *   <Rail id="rail-hiking" title="Hiking bases" onSeeAll={...}>
 *     <RailCard href=... photo=... name="Hallstatt" score={9.6}
 *       where={<><CountryFlag country="AT" /> Austria</>} formation={<Formation ... weighted />}
 *       action={<IconButton ... />} />
 *   </Rail>
 */
import React, { useCallback, useId, useRef } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { scrollBehavior } from '../../lib/motion.js';
import { useStripPosition } from '../../lib/useStripPosition.js';
import { Button } from './Button.jsx';
import { ScorePlate } from './Plate.jsx';
import { WorldTile } from './StateBlock.jsx';
import { HouseIcon } from '../HouseIcons.jsx';

export function Rail({ id, title, headingLevel = 2, seeAllHref, onSeeAll, seeAllLabel, className = '', children }) {
  const { t } = useI18n();
  const auto = useId();
  const headId = id || `rail-${auto.replace(/[^a-zA-Z0-9]/g, '')}`;
  const ref = useRef(null);
  const count = React.Children.toArray(children).filter(Boolean).length;
  const pos = useStripPosition(ref, count);
  const step = useCallback((dir) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: scrollBehavior() });
  }, []);
  const onKeyDown = (e) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
    const hits = [...(ref.current?.querySelectorAll('.hs-rcard-link') || [])];
    const at = hits.indexOf(document.activeElement);
    if (at < 0) return;
    const next = hits[at + dir];
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    next.closest('.hs-rcard')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() });
  };
  const H = `h${headingLevel}`;
  const seeAll = seeAllLabel || t('rail.seeAllPlain');
  return (
    <section className={`hs-rail-sec ${className}`.trim()} aria-labelledby={headId}>
      <div className="hs-rail-head">
        <H id={headId}>{title}</H>
        {seeAllHref ? (
          <a className="hs-see-all" href={seeAllHref} onClick={onSeeAll}>{seeAll}</a>
        ) : onSeeAll ? (
          <Button variant="quiet" size="sm" className="hs-see-all" onClick={onSeeAll}>{seeAll}</Button>
        ) : null}
        <span className="hs-rail-arrows">
          <RoundButton label={t('explore.railPrev')} onClick={() => step(-1)} disabled={pos.atStart} flip />
          <RoundButton label={t('explore.railNext')} onClick={() => step(1)} disabled={pos.atEnd} />
        </span>
      </div>
      <div className="hs-rail" ref={ref} role="list" onKeyDown={onKeyDown}
        aria-label={typeof title === 'string' ? title : undefined}>
        {children}
      </div>
    </section>
  );
}

function RoundButton({ label, onClick, disabled = false, flip = false }) {
  return (
    <button type="button" className="hs-round" aria-label={label} onClick={onClick} disabled={disabled}>
      <HouseIcon.next size={18} className={flip ? 'is-flipped' : ''} />
    </button>
  );
}

export function RailCard({ href, onOpen, photo, photoAlt = '', world, name, score, scoreLabel, where, gem, formation, action }) {
  const onClick = onOpen ? (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(e);
  } : undefined;
  return (
    <article className="hs-rcard" role="listitem">
      <a className="hs-rcard-link" href={href} onClick={onClick}>
        <span className="hs-rcard-photo">
          {photo ? <img src={photo} alt={photoAlt} loading="lazy" decoding="async" /> : <WorldTile world={world} />}
        </span>
        <span className="hs-rcard-head">
          <span className="hs-rcard-name">{name}</span>
          <ScorePlate value={score} label={scoreLabel} />
        </span>
        {(where || gem) && <span className="hs-rcard-where">{where}{gem && <span className="hs-gem">{gem}</span>}</span>}
        {formation}
      </a>
      {action && <span className="hs-rcard-save">{action}</span>}
    </article>
  );
}
