import React, { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { Button, Money } from '../components/ui/index.js';
import { PartyEditor } from './PartyEditor.jsx';
import { partyText } from '../lib/party.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { formatMoney, formatEst } from '../lib/money.js';
import { tripLines, tripReadiness } from '../lib/tripTotal.js';
import { useLifestyleLabel, useTotalDelta } from './planHooks.js';
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from '../components/Icons.jsx';
import { AirlineMark } from '../components/flights/Flights.jsx';

/**
 * The trip's one price card (T432). The wizard holds it in a sticky side
 * column from 1024 px and behind the footer's figure on a phone; the planned
 * trip holds the same card at the top of its overview. Every figure on it is
 * read from lib/tripTotal.js, so no two screens can say two totals.
 *
 *   figure       the trip total for the party, an estimate, with the figure a
 *                person under it and, for three seconds after a change, what
 *                the last answer did to it
 *   inputs       dates, people and Lifestyle: the three answers that move
 *                every line, each changeable from here at any step
 *   lines        the receipt, each line marked for what it is: Carta's
 *                estimate, the traveller's own figure, or a part only they can
 *                price (their fare), which is named and counted as not in
 *   readiness    how many of the trip's prices are the traveller's own
 */

const LINE_KEY = {
  out: 'itin.secGetThere',
  back: 'itin.secGetHome',
  travel: 'plan.lineTravel',
  drive: 'plan.lineDrive',
  transfers: 'plan.lineTransfers',
  between: 'plan.lineBetween',
  car: 'plan.lineCar',
  beds: 'plan.lineBeds',
  days: 'plan.lineDays',
};

function LineValue({ line, lang, t, onAddFare }) {
  if (line.kind === 'missing') {
    return onAddFare
      ? <Button variant="quiet" size="sm" className="plan-line-add" onClick={onAddFare}>{t('plan.addYourFare')}</Button>
      : <span className="plan-line-out">{t('plan.notIn')}</span>;
  }
  // Google Flights' fare (T518): a measured price, not Carta's estimate, so
  // it carries no tilde; the airline's mark says whose flight it is.
  if (line.kind === 'flight') {
    return (
      <span className="plan-line-yours plan-line-flight">
        <AirlineMark code={line.leg?.airline} size="sm" />
        <Money value={line.eur} precision="cents" />
      </span>
    );
  }
  if (line.kind === 'yours') {
    return (
      <span className="plan-line-yours">
        {formatMoney(line.eur, { precision: 'cents', locale: lang })}
        <small>{t('plan.yours')}</small>
      </span>
    );
  }
  return <Money value={line.eur} est precision="cents" />;
}

export function PlanTotal({
  priced, dates = '', party: partyIn = null, onParty = null, onAddFare = null,
  variant = 'rail', title = null, defaultOpen = false, footer = null, className = '',
  // The total bar opens this receipt (T500): a new openKey opens the lines.
  id = undefined, openKey = 0,
}) {
  const { t, lang } = useI18n();
  const settings = useSettings();
  const lifestyle = useLifestyleLabel();
  const uid = useId();
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { if (openKey) setOpen(true); }, [openKey]);
  const [editParty, setEditParty] = useState(false);
  const total = priced ? priced.grandTotal : null;
  const delta = useTotalDelta(total);
  const figRef = useRef(null);
  useSettledFigure(figRef, total);
  const lines = tripLines(priced);
  const ready = tripReadiness(priced);
  const partyObj = partyIn || priced?.party || { adults: priced?.groupSize || 1, children: 0, babies: 0 };
  const party = Math.max(1, (partyObj.adults || 0) + (partyObj.children || 0) + (partyObj.babies || 0));
  const hasTrip = Boolean(priced && priced.stopDetails.length);

  return (
    <section id={id} tabIndex={id ? -1 : undefined} className={`plan-total plan-total-${variant} ${className}`.trim()} aria-labelledby={`${uid}-h`}>
      <header className="plan-total-head">
        <h2 className={`plan-total-title ${variant === 'sheet' ? 'sr-only' : ''}`} id={`${uid}-h`}>{title || t('plan.yourTrip')}</h2>
        {hasTrip ? (
          <>
            <p className="plan-total-fig">
              <span ref={figRef} className="plan-total-n"><Money value={total} est precision="cents" /></span>
              {delta != null && (
                <span className={`plan-total-delta ${delta < 0 ? 'is-down' : 'is-up'}`} aria-live="polite">
                  {delta < 0 ? '-' : '+'}{formatMoney(Math.abs(delta), { precision: 'cents', locale: lang })}
                </span>
              )}
            </p>
            <p className="plan-total-pp">
              {t('receipt.total', { people: party === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: party }) })}
              {party > 1 && (
                <>
                  {', '}
                  <span className="plan-total-ppfig">{t('plan.aPerson', { price: formatEst(priced.perPerson, t('money.est'), { precision: 'cents', locale: lang }) })}</span>
                </>
              )}
            </p>
          </>
        ) : (
          <p className="plan-total-empty">{t('plan.pricedOnce')}</p>
        )}
      </header>

      <dl className="plan-total-inputs">
        {dates && (
          <div className="plan-input">
            <dt>{t('wizard.summaryDates')}</dt>
            <dd>{dates}</dd>
          </div>
        )}
        <div className={`plan-input ${editParty ? 'is-open' : ''}`}>
          <dt id={`${uid}-people`}>{t('settings.party')}</dt>
          <dd>
            {onParty ? (
              <Button variant="quiet" size="sm" className="plan-input-btn" aria-expanded={editParty}
                aria-controls={`${uid}-party`} onClick={() => setEditParty((v) => !v)}
                iconEnd={<ChevronDownIcon size={16} className={editParty ? 'plan-chev is-open' : 'plan-chev'} />}>
                {partyText(t, partyObj)}
              </Button>
            ) : partyText(t, partyObj)}
          </dd>
          {onParty && editParty && (
            <div className="plan-input-panel" id={`${uid}-party`}>
              <PartyEditor value={partyObj} onChange={onParty} compact />
            </div>
          )}
        </div>
        {settings?.openLifestyle && (
          <div className="plan-input">
            <dt>{t('settings.lifestyle')}</dt>
            <dd>
              <Button variant="quiet" size="sm" className="plan-input-btn" onClick={settings.openLifestyle}
                iconEnd={<ChevronRightIcon size={16} />}>
                {lifestyle}
              </Button>
            </dd>
          </div>
        )}
      </dl>

      {hasTrip && (
        <div className="plan-total-more">
          <Button
            variant="quiet"
            block
            className="plan-total-toggle"
            aria-expanded={open}
            aria-controls={`${uid}-lines`}
            onClick={() => setOpen((v) => !v)}
            iconEnd={<ChevronDownIcon size={16} className={open ? 'plan-chev is-open' : 'plan-chev'} />}
          >
            {t('plan.whatsIn')}
          </Button>
          <div id={`${uid}-lines`} hidden={!open}>
            <dl className="plan-lines">
              {lines.map((l) => (
                <div key={l.key} className={`plan-line is-${l.kind}`}>
                  <dt>{t(LINE_KEY[l.key])}</dt>
                  <dd><LineValue line={l} lang={lang} t={t} onAddFare={onAddFare} /></dd>
                </div>
              ))}
            </dl>
            {ready.of > 0 && (
              <p className="plan-ready">
                <span className="plan-ready-bar" aria-hidden="true">
                  <span style={{ width: `${Math.round((ready.yours / ready.of) * 100)}%` }} />
                </span>
                {t('plan.readiness', { n: ready.yours, of: ready.of })}
              </p>
            )}
          </div>
        </div>
      )}
      {footer}
    </section>
  );
}

