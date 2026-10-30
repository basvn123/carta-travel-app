import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { ArrowLeftIcon, CheckIcon, ChevronRightIcon, ShareIcon } from '../../components/Icons.jsx';

/**
 * Where a day sits (T895, the owner's plan days board 2026-10-30): Plan,
 * the trip, the day, each step back one click away, so the Plan overview is
 * never more than one tap from a day (NN/g: a breadcrumb names the levels,
 * the day switcher moves between siblings). Previous and next day and Share
 * sit at the end. On a phone the trip's name gives way first.
 *
 *   tripName, onPlan, onTrip, dayLabel
 *   onPrev, onNext   null at the trip's ends
 *   onShare, copied
 */
export function DayCrumbs({ tripName, onPlan, onTrip, dayLabel, onPrev = null, onNext = null, onShare = null, copied = false }) {
  const { t } = useI18n();
  return (
    <div className="tpage-bar ipage-bar dayc" data-page-bar>
      <nav className="dayc-path" aria-label={t('dayws.crumbsAria')}>
        <ol>
          <li><Button variant="quiet" size="sm" className="dayc-link" onClick={onPlan}>{t('dayws.crumbPlan')}</Button></li>
          {tripName && onTrip && (
            <li className="dayc-trip"><Button variant="quiet" size="sm" className="dayc-link" onClick={onTrip}>{tripName}</Button></li>
          )}
          <li><span className="dayc-here" aria-current="page">{dayLabel}</span></li>
        </ol>
      </nav>
      <div className="ipage-bar-acts dayc-acts">
        <IconButton className="dayc-step" label={t('dayws.dayPrev')} disabled={!onPrev} onClick={onPrev || undefined}><ArrowLeftIcon size={18} /></IconButton>
        <IconButton className="dayc-step" label={t('dayws.dayNext')} disabled={!onNext} onClick={onNext || undefined}><ChevronRightIcon size={18} /></IconButton>
        {onShare && (
          <IconButton className="tpage-bar-act" onClick={onShare} label={t(copied ? 'dayws.linkCopied' : 'dayws.shareLink')}>
            {copied ? <CheckIcon size={18} /> : <ShareIcon size={18} />}
          </IconButton>
        )}
      </div>
    </div>
  );
}
