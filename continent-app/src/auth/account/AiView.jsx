import React from 'react';
import { useI18n } from '../../i18n/index.jsx';

/**
 * AI and booking reader (T936): what Carta sends to Google's Gemini, in
 * plain words, read from the code that sends it.
 *
 *   plan-day       src/planner/DayPlannerTab.jsx requestAiDayPlan: the
 *                  place, the date and days, the group size, the answers
 *                  (pace, mood, hills, what was typed) and candidate stops
 *                  from Carta's catalogue
 *   suggest-city   the same answers and nearby catalogue towns
 *   parse-booking  the dropped confirmations (PDF, photo or text) and the
 *                  trip's stops and dates; names and contact details are
 *                  excluded from the result, which is cached 24 hours
 *                  (supabase/functions/parse-booking header)
 *
 * The calls go through Carta's own Edge Functions, which hold the key; the
 * account's name, email and password are not in any payload.
 */
const PARTS = [
  ['ac.aiPlanH', 'ac.aiPlanP'],
  ['ac.aiWhereH', 'ac.aiWhereP'],
  ['ac.aiBookH', 'ac.aiBookP'],
  ['ac.aiNotH', 'ac.aiNotP'],
];

export function AiView({ head }) {
  const { t } = useI18n();
  return (
    <>
      {head}
      <div className="ac-doc">
        {PARTS.map(([h, p]) => (
          <section key={h} aria-labelledby={`ac-${h.replace('.', '-')}`}>
            <h2 className="ac-doc-h" id={`ac-${h.replace('.', '-')}`}>{t(h)}</h2>
            <p>{t(p)}</p>
          </section>
        ))}
      </div>
    </>
  );
}
