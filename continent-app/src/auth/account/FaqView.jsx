import React, { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Field } from '../../components/ui/index.js';
import { FeedbackIcon, SearchIcon } from '../../components/Icons.jsx';
import { TIERS, formatPrice } from '../../lib/pricing.js';
import { CONTACT } from '../../lib/contact.js';

/**
 * Common questions (T461), written from what a traveller asks rather than
 * what Carta measures: no catalogue counts, no method paragraphs. Four groups,
 * a search that filters as you type, and native disclosure rows, so every
 * question opens with the keyboard and a screen reader for free. Figures in
 * the answers come from lib/pricing.js, never typed into a string.
 */
export const FAQ = [
  { group: 'account.fqgPlanning', items: ['different', 'plan', 'together', 'book', 'missing'] },
  { group: 'account.fqgPrices', items: ['day', 'est', 'lifestyle', 'flights'] },
  { group: 'account.fqgPasses', items: ['adds', 'difference', 'cancel', 'refund'] },
  { group: 'account.fqgAccount', items: ['need', 'where', 'delete'] },
];

export function FaqView({ onFeedback }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const vars = useMemo(() => ({
    freePlans: TIERS.free.aiPlans,
    tripPrice: formatPrice(TIERS.trip.priceCents),
    tripDays: TIERS.trip.periodDays,
    yearPrice: formatPrice(TIERS.year.priceCents),
    email: CONTACT,
  }), []);
  // "What does a pass add?" opens with the one sentence about what is free
  // (roadmap 1.15 point 6), read from its own key so it can never drift.
  const answer = (k) => (k === 'adds'
    ? `${t('pass.freeSentence')} ${t('account.fq.addsA', vars)}`
    : t(`account.fq.${k}A`, vars));
  const needle = q.trim().toLowerCase();
  const groups = FAQ.map((g) => ({
    ...g,
    rows: g.items
      .map((k) => ({ k, q: t(`account.fq.${k}Q`), a: answer(k) }))
      .filter((r) => !needle || r.q.toLowerCase().includes(needle) || r.a.toLowerCase().includes(needle)),
  })).filter((g) => g.rows.length);
  // A search that leaves two questions or fewer opens them.
  const few = !!needle && groups.reduce((n, g) => n + g.rows.length, 0) <= 2;

  return (
    <div className="panel-section acct-faq">
      <div className="acct-search">
        <span className="acct-search-icon" aria-hidden="true"><SearchIcon size={18} /></span>
        <Field
          type="search"
          label={t('account.faqSearch')}
          hideLabel
          placeholder={t('account.faqSearchPh')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          // Escape clears a search before it closes Account.
          onKeyDown={(e) => { if (e.key === 'Escape' && q) { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation?.(); setQ(''); } }}
        />
      </div>
      {groups.length === 0 && (
        <p className="acct-empty" role="status">{t('account.faqNone', { q: q.trim() })}</p>
      )}
      {groups.map((g) => (
        <div className="account-faq-group" key={g.group}>
          <h2 className="acct-group-title" id={`fq-${g.group}`}>{t(g.group)}</h2>
          <div className="account-faq">
            {g.rows.map((r) => (
              <details className="account-faq-item" key={r.k} open={few ? true : undefined}>
                <summary className="account-faq-q">{r.q}</summary>
                <p className="account-faq-a">{r.a}</p>
              </details>
            ))}
          </div>
        </div>
      ))}
      <div className="acct-faq-foot">
        <Button variant="quiet" iconStart={<FeedbackIcon size={18} />} onClick={onFeedback}>
          {t('account.faqAsk')}
        </Button>
      </div>
    </div>
  );
}
