/*
 * Rail and RailCard (G1, house style 2026-11, DESIGN.md "Rails"): the row
 * of large rounded photo cards (Top rated in Europe, Hiking bases, Hidden
 * gems). The head: the title left, "See all" in umber and two round arrow
 * buttons right (the arrows from 1024 px; touch scrolls). A card: the photo
 * (16 px corners; a missing photo is the world tile), the name with its
 * Score plate, the flag and country (and the hidden gem mark), then the
 * formation. Text never sits on the photo; the save button is a paper disc.
 *
 *   <Rail title="Hiking bases" onSeeAll={...} seeAllHref="...">
 *     <RailCard href=... photo=... name="Hallstatt" score={9.6}
 *       where={<><CountryFlag cc="AT" /> Austria</>} formation={<Formation ... />}
 *       action={<SaveButton ... />} />
 *   </Rail>
 */
import React, { useCallback, useRef } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { scrollBehavior } from '../../lib/motion.js';
import { ScorePlate } from './Plate.jsx';
import { WorldTile } from './StateBlock.jsx';
import { HouseIcon } from '../HouseIcons.jsx';

export function Rail({ title, headingLevel = 2, seeAllHref, onSeeAll, seeAllLabel, className = '', children }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const step = useCallback((dir) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: scrollBehavior() });
  }, []);
  const H = `h${headingLevel}`;
  const seeAll = seeAllLabel || t('rail.seeAllPlain');
  return (
    <section className={`hs-rail-sec ${className}`.trim()}>
      <div className="hs-rail-head">
        <H>{title}</H>
        {seeAllHref ? (
          <a className="hs-see-all" href={seeAllHref} onClick={onSeeAll}>{seeAll}</a>
        ) : onSeeAll ? (
          <a className="hs-see-all" href="#" onClick={(e) => { e.preventDefault(); onSeeAll(e); }}>{seeAll}</a>
        ) : null}
        <span className="hs-rail-arrows">
          <RoundButton label={t('dest.photoPrev')} onClick={() => step(-1)} flip />
          <RoundButton label={t('dest.photoNext')} onClick={() => step(1)} />
        </span>
      </div>
      <div className="hs-rail" ref={ref} role="list">{children}</div>
    </section>
  );
}

function RoundButton({ label, onClick, flip = false }) {
  return (
    <button type="button" className="hs-round" aria-label={label} onClick={onClick}>
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
