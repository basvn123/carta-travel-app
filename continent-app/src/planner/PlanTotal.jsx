import React, { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { Button, CostRow, Money } from '../components/ui/index.js';
import { PartyEditor } from './PartyEditor.jsx';
import { partyText } from '../lib/party.js';
import { useSettledFigure } from '../lib/figureChange.js';
import { formatMoney, formatEst } from '../lib/money.js';
import { tripLines } from '../lib/tripTotal.js';
import { costTiles, tileOfLine } from '../lib/price/tiles.js';
import { useLifestyleLabel, useTotalDelta } from './planHooks.js';
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from '../components/Icons.jsx';
import { AirlineMark } from '../components/flights/Flights.jsx';
import { usePlannerStore } from './plannerStore.js';
import { fromDraft } from './flow/tripSettings.js';
import { budgetCheck } from './flow/budget.js';

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
 *
 * T658: laid out after Airbnb's price box. The total is the headline and
 * the button that opens the lines; under it the figure a person and a person
 * a day; the inputs sit in a bordered grid; one grey note says how many
 * prices are the traveller's own and, when the trip settings carry a budget,
 * how far under or over it the trip is; one stacked bar sits above the lines.
 */

/**
 * The cost bar (carta-design): one stacked bar above the lines, a segment a
 * line in receipt order on the kind ramp, no legend, no percentages. The
 * lines under it name and price each part; the bar only shows the weight.
 */
const BAR_SHADES = ['--kind-metro', '--kind-city', '--kind-town', '--kind-village', '--kind-area'];
function CostBar({ lines }) {
  const parts = lines.filter((l) => l.eur > 0);
  const sum = parts.reduce((n, l) => n + l.eur, 0);
  if (parts.length < 2 || !(sum > 0)) return null;
  return (
    <span className="plan-costbar" aria-hidden="true">
      {parts.map((l, i) => (
        <span key={l.key} style={{ flexGrow: l.eur / sum, background: `var(${BAR_SHADES[i % BAR_SHADES.length]})` }} />
      ))}
    </span>
  );
}

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
  if (line.kind === 'flight') return <Money value={line.eur} precision="cents" />;
  if (line.kind === 'yours') {
    return (
      <>
        <small>{t('plan.yours')}</small>
        {formatMoney(line.eur, { precision: 'cents', locale: lang })}
      </>
    );
  }
  return <Money value={line.eur} est precision="cents" />;
}

