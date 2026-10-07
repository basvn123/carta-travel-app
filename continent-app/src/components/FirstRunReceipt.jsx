import React from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import {
  priceReceipt, receiptFooter, readFirstResultSeen, markFirstResultSeen, readOwnFare, writeOwnFare,
} from '../lib/firstRun.js';
import { offeredStayTiers } from '../lib/runtime_pricing.js';
import { eurExact } from '../lib/format.js';
import { addDays, laterISO, planningHorizon, useToday } from '../lib/dates.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { OriginPicker } from './OriginPicker.jsx';
import { Button } from './Button.jsx';
import { CloseIcon } from './Icons.jsx';

/**
 * The first-run receipt (T099), built to docs/FIRST_RUN_RESULT.md as the owner
 * approved it on 2026-10-07 (T362): the first itemised total a visitor meets,
 * on the destination page and the trip page, priced from the defaults before
 * a single question is asked.
 *
 * Top to bottom: the orientation line (first run only), the input strip (stay
 * party size and dates), the receipt card, the one
 * primary ("Set your dates", only while the dates are Carta's), the flight
 * sentence with its door, and the exclusions sentence. The door opens the one
 * sheet where the departure airport is asked, and nowhere else asks it.
 *
 * The inputs are the app's own (lib/firstRunContext.js): changing the stay or
 * the dates here changes them everywhere, the way the Lifestyle panel does,
 * because a receipt that priced a different trip from the cards beside it
 * would be a second truth.
 */

const LOCALES = { en: 'en-GB' };
const MAX_PARTY = 12;

function dateText(iso, lang, withYear) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(LOCALES[lang] || lang || 'en-GB', {
      day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC',
    }).format(new Date(`${iso}T00:00:00Z`));
  } catch { return iso; }
}

