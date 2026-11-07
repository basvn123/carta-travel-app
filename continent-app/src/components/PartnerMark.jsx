import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import '../styles/99-partner.css';
import { PARTNER_PAGE_HREF, isPartnerLink, anyPartner } from '../lib/partnerLink.js';

/**
 * The small "partner link" mark that sits after a partner link's label (I15).
 * Renders nothing for a plain link, so a build with no partner ids shows no
 * mark. Decoration only (the anchor itself carries rel="sponsored"), with the
 * meaning in the title for pointer users and in the note for everyone.
 */
export function PartnerMark({ href }) {
  const { t } = useI18n();
  if (!isPartnerLink(href)) return null;
  return <small className="partner-mark" title={t('partner.markTip')}>{t('partner.mark')}</small>;
}

/**
 * The disclosure line that comes BEFORE the links (EU guidance: before the
 * click, not after). One per group of links; hidden when none of them earns.
 */
export function PartnerNote({ links, className = '' }) {
  const { t } = useI18n();
  if (!anyPartner(links)) return null;
  return (
    <p className={`partner-note ${className}`.trim()}>
      {t('partner.note')}{' '}
      <a href={PARTNER_PAGE_HREF} target="_blank" rel="noopener noreferrer">{t('partner.how')}</a>
    </p>
  );
}
