/*
 * CarouselArrows (T1121, roadmap G2): the previous and next arrows every
 * carousel and rail draws, built once. PhotoGallery's strip, mosaic and tile
 * carousels (T1024-c), the country gallery, the item track and the Explore
 * section rails each wrote this pair out by hand. The class root stays each
 * carousel's own (destp-gallery-arrow, pmos-arrow, tphotos-arrow, dgal-arrow,
 * itrack-arrow, dtab-arrow), so its placement in the stylesheet is unchanged;
 * the button is IconButton with one chevron, turned for "previous" by the
 * stylesheet (.is-prev).
 *
 * Props
 *   className    the carousel's arrow class root
 *   tone         IconButton tone: photo (default), surface or plain
 *   index, count the slide in view and how many there are: the ends disable
 *   atStart, atEnd  set the ends directly instead (a rail that scrolls by pixels);
 *                with neither index nor these, the arrows never disable (a loop)
 *   onStep       (dir, event) with dir -1 or 1
 *   size         the chevron's size
 *   prevLabel, nextLabel  the accessible names (default "Previous photo", "Next photo")
 *   controls     the id of the track they move (aria-controls)
 *   pointerOnly  hidden from assistive tech and out of the tab order, for a
 *                tile whose link is its keyboard door
 */
import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { IconButton } from './IconButton.jsx';
import { ChevronRightIcon } from '../Icons.jsx';

export function CarouselArrows({
  className, tone = 'photo', index, count, atStart, atEnd, onStep, size = 16,
  prevLabel, nextLabel, controls, pointerOnly = false,
}) {
  const { t } = useI18n();
  const extra = {
    ...(pointerOnly ? { tabIndex: -1, 'aria-hidden': 'true' } : {}),
    ...(controls ? { 'aria-controls': controls } : {}),
  };
  const first = atStart ?? (index != null ? index === 0 : undefined);
  const last = atEnd ?? (index != null && count != null ? index >= count - 1 : undefined);
  return (
    <>
      <IconButton tone={tone} className={`${className} is-prev`} label={prevLabel || t('dest.photoPrev')} {...extra}
        onClick={(e) => onStep(-1, e)} disabled={first}>
        <ChevronRightIcon size={size} />
      </IconButton>
      <IconButton tone={tone} className={`${className} is-next`} label={nextLabel || t('dest.photoNext')} {...extra}
        onClick={(e) => onStep(1, e)} disabled={last}>
        <ChevronRightIcon size={size} />
      </IconButton>
    </>
  );
}