function monthYear(iso, lang) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(LOCALES[lang] || lang || 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${String(iso).slice(0, 7)}-15T12:00:00Z`));
  } catch { return String(iso).slice(0, 7); }
}

/** A figure, with the tilde and the est. tag when it stands in for a
 *  measurement. The tag carries its meaning as text, never colour alone. */
function Figure({ eur, est, t }) {
  return (
    <>
      {est && <span className="frr-tilde" aria-hidden="true">~ </span>}
      {eurExact(eur)}
      {est && (
        <abbr className="frr-est" title={t('prov.estTitle')}>
          <span aria-hidden="true">{` ${t('prov.est')}`}</span>
          <span className="frr-sr">{` ${t('prov.estTitle')}`}</span>
        </abbr>
      )}
    </>
  );
}

/** "Your flight": where the airport is asked, once (FIRST_RUN_RESULT.md,
 *  "the door opens one sheet"). Prefilled from the remembered airport and the
 *  fare this receipt already holds. A modal with a scrim, a focus trap that
 *  sits above the page's own, and Escape that closes only the sheet. */
function FlightSheet({ fare, origin, data, setOrigin, from, to, people, onSave, onRemove, onClose, t }) {
  const today = useToday();
  const panelRef = React.useRef(null);
  const closeRef = React.useRef(null);
  const [airline, setAirline] = React.useState(fare?.airline || '');
  const [paid, setPaid] = React.useState(fare?.costTotal ? String(fare.costTotal) : '');
  const [outDate, setOutDate] = React.useState(fare?.outDate || from || '');
  const [retDate, setRetDate] = React.useState(fare?.retDate || to || '');
  // An open airport list keeps its own Escape.
  const skip = React.useCallback(() => !!panelRef.current?.querySelector('.origin-pop'), []);
  useFocusTrap(panelRef, onClose, { initialFocusRef: closeRef, skipEscapeWhen: skip });

  const amount = Math.round(Number(String(paid).replace(',', '.')) * 100) / 100;
  const valid = Number.isFinite(amount) && amount > 0 && amount <= 99999;
  const save = (e) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      costTotal: amount, airline: airline.trim().slice(0, 60), origin: origin || null,
      outDate: outDate || null, retDate: retDate || null,
    });
  };

  return createPortal(
    <div className="frr-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="frr-sheet" role="dialog" aria-modal="true" aria-labelledby="frr-sheet-h" ref={panelRef}>
        <div className="frr-sheet-head">
          <h2 id="frr-sheet-h">{t('extras.ownFlight')}</h2>
          <button type="button" className="frr-sheet-close" onClick={onClose} ref={closeRef} aria-label={t('receipt.sheetClose')}>
            <CloseIcon size={16} />
          </button>
        </div>
        <form className="frr-sheet-body" onSubmit={save}>
          <div className="frr-field">
            <span className="frr-field-label">{t('receipt.sheetFrom')}</span>
            <OriginPicker data={data} origin={origin} onChangeOrigin={setOrigin} />
          </div>
          <label className="frr-field">
            <span className="frr-field-label">{t('trip.airlineAria')}</span>
            <input
              type="text"
              value={airline}
              maxLength={60}
              placeholder={t('trip.airlinePlaceholder')}
              onChange={(e) => setAirline(e.target.value)}
            />
          </label>
          <label className="frr-field">
            <span className="frr-field-label">{t('receipt.sheetPaid', { people })}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              max="99999"
              step="0.01"
              value={paid}
              placeholder="117.96"
              className="mono"
              onChange={(e) => setPaid(e.target.value)}
            />
          </label>
          <div className="frr-field-pair">
            <label className="frr-field">
              <span className="frr-field-label">{t('wizard.ownFlightOutLabel')}</span>
              <input
                type="date"
                className="mono"
                min={today}
                value={outDate}
                onChange={(e) => setOutDate(e.target.value ? laterISO(e.target.value, today) : '')}
              />
            </label>
            <label className="frr-field">
              <span className="frr-field-label">{t('wizard.ownFlightRetLabel')}</span>
              <input
                type="date"
                className="mono"
                min={laterISO(outDate, today)}
                value={retDate}
                onChange={(e) => setRetDate(e.target.value ? laterISO(e.target.value, laterISO(outDate, today)) : '')}
              />
            </label>
          </div>
          <div className="frr-sheet-actions">
            <Button variant="primary" type="submit" disabled={!valid}>{t('receipt.sheetSave')}</Button>
            {fare && <Button variant="secondary" onClick={onRemove}>{t('trip.removeOwnFare')}</Button>}
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/**
 * props
 *   dest          the catalogue destination the receipt prices
 *   receiptKey    where a typed fare is remembered ('dest:TRS', 'journey:x')
 *   headingLevel  2 or 3, to sit in the page's outline
 *   onPrimaryChange(bool)  told whether "Set your dates" is showing, so the
 *                 page can keep its own primary quiet meanwhile
 *   nights        the trip's own length (T101): the page that owns a length,
 *                 a curated trip with a short version and a week, passes it
 *                 and the receipt prices that many nights from the arrival
 *                 date. The Leave date is then read-only, because the length
 *                 is chosen on the page and a second control would price a
 *                 third length.
 */
export function FirstRunReceipt({ dest, receiptKey, headingLevel = 2, onPrimaryChange = null, nights: fixedNights = null }) {
  const { t, lang } = useI18n();
  const ctx = useFirstRun();
  const today = useToday();
  const uid = React.useId();
  const fromRef = React.useRef(null);
  const cardRef = React.useRef(null);
  // First run is decided once, when the receipt mounts: the flag is written
  // as soon as the visitor acts, but this page keeps the form it opened in.
  const [firstRun] = React.useState(() => !readFirstResultSeen());
  const [fare, setFare] = React.useState(() => readOwnFare(receiptKey));
  const [sheetOpen, setSheetOpen] = React.useState(false);
  React.useEffect(() => { setFare(readOwnFare(receiptKey)); }, [receiptKey]);

  const choices = ctx?.choices;
  const defaults = ctx?.defaultDates || null;
  const from = ctx?.departDate || defaults?.start || null;
  const to = fixedNights && from ? addDays(from, fixedNights) : (ctx?.returnDate || defaults?.end || null);
  const datesOwn = fixedNights
    ? !!(defaults && from && from !== defaults.start)
    : !!(defaults && from && to && (from !== defaults.start || to !== defaults.end));
  const costRow = dest ? ctx?.indices?.get?.(dest.id) || null : null;

  const opts = React.useMemo(() => ({
    from,
    to,
    people: choices?.group_size,
    stayTier: choices?.stay_tier || 'home',
    lifestyle: choices?.lifestyle,
    accommodationModel: choices?.accommodation_model,
    costRow,
    ownFare: fare,
  }), [from, to, choices?.group_size, choices?.stay_tier, choices?.lifestyle, choices?.accommodation_model, costRow, fare]);

  const receipt = React.useMemo(() => (dest ? priceReceipt(dest, opts) : null), [dest, opts]);
  const footer = React.useMemo(
    () => receiptFooter(dest, receipt, opts, { datesOwn, meta: ctx?.data?.meta }),
    [dest, receipt, opts, datesOwn, ctx?.data?.meta],
  );

  // "Scrolled past the card" is the other way a first result counts as seen.
  React.useEffect(() => {
    const el = cardRef.current;
    if (!firstRun || !el || typeof IntersectionObserver !== 'function') return undefined;
    const io = new IntersectionObserver(([entry]) => {
      const top = entry.rootBounds ? entry.rootBounds.top : 0;
      if (!entry.isIntersecting && entry.boundingClientRect.bottom < top) {
        markFirstResultSeen();
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [firstRun, receipt != null]); // eslint-disable-line react-hooks/exhaustive-deps -- re-observes when the card mounts or unmounts, not on every reprice

  // While "Set your dates" shows, it is the view's one primary, and the page
  // turns its own primary quiet (FIRST_RUN_RESULT.md, "never a second
  // primary"). The page hears it through this callback.
  const showsPrimary = !!(ctx && receipt && !datesOwn);
  React.useEffect(() => { onPrimaryChange?.(showsPrimary); }, [showsPrimary, onPrimaryChange]);
  React.useEffect(() => () => { onPrimaryChange?.(false); }, [onPrimaryChange]);

  if (!ctx || !receipt) return null;

  const H = headingLevel === 3 ? 'h3' : 'h2';
  const city = dest.city || dest.name || '';
  const peopleText = receipt.people === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: receipt.people });
  const nightsText = receipt.nights === 1 ? t('receipt.oneNight') : t('receipt.nNights', { n: receipt.nights });
  const sameYear = receipt.from.slice(0, 4) === receipt.to.slice(0, 4);
  const fromText = dateText(receipt.from, lang, !sameYear);
  const toText = dateText(receipt.to, lang, true);
  const flight = receipt.lines.find((l) => l.key === 'flight');
  const originCity = flight?.origin ? (ctx.data?.meta?.origins?.[flight.origin]?.city || flight.origin) : null;
  const tierWord = (tier) => t(`stay.${tier || 'home'}`);
  // Mid-sentence the tier is lower case, except in German, where a noun keeps
  // its capital.
  const tierInline = (tier) => (lang === 'de' ? tierWord(tier) : tierWord(tier).toLowerCase());
  const acted = () => markFirstResultSeen();

  const setFrom = (iso) => {
    if (!iso) return;
    acted();
    const nights = receipt.nights;
    ctx.setDepartDate(iso);
    // A fixed length leaves the shared return date alone; otherwise keep the
    // trip length when the arrival moves past the departure.
    if (!fixedNights && (!to || to <= iso)) ctx.setReturnDate(addDays(iso, nights));
  };
  const setTo = (iso) => {
    if (!iso || iso <= from) return;
    acted();
    ctx.setReturnDate(iso);
  };
  const setPeople = (n) => {
    if (!Number.isFinite(n) || n < 1) return;
    acted();
    ctx.setChoices((prev) => ({ ...prev, group_size: Math.min(MAX_PARTY, Math.round(n)) }));
  };
  const setTier = (tier) => {
    acted();
    ctx.setChoices((prev) => ({ ...prev, stay_tier: tier }));
  };
  const focusDates = () => {
    const el = fromRef.current;
    if (!el) return;
    el.focus();
    try { el.showPicker?.(); } catch { /* not every browser opens it on request */ }
  };
  const saveFare = (f) => {
    acted();
    writeOwnFare(receiptKey, f);
    setFare(readOwnFare(receiptKey) || f);
    setSheetOpen(false);
  };
  const removeFare = () => {
    acted();
    writeOwnFare(receiptKey, null);
    setFare(null);
    setSheetOpen(false);
  };

  // Second rows: the provenance in plain words on the first run, one fact
  // each afterwards (FIRST_RUN_RESULT.md, "Once, then never again").
  const provOf = (line) => {
    if (line.key === 'flight') {
      return [
        line.airline && line.origin ? t('receipt.flightAirline', { airline: line.airline, code: line.origin })
          : line.airline || (line.origin ? t('receipt.flightFrom', { code: line.origin }) : null),
        t('receipt.yourFlightSub', { people: peopleText }),
      ].filter(Boolean);
    }
    if (line.key === 'stay') {
      const word = line.tierFallback
        ? t('receipt.stayFallback', { asked: tierInline(line.tierAsked), tier: tierInline(line.tier) })
        : tierWord(line.tier);
      if (!firstRun) {
        return [word, line.level === 'city' ? t('receipt.measured') : t('receipt.national')];
      }
      const why = line.level === 'region' ? t('cost.stayRepaired')
        : line.level === 'city'
          ? (line.listings && line.place
            ? t('cost.stayMeasuredN', { n: line.listings.toLocaleString(LOCALES[lang] || lang), place: line.place, when: monthYear(line.captured, lang) })
            : t('cost.stayMeasured'))
          : t('cost.stayNational');
      return [word, why];
    }
    // ground
    const math = t(line.days === 1 ? 'receipt.groundMathOne' : 'receipt.groundMath',
      { days: line.days, people: receipt.people, eur: eurExact(line.perDay) });
    if (!firstRun) return [{ mono: math }, line.level === 'city' ? t('receipt.measured') : t('receipt.national')];
    return [{ mono: math }, line.level === 'city' ? t('cost.foodMeasured') : t('receipt.groundNational')];
  };
  const labelOf = (line) => (line.key === 'flight' ? t('receipt.yourFlight')
    : line.key === 'stay' ? t('receipt.stay', { nights: nightsText })
      : t('receipt.ground'));

  const footerText = footer
    ? (footer.kind === 'tier'
      ? t('receipt.footerTier', { tier: tierInline(footer.tier), eur: `${footer.est ? '~ ' : ''}${eurExact(footer.total)}` })
      : t(footer.kind === 'month' ? 'receipt.footerMonth' : 'receipt.footerLater',
        { eur: `${footer.est ? '~ ' : ''}${eurExact(footer.total)}` }))
    : null;

  const tiers = offeredStayTiers(ctx.data?.meta);
  const peopleOptions = Array.from({ length: MAX_PARTY }, (_, i) => i + 1);
  // Private rooms and hotel rooms are priced as double rooms (stayTierNightly),
  // so an odd party pays for a spare bed. Said in words where it applies.
  const stayLine = receipt.lines.find((l) => l.key === 'stay');
  const roomsBooked = Math.ceil(receipt.people / 2);
  const roomNote = stayLine && stayLine.level === 'city' && stayLine.tier !== 'home' && stayLine.tier !== 'dorm'
    && receipt.people % 2 === 1;
  const horizon = planningHorizon(ctx.dateBounds?.max, today);

  return (
    <section className="frr" aria-labelledby={`${uid}-h`}>
      {firstRun && (
        <p className="frr-orient">
          {datesOwn
            ? t('receipt.orientOwn', { people: peopleText, from: fromText, to: toText })
            : t('receipt.orientDefault', { people: peopleText, nights: nightsText, city })}
        </p>
      )}

      {/* The search strip: one bordered row, a small label over each value.
          The party size defaults to two; no airport cell, the airport belongs to the flight door. */}
      <div className="frr-strip" role="group" aria-label={t('receipt.stripAria')}>
        <label className="frr-cell">
          <span className="frr-cell-label">{t('receipt.stripPeople')}</span>
          <select value={receipt.people} onChange={(e) => setPeople(Number(e.target.value))}>
            {peopleOptions.map((n) => (
              <option key={n} value={n}>{n === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n })}</option>
            ))}
          </select>
        </label>
        <label className="frr-cell">
          <span className="frr-cell-label">{t('receipt.stripStay')}</span>
          <select value={choices?.stay_tier || 'home'} onChange={(e) => setTier(e.target.value)}>
            {tiers.map((tier) => <option key={tier} value={tier}>{tierWord(tier)}</option>)}
          </select>
        </label>
        <label className="frr-cell">
          <span className="frr-cell-label">{t('receipt.stripArrive')}</span>
          <input
            ref={fromRef}
            type="date"
            className="mono"
            min={today}
            max={horizon}
            value={receipt.from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="frr-cell">
          <span className="frr-cell-label">{t('receipt.stripLeave')}</span>
          <input
            type="date"
            className="mono"
            min={addDays(receipt.from, 1)}
            max={horizon}
            value={receipt.to}
            readOnly={!!fixedNights}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>

      <div className="frr-card" ref={cardRef}>
        <header className="frr-head">
          <H className="frr-title" id={`${uid}-h`}>
            {originCity ? t('receipt.titleFrom', { city, originCity }) : t('receipt.title', { city })}
          </H>
          <p className="frr-sub mono">
            {t('receipt.sub', { from: fromText, to: toText, nights: nightsText, people: peopleText })}
          </p>
        </header>
        <dl className="frr-lines" key={receipt.total}>
          {receipt.lines.map((line) => (
            <div className="frr-line" key={line.key}>
              <dt>
                <span className="frr-label">{labelOf(line)}</span>
                {provOf(line).map((p, i) => (
                  typeof p === 'string'
                    ? <span className="frr-prov" key={i}>{p}</span>
                    : <span className="frr-prov mono" key={i}>{p.mono}</span>
                ))}
              </dt>
              <dd className="mono"><Figure eur={line.eur} est={line.est} t={t} /></dd>
            </div>
          ))}
          <div className="frr-line frr-sum">
            <dt><span className="frr-label">{t('receipt.total', { people: peopleText })}</span></dt>
            <dd className="mono">
              <span className="frr-sum-eur"><Figure eur={receipt.total} est={receipt.est} t={t} /></span>
              {receipt.people > 1 && (
                <span className="frr-each">{t('receipt.each', { eur: eurExact(receipt.each) })}</span>
              )}
            </dd>
          </div>
        </dl>
        {roomNote && (
          <p className="frr-foot">
            {t(roomsBooked === 1 ? 'receipt.roomNoteOne' : 'receipt.roomNote', { people: peopleText, rooms: roomsBooked })}
          </p>
        )}
        {footerText && <p className="frr-foot">{footerText}</p>}
      </div>

      {showsPrimary && (
        <Button variant="primary" className="frr-cta" onClick={focusDates}>{t('receipt.setDates')}</Button>
      )}

      {flight ? (
        <p className="frr-flight">
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>{t('receipt.changeFare')}</Button>
        </p>
      ) : (
        <p className="frr-flight">
          <span>{t('trip.flightNotPriced')}</span>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>{t('trip.addOwnFare')}</Button>
        </p>
      )}
      <p className="frr-notin">{t('receipt.notIn')}</p>

      {sheetOpen && (
        <FlightSheet
          fare={fare}
          origin={choices?.origin}
          data={ctx.data}
          setOrigin={(code) => { acted(); ctx.setOrigin(code); }}
          from={receipt.from}
          to={receipt.to}
          people={peopleText}
          onSave={saveFare}
          onRemove={removeFare}
          onClose={() => setSheetOpen(false)}
          t={t}
        />
      )}
    </section>
  );
}