/**
 * Money a traveller paid, typed in where the thing it paid for is shown: a
 * leg, a bed, the way there. A blank field means "use Carta's estimate".
 */
const PAID_MAX = 1000000;

export function PaidField({ value, onChange, label, estimate = null, id: idProp, folded = false, hint = true, addLabel = null }) {
  const { t, lang } = useI18n();
  const auto = useId();
  const id = idProp || auto;
  // Typed money reads back as money: two decimals in the reader's own way of
  // writing them, no grouping so it parses again as typed.
  const show = (v) => (v ? new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(v) : '');
  const [text, setText] = useState(() => show(value));
  const [open, setOpen] = useState(false);
  useEffect(() => { setText(show(value)); }, [value, lang]); // eslint-disable-line react-hooks/exhaustive-deps -- show() is derived from lang
  const commit = (raw) => {
    const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
    // A typed price is a booking, not a typo test: capped at a million so a
    // slipped key cannot turn the total into eleven digits (T458).
    const v = Number.isFinite(n) && n > 0 ? Math.min(PAID_MAX, Math.round(n * 100) / 100) : 0;
    setText(show(v));
    onChange(v);
  };
  // Folded, the field is one quiet offer until it is used: the planned trip
  // carries a dozen of them and an open box on each read as a form to fill.
  if (folded && !open && !(value > 0)) {
    return (
      <Button variant="quiet" size="sm" className="plan-paid-add" onClick={() => setOpen(true)} iconStart={<PlusIcon size={16} />}>
        {addLabel || t('travel.addWhatYouPaid')}
      </Button>
    );
  }
  return (
    <div className={`plan-paid ${value ? 'is-set' : ''}`}>
      <label className="plan-paid-lbl" htmlFor={id}>{label || t('plan.youPaid')}</label>
      <div className="plan-paid-box">
        <span className="plan-paid-cur" aria-hidden="true">{formatMoney(0, { precision: 'whole', locale: lang }).replace(/[\d\s.,]/g, '')}</span>
        <input
          id={id}
          className="plan-paid-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder=""
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, ''))}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(e.currentTarget.value); }}
          autoFocus={folded && open && !(value > 0)}
        />
      </div>
      {hint && estimate != null && !(value > 0) && (
        <span className="plan-paid-hint">{t('plan.cartaSays')} <Money value={estimate} est precision="cents" /></span>
      )}
      {value > 0 && (
        <Button variant="quiet" size="sm" className="plan-paid-reset" onClick={() => { setText(''); onChange(0); }}>
          {estimate != null ? t('plan.useEstimate') : t('plan.leaveOut')}
        </Button>
      )}
    </div>
  );
}
