import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip } from '../../components/ui/index.js';
import { CheckIcon } from '../../components/Icons.jsx';
import { TIERS, TIER_ORDER, formatPrice } from '../../lib/pricing.js';
import { tabHref } from '../../lib/urlState.js';
import { fmtDate, plainClick } from './parts.jsx';

/**
 * Plan (T935, the owner-approved spec): the plan held, its price and when it
 * renews or ends, the allowances Carta counts with their reset dates, Change
 * plan and Cancel at the same weight, the plans from the real catalogue
 * (lib/pricing.js TIERS, the client mirror of plan_tiers), and receipts.
 *
 * Only the yearly plan renews, so only it has a Cancel; a Trip Pass is one
 * payment that runs to its end date, and Free has nothing to end. Cancel
 * goes to one screen (CancelView) with the date and two buttons, no survey
 * and no offer before it, wired to the billing function's cancel.
 *
 *   entitlement  useEntitlement's shape (or the ?accountmock fixture's)
 *   actions      { cancel, resume, portal }: lib/billing.js, or the seam's
 *   said         the line a cancel or a resume left, for the status line
 */
function Meter({ label, used, cap, resetsAt, locale }) {
  const { t } = useI18n();
  if (!(cap > 0)) return null;
  const share = Math.max(0, Math.min(1, used / cap));
  const value = resetsAt
    ? t('ac.usedOfResets', { used, cap, date: fmtDate(resetsAt, locale) })
    : t('ac.usedOf', { used, cap });
  return (
    <div className="ac-meter">
      <div className="ac-meter-row">
        <span>{label}</span>
        <b>{value}</b>
      </div>
      <span className="ac-meter-bar" aria-hidden="true">
        <span style={{ transform: `scaleX(${share})` }} />
      </span>
    </div>
  );
}

const FEATURES = {
  free: (t, x) => [t('pass.addPlansTrip', { n: x.aiPlans })],
  trip: (t, x) => [
    t('pass.addPlansTrip', { n: x.aiPlans }), t('pass.addSearches', { n: x.grounded }),
    t('pass.addExports'), t('pass.addTrips'),
  ],
  year: (t, x) => [
    t('pass.addPlansYear', { n: x.aiPlans }), t('pass.addSearches', { n: x.grounded }),
    t('pass.addExports'), t('pass.addTrips'),
  ],
};

