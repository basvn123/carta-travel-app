import React, { useId, useMemo, useState } from 'react';
import { useI18n, LANGUAGES } from '../i18n/index.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { TIERS, formatPrice } from '../lib/pricing.js';
import { Button } from '../components/ui/index.js';
import { ArrowRightIcon, CheckIcon, TicketIcon } from '../components/Icons.jsx';
import {
  passMomentOn, readLater, hideForLater, showPassMoment, momentLines, LATER_DAYS,
} from './passMoment.js';
import './PassMoment.css';

function store(kind) {
  try { return typeof window === 'undefined' ? null : window[kind]; } catch { return null; }
}

/**
 * The Pass moment (T1171, ROADMAP I14): where the paywall meets the journey.
 *
 * One Carta card under the trip's route, once the trip is priced. Two bands:
 * what stays free (lagoon, "fits") and what a Trip Pass adds (umber, with its
 * price and days from pricing.js), then a foot strip with the one primary,
 * "See the Trip Pass" (the pass sheet, which closes back to the trip), and a
 * "Not now" as easy to reach. Nothing is blocked and nothing opens by itself:
 * the trip carries on free under it either way. Behind PASS_MOMENT (off) or
 * the ?pm=on preview; rules in pass/passMoment.js.
 */
export function PassMoment({ priced }) {
  const { t, lang } = useI18n();
  const paywall = usePaywall();
  const locale = (LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).bcp47;
  const on = useMemo(() => passMomentOn(typeof window === 'undefined' ? '' : window.location.search, store('sessionStorage')), []);
  const [later, setLater] = useState(() => readLater(store('localStorage')));
  const [justHidden, setJustHidden] = useState(false);

  if (justHidden) {
    return (
      <p className="pm-hidden" role="status" data-testid="pass-moment-hidden">
        {t('paywall.hidden', { days: LATER_DAYS })}
      </p>
    );
  }
  if (!showPassMoment({ on, priced, paid: paywall.paid, later })) return null;

  return <PassMomentCard locale={locale} onSee={() => paywall.openPrices('browse')}
    onLater={() => { setLater(hideForLater(store('localStorage'))); setJustHidden(true); }} />;
}

/**
 * The card itself, without the rules: what PassMoment draws when it shows.
 * Apart so a test and the verify script can render it with no paywall.
 */
export function PassMomentCard({ locale, onSee, onLater }) {
  const { t } = useI18n();
  const uid = useId();
  const { free, pass } = momentLines(TIERS);
  const price = formatPrice(TIERS.trip.priceCents, locale);

  return (
    <section className="pm" aria-labelledby={`${uid}-h`} data-testid="pass-moment">
      <div className="pm-main">
        <h2 className="pm-title" id={`${uid}-h`}>{t('paywall.title')}</h2>
        <div className="pm-cols">
          <div className="pm-col is-free">
            <h3 className="pm-col-h">{t('paywall.freeHead')}</h3>
            <ul className="pm-list">
              {free.map((l) => (
                <li key={l.key}><span className="pm-mark" aria-hidden="true"><CheckIcon size={14} /></span><span>{t(l.key, l.vars)}</span></li>
              ))}
            </ul>
          </div>
          <div className="pm-col is-pass">
            <h3 className="pm-col-h">
              <span className="pm-col-icon" aria-hidden="true"><TicketIcon size={16} /></span>
              {t('paywall.passHead', { price, days: TIERS.trip.periodDays })}
            </h3>
            <ul className="pm-list">
              {pass.map((l) => (
                <li key={l.key}><span className="pm-mark" aria-hidden="true"><CheckIcon size={14} /></span><span>{t(l.key, l.vars)}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="pm-foot">
        <p className="pm-foot-line">
          <strong>{t('paywall.footBold')}</strong>
          <span>{t('paywall.footNote')}</span>
        </p>
        <div className="pm-acts">
          <Button variant="quiet" className="pm-later" onClick={onLater}>
            {t('paywall.later')}
          </Button>
          <Button variant="primary" className="pm-see" iconEnd={<ArrowRightIcon size={18} />} onClick={onSee}>
            {t('paywall.see')}
          </Button>
        </div>
      </div>
    </section>
  );
}
