import React from 'react';
import { LegalDoc } from './LegalDoc.jsx';
import { useI18n } from '../i18n/index.jsx';
import { SUPPORT_EMAIL } from '../lib/contact.js';
import { PRESS_FOUNDER_LINE, PRESS_LOGO, PRESS_SCREENSHOT } from '../lib/press.js';
import facts from '../data/pressFacts.json';

/**
 * Press kit (T1131, K10): what Carta is, who it is for, the founder line
 * (placeholder until the owner fills lib/press.js), key facts with real counts
 * (src/data/pressFacts.json, built by scripts/press/build-facts.mjs from the
 * shipped data), a logo and a screenshot that are Carta's own, and the contact
 * line (the T1108 SUPPORT_EMAIL). Opens at /?legal=press, like the support page.
 */
const FACTS = [
  ['destinations', 'destinations'],
  ['countries', 'countries'],
  ['airports', 'airports'],
  ['trips', 'trips'],
  ['languages', 'languages'],
];

export function PressKitPage({ onClose }) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang);
  const subject = encodeURIComponent(t('press.mailSubject'));
  return (
    <LegalDoc id="legal-press" title={t('press.title')} onClose={onClose} contentsLabel={t('ac2.contents')}>
      <p>{t('press.intro')}</p>

      <h3>{t('press.whatH')}</h3>
      <p>{t('press.whatP')}</p>
      <p>{t('press.whatP2')}</p>

      <h3>{t('press.whoH')}</h3>
      <p>{t('press.whoP')}</p>

      <h3>{t('press.founderH')}</h3>
      <p className="press-founder" data-placeholder={PRESS_FOUNDER_LINE ? undefined : 'true'}>
        {PRESS_FOUNDER_LINE || t('press.founderPlaceholder')}
      </p>

      <h3>{t('press.factsH')}</h3>
      <dl className="press-facts">
        {FACTS.map(([k, key]) => (
          <div key={k} className="press-fact">
            <dt>{t(`press.fact.${k}`)}</dt>
            <dd>{nf.format(facts[key])}</dd>
          </div>
        ))}
      </dl>
      <p>{t('press.factsNote', { date: facts.measuredAt })}</p>

      <h3>{t('press.assetsH')}</h3>
      <p>{t('press.assetsP')}</p>
      <figure className="press-asset">
        <img src={PRESS_LOGO} alt={t('press.logoAlt')} width="64" height="64" loading="lazy" />
        <figcaption><a href={PRESS_LOGO} download>{t('press.logoDl')}</a></figcaption>
      </figure>
      <figure className="press-asset">
        <img src={PRESS_SCREENSHOT} alt={t('press.shotAlt')} loading="lazy" style={{ maxWidth: '100%', height: 'auto' }} />
        <figcaption><a href={PRESS_SCREENSHOT} download>{t('press.shotDl')}</a></figcaption>
      </figure>

      <h3>{t('press.contactH')}</h3>
      <p>{t('press.contactP')}</p>
      <p>
        <a className="support-mail" href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`}>{SUPPORT_EMAIL}</a>
      </p>
    </LegalDoc>
  );
}

export default PressKitPage;
