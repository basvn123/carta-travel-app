/*
 * Card (T422): one anatomy for every object Carta lists (a place, a trail, a
 * beach, a trip, a saved item).
 *
 * Layouts
 *   row   the compact default (owner decision 2026-10-13): a 72 px rounded
 *         photo at the start, then title, meta and the price line, about ten
 *         to a phone screen
 *   tile  a photo on top for rails and the home page, where inspiration leads
 *
 * Slots, in this fixed order: media, title, meta, rating, price, actions. The
 * price slot takes a <Money> (T423) so every card prints the same notation.
 *
 * The whole card opens its page through one real link or button on the title,
 * stretched over the card (no nested interactive elements). Actions such as a
 * save heart sit above the stretch and stay their own controls.
 */
import React from 'react';

export function Card({
  layout = 'row', media = null, title, href, onOpen, meta = null, rating = null, price = null,
  actions = null, selected = false, as = 'article', className = '', ...rest
}) {
  const Tag = as;
  const cls = ['card', `card-${layout === 'tile' ? 'tile' : 'row'}`, (href || onOpen) && 'is-interactive',
    selected && 'is-selected', className].filter(Boolean).join(' ');
  const opener = href
    ? <a className="card-open" href={href} onClick={onOpen}>{title}</a>
    : onOpen
      ? <button type="button" className="card-open" onClick={onOpen}>{title}</button>
      : <span>{title}</span>;
  return (
    <Tag className={cls} {...rest}>
      {media && <div className="card-media">{media}</div>}
      <div className="card-body">
        <h3 className="card-title">{opener}</h3>
        {meta && <div className="card-meta">{meta}</div>}
        {(rating || price) && (
          <div className="card-figures">
            {price && <div className="card-price">{price}</div>}
            {rating && <div className="card-rating">{rating}</div>}
          </div>
        )}
      </div>
      {actions && <div className="card-actions">{actions}</div>}
    </Tag>
  );
}