export function PlanView({ head, entitlement: e, actions, said, setSaid, onGoCancel, onChangePlan, onPricingPage }) {
  const { t, lang, languages } = useI18n();
  const locale = (languages.find((l) => l.code === lang) || languages[0]).bcp47;
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const tierKey = TIERS[e.tier] ? e.tier : 'free';
  const tier = TIERS[tierKey];
  const sub = e.subscription;
  const yearly = tierKey === 'year' && sub?.live;
  const cancelling = yearly && sub.cancelling;
  const endIso = sub?.renewsAt || e.expiresAt;
  const when = !e.known ? ''
    : yearly && !cancelling ? t('account.planRenews', { date: fmtDate(endIso, locale) })
      : cancelling ? t('account.planEnds', { date: fmtDate(endIso, locale) })
        : tierKey !== 'free' && e.expiresAt ? t('ac.until', { date: fmtDate(e.expiresAt, locale) })
          : '';
  // An allowance resets only on a plan that renews; a Trip Pass ends, and
  // Free's two plans are once for the life of the account.
  const resetsAt = yearly && !cancelling ? (e.resetsAt || endIso) : null;
  const unit = (key) => (key === 'year' ? t('pass.perYearRenews') : key === 'trip' ? t('pass.perOnce') : '');

  const run = async (key) => {
    setBusy(key);
    setErr('');
    setSaid('');
    const res = await actions[key]();
    setBusy('');
    if (!res?.ok || (key === 'portal' && !res.url && !res.mock)) { setErr(t('account.planFailed')); return; }
    if (key === 'resume') setSaid(t('account.planResumed', { date: fmtDate(endIso, locale) }));
    e.refresh?.();
  };

  return (
    <>
      {head}
      {!e.known ? (
        <div className="ac-plancard is-loading" aria-hidden="true" />
      ) : (
        <section className="ac-plancard" aria-labelledby="ac-plan-name">
          <div className="ac-plan-hd">
            <span className="ac-plan-name">
              <b id="ac-plan-name">{t(tier.labelKey)}</b>
              {tierKey !== 'free' && <span>{formatPrice(tier.priceCents, locale)} {unit(tierKey)}</span>}
            </span>
            {when && <Chip kind="status" tone="neutral">{when}</Chip>}
          </div>
          {tierKey === 'free' && <p className="ac-plan-free">{t('pass.freeSentence')}</p>}
          <Meter label={t('ac.meterPlans')} used={e.plansUsed} cap={e.plansCap} resetsAt={resetsAt} locale={locale} />
          <Meter label={t('ac.meterSearches')} used={e.groundUsed} cap={e.groundCap} resetsAt={resetsAt} locale={locale} />
          {err && <p className="acct-error" role="alert">{err}</p>}
          <p className="ac-said" role="status">{said}</p>
          <div className="ac-plan-acts">
            <Button onClick={onChangePlan}>{t('ac.changePlan')}</Button>
            {yearly && !cancelling && (
              <Button onClick={onGoCancel}>{t('account.planCancel')}</Button>
            )}
            {cancelling && (
              <Button loading={busy === 'resume'} onClick={() => run('resume')}>{t('pass.resume')}</Button>
            )}
            {sub && (
              <Button variant="quiet" loading={busy === 'portal'} onClick={() => run('portal')}>{t('ac.receipts')}</Button>
            )}
          </div>
        </section>
      )}

      <section className="ac-group" aria-labelledby="ac-plans-h">
        <h2 className="ac-group-h" id="ac-plans-h">{t('ac.allPlans')}</h2>
        <div className="ac-plans">
          {TIER_ORDER.map((key) => {
            const x = TIERS[key];
            const mine = e.known && key === tierKey;
            return (
              <div key={key} className={`ac-pc${mine ? ' is-mine' : ''}`}>
                <div className="ac-pc-hd">
                  <b>{t(x.labelKey)}</b>
                  {mine ? <Chip kind="status" tone="neutral">{t('ac.yours')}</Chip>
                    : x.featured ? <Chip kind="status" tone="neutral">{t('pass.recommended')}</Chip> : null}
                </div>
                <span className="ac-pc-p">
                  {formatPrice(x.priceCents, locale)}
                  {key !== 'free' && <small>{key === 'trip' ? t('pass.tripNote', { n: x.periodDays }) : unit(key)}</small>}
                </span>
                <ul>
                  {FEATURES[key](t, x).map((f) => <li key={f}><CheckIcon size={16} />{f}</li>)}
                </ul>
                {!mine && key !== 'free' && (
                  <Button size="sm" onClick={onChangePlan}>{t('ac.choose')}</Button>
                )}
              </div>
            );
          })}
        </div>
        {onPricingPage && (
          <a
            className="acct-plan-all"
            href={tabHref('pricing')}
            onClick={(ev) => { if (!plainClick(ev)) return; ev.preventDefault(); onPricingPage(); }}
          >
            {t('pass.seeAll')}
          </a>
        )}
      </section>
    </>
  );
}

/**
 * Cancel the yearly plan (T935): one screen, the date it runs to, then
 * Free, and two buttons. Keep comes first and takes focus; nothing is asked
 * or offered before the confirm (German BGB 312k, the EU withdrawal button).
 */
export function CancelView({ head, entitlement: e, actions, onDone, onKeep }) {
  const { t, lang, languages } = useI18n();
  const locale = (languages.find((l) => l.code === lang) || languages[0]).bcp47;
  const keepRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sub = e.subscription;
  const can = e.known && e.tier === 'year' && sub?.live && !sub.cancelling;
  const date = fmtDate(sub?.renewsAt || e.expiresAt, locale);
  useEffect(() => { if (can) keepRef.current?.focus(); }, [can]);
  useEffect(() => { if (e.known && !can && !busy) onKeep(); }, [e.known, can, busy, onKeep]);
  if (!can) return head;
  const confirm = async () => {
    setBusy(true);
    setErr('');
    const res = await actions.cancel();
    if (!res?.ok) { setBusy(false); setErr(t('account.planFailed')); return; }
    e.refresh?.();
    onDone(t('account.planCancelled', { date }));
  };
  return (
    <>
      {head}
      <section className="ac-plancard" aria-label={t('account.planCancel')}>
        <dl className="ac-cancel">
          <div><dt>{t('ac.keepUntil')}</dt><dd>{date}</dd></div>
          <div><dt>{t('ac.then')}</dt><dd>{t('pass.freeName')}</dd></div>
        </dl>
        {err && <p className="acct-error" role="alert">{err}</p>}
        <div className="ac-plan-acts">
          <Button ref={keepRef} onClick={onKeep}>{t('ac.keep')}</Button>
          <Button variant="danger" loading={busy} onClick={confirm}>{t('ac.confirmCancel')}</Button>
        </div>
      </section>
    </>
  );
}
