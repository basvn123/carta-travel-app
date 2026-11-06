import React, { useEffect, useState } from 'react';
import { LegalDoc } from './LegalDoc.jsx';
import { useI18n } from '../i18n/index.jsx';
import { SUPPORT_EMAIL } from '../lib/contact.js';
import { TIERS, formatPrice } from '../lib/pricing.js';
import { loadStatus, parseStatus } from '../lib/statusFile.js';

/**
 * Help and contact (T1108, I9): one reading page for a traveller who needs a
 * person. Three parts: how to write to us, whether anything is down right now
 * (the same status.json the banner reads, T1056), and answers built from what
 * the product really does. Refund answers follow the Refunds section of the
 * Terms and docs/runbooks/refund.md; figures come from lib/pricing.js.
 * Opens at /?legal=support, like the legal texts.
 */
const SUPPORT_FAQ = [
  { group: 'support.gPrices', items: ['prices', 'sources', 'est'] },
  { group: 'support.gAccount', items: ['account', 'delete'] },
  { group: 'support.gPay', items: ['pay', 'cancel', 'refund'] },
];

export function SupportPage({ onClose }) {
  const { t, lang } = useI18n();
  // undefined: still asking; null: nothing to report (or the file is not
  // reachable, which the page treats as "no known problems", like the banner).
  const [notice, setNotice] = useState(undefined);
  useEffect(() => {
    let live = true;
    loadStatus().then((raw) => { if (live) setNotice(parseStatus(raw, { lang })); });
    return () => { live = false; };
  }, [lang]);

  const vars = {
    tripPrice: formatPrice(TIERS.trip.priceCents),
    tripDays: TIERS.trip.periodDays,
    yearPrice: formatPrice(TIERS.year.priceCents),
    email: SUPPORT_EMAIL,
  };
  const subject = encodeURIComponent(t('support.mailSubject'));

  return (
    <LegalDoc id="legal-support" title={t('support.title')} onClose={onClose} contentsLabel={t('ac2.contents')}>
      <p>{t('support.intro')}</p>

      <h3>{t('support.contactH')}</h3>
      <p>{t('support.contactP')}</p>
      <p>
        <a className="support-mail" href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`}>{SUPPORT_EMAIL}</a>
      </p>
      <p>{t('support.contactTip')}</p>

      <h3>{t('support.statusH')}</h3>
      <p role="status" className="support-status" data-tone={notice ? notice.tone : 'ok'}>
        {notice === undefined ? t('support.statusLoading') : notice ? notice.text : t('support.statusOk')}
      </p>
      <p>{t('support.statusP')}</p>

      <h3>{t('support.faqH')}</h3>
      {SUPPORT_FAQ.map((g) => (
        <React.Fragment key={g.group}>
          <h4 className="support-group">{t(g.group)}</h4>
          <div className="account-faq">
            {g.items.map((k) => (
              <details className="account-faq-item" key={k}>
                <summary className="account-faq-q">{t(`support.fq.${k}Q`)}</summary>
                <p className="account-faq-a">{t(`support.fq.${k}A`, vars)}</p>
              </details>
            ))}
          </div>
        </React.Fragment>
      ))}
    </LegalDoc>
  );
}

export default SupportPage;
