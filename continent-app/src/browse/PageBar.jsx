import React from 'react';
import { Button, IconButton } from '../components/ui/index.js';
import { ArrowLeftIcon, CheckIcon, ShareIcon } from '../components/Icons.jsx';
import { SaveButton } from './ExploreCards.jsx';

/**
 * PageBar (T474, row T435-e): the one bar every full-screen page wears, the
 * destination, item, trip, journey and region pages alike (carta-design
 * "Navigation" and "Detail page grammar").
 *
 *   back    a quiet button that names the list it returns to ("Trails",
 *           "Explore"), on a phone and a desktop alike; never a bare arrow
 *           on one size and a cross on the other
 *   name    the page's name, shown only once its heading has scrolled away
 *           (`nameOn`), so the two never sit on screen saying the same thing
 *   save    the shortlist control, when the page's kind can be kept
 *   share   copies or shares the page's address, with a tick once it has
 *
 * The bar is marked data-page-bar so the arrival rule (usePageArrival) can
 * find its first control. Styles: .ipage-bar in 70-item-pages.css.
 */
export function PageBar({
  backLabel, onBack, backRef = null, name = '', nameOn = false,
  fav = false, onFav = null, onShare = null, shareLabel = '', copied = false, copiedLabel = '',
  t, className = '',
}) {
  return (
    <div className={`tpage-bar ipage-bar ${className}`.trim()} data-page-bar>
      <Button variant="quiet" className="tpage-back ipage-back" onClick={onBack} ref={backRef}
        iconStart={<ArrowLeftIcon size={20} />}>
        {backLabel}
      </Button>
      <span className={`tpage-bar-title ipage-bar-title${nameOn ? ' on' : ''}`} aria-hidden={nameOn ? undefined : 'true'}>
        {name}
      </span>
      <div className="ipage-bar-acts">
        {onFav && <SaveButton fav={fav} onToggle={onFav} t={t} name={name} />}
        {onShare && (
          <IconButton className="tpage-bar-act" onClick={onShare} label={copied ? (copiedLabel || shareLabel) : shareLabel}>
            {copied ? <CheckIcon size={18} /> : <ShareIcon size={18} />}
          </IconButton>
        )}
      </div>
    </div>
  );
}
