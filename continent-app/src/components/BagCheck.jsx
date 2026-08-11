import React from 'react';
import { bagRuleFor } from '../lib/baggagePolicies.js';
import { carrierName } from '../lib/carriers.js';
import { useI18n } from '../i18n/index.jsx';
import { LuggageIcon, CheckIcon, AlertIcon } from './Icons.jsx';

/** One direction's allowance as a sentence body ("a 10 kg trolley (55 x 40 x
 *  20 cm) plus the small personal bag"). */
function allowanceText(t, rule) {
  if (rule.tier === 'cabin10') {
    return t('itin.bagCabin10', { kg: rule.allowance.kg, dims: rule.allowance.dims });
  }
  if (rule.tier === 'checked') {
    return t('itin.bagChecked', { kg: rule.allowance.kg, dims: rule.personal.dims });
  }
  return t('itin.bagPersonal', { dims: rule.allowance.dims });
}

/**
 * The bag rules panel under the receipt: the chosen baggage tier translated
 * into each leg's airline's real allowance (Ryanair and Wizz Air do not agree
 * on a single centimetre), plus the gate fee that a too-big bag risks. Renders
 * once per trip; when the two legs fly the same carrier it collapses to one
 * line so the panel stays quiet.
 */
export function BagCheck({ flight }) {
  const { t } = useI18n();
  if (!flight?.combinable) return null;
  const out = bagRuleFor(flight.into_carrier, flight.baggage);
  const home = bagRuleFor(flight.out_of_carrier, flight.baggage);
  const same = out.carrier === home.carrier;
  const gateFee = Math.max(out.gateFeeEur, home.gateFeeEur);
  return (
    <div className="bag-check">
      <div className="bag-check-title">
        <LuggageIcon size={12} /> {t('itin.bagCheckTitle')}
      </div>
      {same ? (
        <p className="bag-check-line">
          <CheckIcon size={11} className="bag-check-ok" />
          {t('itin.bagBothWays', { carrier: carrierName(out.carrier) })}: {allowanceText(t, out)}.
        </p>
      ) : (
        <>
          <p className="bag-check-line">
            <CheckIcon size={11} className="bag-check-ok" />
            {t('itin.bagOut', { carrier: carrierName(out.carrier) })}: {allowanceText(t, out)}.
          </p>
          <p className="bag-check-line">
            <CheckIcon size={11} className="bag-check-ok" />
            {t('itin.bagHome', { carrier: carrierName(home.carrier) })}: {allowanceText(t, home)}.
          </p>
        </>
      )}
      <p className="bag-check-line bag-check-warn">
        <AlertIcon size={11} />
        {t('itin.bagGateFee', { fee: gateFee })}
      </p>
    </div>
  );
}