export function PlanTotal({
  priced, dates = '', party: partyIn = null, onParty = null, onAddFare = null,
  variant = 'rail', title = null, defaultOpen = false, footer = null, className = '',
  // The total bar opens this receipt (T500): a new openKey opens the lines.
  id = undefined, openKey = 0,
  // The trip page's Costs tab (T821): the lines always open, under the four
  // tiles' headings (Flights, Getting around, Stay, Food), each with its sum.
  grouped = false,
}) {
  const { t, lang } = useI18n();
  const settings = useSettings();
  const lifestyle = useLifestyleLabel();
  const uid = useId();
  const [open, setOpen] = useState(defaultOpen || grouped);
  useEffect(() => { if (openKey) setOpen(true); }, [openKey]);
  const [editParty, setEditParty] = useState(false);
  const total = priced ? priced.grandTotal : null;
  const delta = useTotalDelta(total);
  const figRef = useRef(null);
  useSettledFigure(figRef, total);
  const lines = tripLines(priced);
  const partyObj = partyIn || priced?.party || { adults: priced?.groupSize || 1, children: 0, babies: 0 };
  const party = Math.max(1, (partyObj.adults || 0) + (partyObj.children || 0) + (partyObj.babies || 0));
  const hasTrip = Boolean(priced && priced.stopDetails.length);
  const nights = hasTrip ? priced.stopDetails.reduce((n, st) => n + (st.nights || 0), 0) : 0;
  // The trip settings' budget, when there is one (T658).
  const draft = usePlannerStore();
  const budget = hasTrip ? budgetCheck(priced, fromDraft(draft).guide.budget, { party, nights }) : null;

  return (
    <section id={id} tabIndex={id ? -1 : undefined} className={`plan-total plan-total-${variant} ${className}`.trim()} aria-labelledby={`${uid}-h`}>
      <header className="plan-total-head">
        <h2 className={`plan-total-title ${variant === 'sheet' ? 'sr-only' : ''}`} id={`${uid}-h`}>{title || t('plan.yourTrip')}</h2>
        {hasTrip ? (
          <>
            <p className="plan-total-fig">
              <Button
                variant="quiet"
                className="plan-total-open"
                aria-expanded={open}
                aria-controls={`${uid}-lines`}
                onClick={() => setOpen((v) => !v)}
              >
                <span ref={figRef} className="plan-total-n">
                  {t('plan.inTotal', { price: formatEst(total, t('money.est'), { precision: 'cents', locale: lang }) })}
                </span>
              </Button>
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
              {nights > 0 && (
                <>
                  {', '}
                  <span className="plan-total-ppfig">{t('plan.aPersonADay', { price: formatEst(priced.perPerson / nights, t('money.est'), { precision: 'whole', locale: lang }) })}</span>
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

      {/* T839: the budget line only; "N of M prices are your own" was a
          method line (carta-design, Numbers and money). */}
      {hasTrip && budget && (
        <p className="plan-total-note">
          <span className={budget.over ? 'is-over' : ''}>
            {t(budget.over ? 'plan.budgetOver' : 'plan.budgetUnder', { price: formatEst(budget.gap, t('money.est'), { precision: 'whole', locale: lang }) })}
          </span>
        </p>
      )}

      {hasTrip && grouped && (
        <div className="plan-total-groups" id={`${uid}-lines`}>
          {costTiles(priced).map((tile) => {
            const mine = lines.filter((l) => tileOfLine(l.key, tile.driving) === tile.key);
            const head = tile.key === 'travel' && tile.driving ? 'tp.tile.driving' : `tp.tile.${{ travel: 'flights', around: 'around', stay: 'stay', food: 'food' }[tile.key]}`;
            return (
              <section className="plan-total-group" key={tile.key} id={`tp-cost-${tile.key}`} tabIndex={-1} aria-labelledby={`${uid}-g-${tile.key}`}>
                <h3 className="plan-total-group-h" id={`${uid}-g-${tile.key}`}>
                  <span>{t(head)}</span>
                  <span className="plan-total-group-n">{tile.empty ? t('tp.tile.notNeeded') : <Money value={tile.eur} est precision="cents" />}</span>
                </h3>
                {mine.length > 0 && (
                  <dl className="plan-lines costrows">
                    {mine.map((l) => (
                      <CostRow
                        key={l.key}
                        kind={l.key}
                        label={t(LINE_KEY[l.key])}
                        tone={l.kind === 'missing' ? 'missing' : l.kind === 'yours' ? 'yours' : null}
                        mark={l.kind === 'flight' && l.leg?.airline ? <AirlineMark code={l.leg.airline} size="sm" /> : null}
                        value={<LineValue line={l} lang={lang} t={t} onAddFare={onAddFare} />}
                      />
                    ))}
                  </dl>
                )}
              </section>
            );
          })}
        </div>
      )}
      {hasTrip && !grouped && (
        <div className="plan-total-more" id={`${uid}-lines`} hidden={!open}>
          <CostBar lines={lines} />
          <dl className="plan-lines costrows">
            {lines.map((l) => (
              <CostRow
                key={l.key}
                kind={l.key}
                label={t(LINE_KEY[l.key])}
                tone={l.kind === 'missing' ? 'missing' : l.kind === 'yours' ? 'yours' : null}
                mark={l.kind === 'flight' && l.leg?.airline ? <AirlineMark code={l.leg.airline} size="sm" /> : null}
                value={<LineValue line={l} lang={lang} t={t} onAddFare={onAddFare} />}
              />
            ))}
          </dl>
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
