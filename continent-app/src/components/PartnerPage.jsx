import React from 'react';
import { LegalDoc } from './LegalDoc.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * Partner links (I15, T1172): the disclosure page, at /?legal=partner. Says in
 * plain words which links can earn, what Carta promises about them and what it
 * does not do (no cookie, no partner script). The note above every group of
 * partner links points here. Six languages, keys partner.*.
 */
const RULES = ['figure', 'door', 'order', 'count'];

export function PartnerPage({ onClose }) {
  const { t } = useI18n();
  return (
    <LegalDoc id="legal-partner" title={t('partner.title')} onClose={onClose} contentsLabel={t('ac2.contents')}>
      <p>{t('partner.intro')}</p>
      {RULES.map((k) => (
        <React.Fragment key={k}>
          <h3>{t(`partner.${k}H`)}</h3>
          <p>{t(`partner.${k}P`)}</p>
        </React.Fragment>
      ))}
    </LegalDoc>
  );
}

export default PartnerPage;
