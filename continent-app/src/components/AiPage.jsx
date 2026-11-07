import React from 'react';
import { LegalDoc } from './LegalDoc.jsx';
import { useI18n } from '../i18n/index.jsx';
import { SUPPORT_EMAIL } from '../lib/contact.js';

/**
 * How Carta uses AI (T1156, ROADMAP F8): the public page for the four places a
 * model runs (Ask Carta, day plans, town suggestions, booking import), which
 * model and provider, what each cannot do, how it is checked, how to report a
 * wrong answer and the EU AI Act transparency points. Opens at /?legal=ai,
 * like the support page. English only for now (the other languages fall back
 * to it, register row T1156-b).
 *
 * Every figure is copied from a task report, not computed here:
 *   Ask: T1136 and T1141 (docs/HANDBOOK.md, Ask Carta item 12): 200 questions,
 *        rules hit@10 0.930, recall@10 0.568, grounding 0.996 of 689 checks,
 *        abstention 25 of 30 caught and 2 false refusals.
 *   Plan-day: T1148: 20 test towns, 20 of 20 reference plans meet the rules,
 *        judge kappa 0.898 against the rules on 40 plans, not yet against humans.
 *   Parity: T1145 (docs/data/coverage-parity.md): 43 countries, 310 regions.
 * Model and provider names follow supabase/functions/_shared/aiModels.mjs.
 * The detail lives in docs/ai/model-card-*.md; a figure changed there changes here.
 */
const FEATURES = ['ask', 'plan', 'city', 'book'];
const PARTS = {
  ask: ['Does', 'Model', 'Cannot', 'Checked', 'Numbers'],
  plan: ['Does', 'Model', 'Cannot', 'Checked', 'Numbers'],
  city: ['Does', 'Model', 'Cannot'],
  book: ['Does', 'Model', 'Cannot'],
};

export function AiPage({ onClose }) {
  const { t } = useI18n();
  const mail = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('aiPage.mailSubject'))}`;
  return (
    <LegalDoc id="legal-ai" title={t('aiPage.title')} onClose={onClose}>
      <p>{t('aiPage.intro')}</p>
      <p><em>{t('aiPage.updated')}</em></p>

      <h3>{t('aiPage.notAiH')}</h3>
      <p>{t('aiPage.notAiP')}</p>

      {FEATURES.map((f) => (
        <React.Fragment key={f}>
          <h3>{t(`aiPage.${f}H`)}</h3>
          {PARTS[f].map((part) => <p key={part}>{t(`aiPage.${f}${part}`)}</p>)}
        </React.Fragment>
      ))}

      <h3>{t('aiPage.wrongH')}</h3>
      <p>{t('aiPage.wrongP')}</p>
      <p><a href={mail}>{t('aiPage.wrongLink')}</a></p>
      <p>{t('aiPage.humanP')}</p>

      <h3>{t('aiPage.dataH')}</h3>
      <p>{t('aiPage.dataP')}</p>

      <h3>{t('aiPage.actH')}</h3>
      <p>{t('aiPage.actP')}</p>

      <h3>{t('aiPage.fairH')}</h3>
      <p>{t('aiPage.fairP')}</p>

      <h3>{t('aiPage.cardsH')}</h3>
      <p>{t('aiPage.cardsP')}</p>
    </LegalDoc>
  );
}

export default AiPage;
