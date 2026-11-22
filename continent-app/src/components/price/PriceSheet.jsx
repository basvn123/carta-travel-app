/**
 * A place's receipt (G12, D10, place-prices decision section 2). The card's
 * two lines open it: one sheet, no tabs.
 *
 *   the place     name and country, close
 *   the total     the card's figure and basis (receiptLines, the same
 *                 priceFigure call the card makes), and one insight line only
 *                 when the place's day is 10% or more off the usual day
 *   the chips     the style and the settings that produce it: the heart opens
 *                 the Style Studio, the rest open Settings at their step; the
 *                 receipt steps aside and comes back with the new figures
 *   the rows      Bed, Food and drink, the way there; each opens in place to
 *                 its lever (beds, eating styles, ways, at this place's own
 *                 prices). A pick is for this trip: the style is held.
 *   the foot      the Total line and one action, Plan this trip
 *
 * The plane option opens the flights screen in the same sheet (FlightTab,
 * the flights lane's; requests-A.md), with a way back to the receipt.
 *
 * Phone: the shared bottom sheet (SheetShell), modal and full width.
 * 769 px and up: a 400 px popover hung off the tapped card, non-modal: it
 * follows the card on scroll, Escape and a press outside close it, focus
 * goes back to the card.
 *
 * Mounted once in App beside the docks; cards only call openPriceSheet.
 */
import React, { Suspense, lazy, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/index.jsx';
import { useDayView } from '../../hooks/useDayView.js';
import { formatMoney } from '../../lib/money.js';
import { minutesText } from '../../lib/journeys.js';
import { priceDay } from '../../lib/price/priceDay.js';
import { usualDayEur } from '../../lib/price/styleDay.js';
import { dayInsight, receiptLines, wayLegNote } from '../../lib/price/priceSheet.js';
import { bedIsThin } from '../../lib/price/display.js';
import { offeredStayTiers, DEFAULT_LIFESTYLE } from '../../lib/runtime_pricing.js';
import { partyOf } from '../../lib/party.js';
import { destAnchor } from '../../lib/origins.js';
import { homePoint } from '../../lib/travelWay.js';
import { flightFiles } from '../../lib/settings/ways.js';
import { waysThere } from '../../browse/placeWays.js';
import { countryName } from '../../lib/countryName.js';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { PROFILES, PROFILE_LABEL_KEYS, matchProfile } from '../../browse/styles/spendBits.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { glyphOf, useSummaryItems } from '../../browse/band/SummaryChips.jsx';
import { Button, IconButton } from '../ui/index.js';
import { Money } from '../ui/Money.jsx';
import { Pressable } from '../ui/Pressable.jsx';
import { HouseIcon } from '../HouseIcons.jsx';
import { CountryFlag } from '../CountryFlag.jsx';
import NotYet from '../NotYet.jsx';
import { openSettings, useSettingsSheet } from '../../browse/settings/settingsSheetStore.js';
import { useSettings } from '../SettingsLine.jsx';
import { openStudio } from '../../browse/styles/studioDoors.js';
import {
  closePriceSheet, showPriceView, stepAway, stepBack, usePriceSheet,
} from './priceSheetStore.js';
import '../../styles/86-price-items.css';

const FlightTab = lazy(() => import('./FlightTab.jsx'));

const DESKTOP_FROM = 769;
const POP_W = 400;
const GUTTER = 16;
const GAP = 8;

const WAY_ICON = { plane: HouseIcon.flight, train: HouseIcon.train, bus: HouseIcon.bus, car: HouseIcon.car };

// Explore rows carry the place's name as `city`.
const placeName = (p) => p?.name || p?.city || '';
const isDesktop = () => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_FROM;
const cents = (v) => (v == null ? null : <Money value={v} precision="cents" />);

export function PriceSheet({ data, onPlan = null }) {
  const s = usePriceSheet();
  if (!s) return null;
  if (s.away) return <AwayWatch />;
  return <OpenSheet key={s.place?.id ?? 'none'} s={s} data={data} onPlan={onPlan} />;
}

/**
 * While a chip's Settings step or the Style Studio is open, the receipt
 * waits here and comes back once they have closed, its figures already
 * the new ones (the cards refresh the store). A door that never opened
 * (nothing to open) brings it back at once.
 */
function AwayWatch() {
  const settingsOpen = useSettingsSheet().isOpen;
  const studioOpen = !!useSettings()?.travelStyles?.open;
  const seen = useRef(false);
  useEffect(() => {
    if (settingsOpen || studioOpen) { seen.current = true; return undefined; }
    if (seen.current) { stepBack(); return undefined; }
    const id = setTimeout(() => { if (!seen.current) stepBack(); }, 600);
    return () => clearTimeout(id);
  }, [settingsOpen, studioOpen]);
  return null;
}

function OpenSheet({ s, data, onPlan }) {
  const { t } = useI18n();
  const [desk] = useState(isDesktop);
  const baseId = useId();
  const flights = s.view === 'flights';
  const name = placeName(s.place);
  const label = flights ? t('price.flightsTitle', { place: name }) : name;

  const close = () => {
    closePriceSheet();
    if (s.anchor?.isConnected) s.anchor.focus({ preventScroll: true });
  };
  const title = <SheetTitle s={s} flights={flights} label={label} t={t} />;
  const body = flights
    ? <FlightsView s={s} data={data} t={t} />
    : <Receipt s={s} data={data} onPlan={onPlan} t={t} />;
  if (desk) {
    return (
      <Popover anchor={s.anchor} label={label} onClose={close}>
        <div className="rcp-pophead">
          <h2 className="rcp-title">{title}</h2>
          <IconButton className="rcp-close" label={t('price.close')} onClick={close}><HouseIcon.close size={18} /></IconButton>
        </div>
        {body}
      </Popover>
    );
  }
  return (
    <SheetShell title={title} onClose={close} className="psheet rcp-sheet" labelId={`${baseId}-title`} closeLabel={t('price.close')}>
      {body}
    </SheetShell>
  );
}

/** The head: the place and its country, or the flights screen's title with
 *  the way back to the receipt. */
function SheetTitle({ s, flights, label, t }) {
  if (flights) {
    return (
      <span className="rcp-titlerow">
        <IconButton className="rcp-back" label={t('price.backToReceipt')} onClick={() => showPriceView('receipt')}>
          <HouseIcon.back size={18} />
        </IconButton>
        <span className="rcp-name">{label}</span>
      </span>
    );
  }
  const iso2 = s.place?.iso2;
  return (
    <span className="rcp-titlerow">
      <span className="rcp-name">{label}</span>
      {iso2 && (
        <span className="rcp-country">
          <CountryFlag country={iso2} size={12} />
          {countryName(iso2, s.place?.country || '')}
        </span>
      )}
    </span>
  );
}

function FlightsView({ s, data, t }) {
  const view = useDayView();
  // The flight's own Settings door (Start) steps aside and comes back here.
  const toStart = () => { stepAway(); requestAnimationFrame(() => openSettings({ step: 'start' })); };
  return (
    <div className="rcp-flights">
      <Suspense fallback={<p className="psheet-basis" role="status">{t('price.flight.loading')}</p>}>
        <FlightTab place={s.place} data={data} request={view.request} view={view} way={s.cost?.way || null}
          active onChangeTrip={toStart} />
      </Suspense>
    </div>
  );
}

/** The traveller's usual day a person (lib/price/styleDay.js), worked out
 *  in short tasks after the receipt has opened. */
function useUsualDay(choices, destinations) {
  const key = choices ? JSON.stringify([choices.group_size, choices.children, choices.babies, choices.stay_tier, choices.lifestyle]) : '';
  const [got, setGot] = useState({ key: null, eur: null });
  useEffect(() => {
    if (!key || !destinations) return undefined;
    const ac = new AbortController();
    usualDayEur(choices, destinations, { signal: ac.signal })
      .then((eur) => { if (!ac.signal.aborted) setGot({ key, eur }); })
      .catch(() => {});
    return () => ac.abort();
  }, [key, destinations]); // eslint-disable-line react-hooks/exhaustive-deps
  return got.key === key ? got.eur : null;
}

function Receipt({ s, data, onPlan, t }) {
  const settings = useSettings();
  const ctx = useFirstRun();
  const model = s.model || settings?.model || null;
  const r = useMemo(() => receiptLines({ cost: s.cost }, model || {}), [s.cost, model]);
  const [open, setOpen] = useState(null);
  const usual = useUsualDay(ctx?.choices, data?.destinations);
  const insight = dayInsight(s.cost?.dayEur, usual, r.group ? r.n : 1);
  const [bKey, bArgs] = r.basis;
  const toggle = (k) => setOpen((v) => (v === k ? null : k));

  const plan = () => {
    const p = s.place;
    closePriceSheet();
    if (p && onPlan) requestAnimationFrame(() => onPlan(p));
  };

  const wayRow = !r.way.off && (r.way.mode || r.way.missing) ? (
    <WayRow s={s} r={r} data={data} open={open === 'way'} onToggle={() => toggle('way')} t={t} />
  ) : null;

  return (
    <div className="rcp">
      <div className="rcp-top">
        <p className="rcp-total">
          {r.total == null ? <NotYet className="rcp-big" /> : <Money value={r.total} className="rcp-big" />}
          {r.total != null && <span className="rcp-basis">{t(bKey, bArgs)}</span>}
        </p>
        {insight && (
          <p className={`rcp-insight is-${insight.dir}`}>
            <HouseIcon.up size={14} className="rcp-insight-ic" />
            {t(insight.dir === 'under' ? 'price.insightUnder' : 'price.insightOver', { price: formatMoney(insight.eur) })}
          </p>
        )}
      </div>
      <BasisChips t={t} />
      <ul className="rcp-rows">
        <BedRow s={s} r={r} data={data} ctx={ctx} open={open === 'bed'} onToggle={() => toggle('bed')} t={t} />
        <FoodRow s={s} r={r} data={data} ctx={ctx} open={open === 'food'} onToggle={() => toggle('food')} t={t} />
        {r.way.inTotal && wayRow}
        {r.rounding != null && (
          <li className="rcp-line is-rounding"><span>{t('place.rounding')}</span><Money value={r.rounding} precision="cents" /></li>
        )}
        <li className="rcp-line is-sum">
          <span>{t('price.total')}</span>
          {r.sum == null ? <NotYet /> : <Money value={r.sum} precision="cents" />}
        </li>
        {!r.way.inTotal && wayRow && <li className="rcp-apart" aria-hidden="true" />}
        {!r.way.inTotal && wayRow}
      </ul>
      {onPlan && s.place?.iso2 && (
        <div className="psheet-foot">
          <Button variant="primary" block className="psheet-primary" iconStart={<HouseIcon.route size={18} />} onClick={plan}>
            {t('brief.planThisTrip')}
          </Button>
        </div>
      )}
    </div>
  );
}

/** The settings behind the figure, as the band says them (settingsSummary):
 *  each a door to its Settings step, the style's heart to the Studio. */
function BasisChips({ t }) {
  const items = useSummaryItems();
  const ts = useSettings()?.travelStyles;
  if (!items.length) return null;
  const go = (it) => {
    stepAway();
    requestAnimationFrame(() => (it.key === 'style' ? openStudio(ts) : openSettings({ step: it.step || 'overview' })));
  };
  return (
    <div className="rcp-chips" role="group" aria-label={t('band.chipsAria')}>
      {items.map((it) => {
        const Ico = glyphOf(it.icon);
        return (
          <Pressable key={it.key} className={`rcp-chip${it.key === 'style' ? ' is-style' : ''}`}
            data-step={it.key === 'style' ? 'style' : it.step || 'overview'}
            aria-label={t('band.chipAria', { text: it.text })} onClick={() => go(it)}>
            {Ico && <span className="rcp-chip-ic" aria-hidden="true"><Ico size={15} /></span>}
            <span className="rcp-chip-text">{it.text}</span>
            <HouseIcon.next size={13} className="rcp-chip-go" />
          </Pressable>
        );
      })}
    </div>
  );
}

/**
 * One receipt row: its glyph, what it is (and the choice behind it), the
 * amount (and a night or a day under it on a trip), and a chevron. A press
 * opens its lever under it.
 */
function Row({ kind, Icon, title, sub, amount, each, mark = null, open, onToggle, children, t }) {
  const id = useId();
  return (
    <li className={`rcp-row is-${kind}${open ? ' is-open' : ''}`} data-row={kind}>
      <Pressable className="rcp-rowbtn" aria-expanded={open} aria-controls={`${id}-lever`} onClick={onToggle}>
        <span className={`rcp-ic is-${kind}`} aria-hidden="true"><Icon size={18} /></span>
        <span className="rcp-what">
          <span className="rcp-label">{title}</span>
          {sub && <span className="rcp-sub">{sub}</span>}
        </span>
        <span className="rcp-amt">
          <span className="rcp-eur">{amount}{mark}</span>
          {each && <span className="rcp-each">{each}</span>}
        </span>
        <HouseIcon.next size={16} className="rcp-chev" />
      </Pressable>
      {open && (
        <div className="rcp-lever" id={`${id}-lever`} role="group" aria-label={t(`price.lever.${kind}`)}>
          {children}
        </div>
      )}
    </li>
  );
}

/** One option of a lever: its name and this place's price, the chosen one
 *  painted. */
function Option({ on, label, sub = null, eur, onPick, extra = null }) {
  return (
    <Pressable className={`rcp-opt${on ? ' is-on' : ''}`} aria-pressed={on} haptic={on ? null : 'tick'} onClick={onPick}>
      <span className="rcp-opt-what">
        <span className="rcp-opt-label">{label}</span>
        {sub && <span className="rcp-opt-sub">{sub}</span>}
      </span>
      <span className="rcp-opt-eur">{eur == null ? <NotYet /> : <Money value={eur} />}{extra}</span>
      {on && <HouseIcon.check size={16} className="rcp-opt-tick" />}
    </Pressable>
  );
}

const destOf = (data, s) => data?.destinations?.[s.place?.id] || null;
const tierOf = (v) => (v === 'hotel' ? 'hotel3' : v || 'home');

/** A pick made in the receipt is this trip's: the style is held, not
 *  rewritten (hooks/useTravelStyles.js), as the planner's Who does. */
function useTripSet(ctx) {
  const ts = useSettings()?.travelStyles;
  return (fn) => { if (!ctx?.setChoices) return; ts?.hold?.(); ctx.setChoices(fn); };
}

function BedRow({ s, r, data, ctx, open, onToggle, t }) {
  const view = useDayView();
  const set = useTripSet(ctx);
  const tier = tierOf(ctx?.choices?.stay_tier);
  const thin = bedIsThin(s.cost);
  const tiers = useMemo(() => offeredStayTiers(data?.meta), [data?.meta]);
  const dest = destOf(data, s);
  // This place's night at every bed the data prices, for the view's people;
  // worked out when the row opens.
  const nights = useMemo(() => {
    if (!open || !dest) return [];
    return tiers.map((k) => {
      const a = priceDay(dest, { ...view.request, stay: k }, data.destinations);
      const eur = a && !a.tierFallback && a.stayEur > 0 ? a.stayEur * (r.group ? r.n : 1) : null;
      return { tier: k, eur };
    }).filter((o) => o.eur != null || o.tier === tier);
  }, [open, dest, tiers, view.request, data, r.group, r.n, tier]);
  return (
    <Row kind="bed" Icon={HouseIcon.bed} title={t('price.item.bed')} sub={t(`stay.${tier}`)}
      amount={cents(r.bed.eur) ?? <NotYet />}
      each={r.bed.each != null ? t('price.perNight', { price: formatMoney(r.bed.each) }) : null}
      mark={thin ? <span className="rcp-thin" role="img" aria-label={t('price.bedThin')} title={t('price.bedThin')} /> : null}
      open={open} onToggle={onToggle} t={t}>
      {nights.map((o) => (
        <Option key={o.tier} on={o.tier === tier} label={t(`stay.${o.tier}`)} eur={o.eur}
          onPick={() => o.tier !== tier && set((prev) => ({ ...prev, stay_tier: o.tier }))} />
      ))}
    </Row>
  );
}

function FoodRow({ s, r, data, ctx, open, onToggle, t }) {
  const view = useDayView();
  const set = useTripSet(ctx);
  const profile = matchProfile(ctx?.choices?.lifestyle || DEFAULT_LIFESTYLE);
  const dest = destOf(data, s);
  const days = useMemo(() => {
    if (!open || !dest) return [];
    return Object.keys(PROFILES).map((name) => {
      const a = priceDay(dest, { ...view.request, lifestyle: PROFILES[name] }, data.destinations);
      return { name, eur: a && a.foodEur > 0 ? a.foodEur * (r.group ? r.n : 1) : null };
    });
  }, [open, dest, view.request, data, r.group, r.n]);
  return (
    <Row kind="food" Icon={HouseIcon.food} title={t('price.item.food')}
      sub={profile ? t(PROFILE_LABEL_KEYS[profile]) : t('lifestyle.custom')}
      amount={cents(r.food.eur) ?? <NotYet />}
      each={r.food.each != null ? t('price.perDay', { price: formatMoney(r.food.each) }) : null}
      open={open} onToggle={onToggle} t={t}>
      {days.map((o) => (
        <Option key={o.name} on={o.name === profile} label={t(PROFILE_LABEL_KEYS[o.name])} eur={o.eur}
          onPick={() => o.name !== profile && set((prev) => ({ ...prev, lifestyle: { ...PROFILES[o.name] } }))} />
      ))}
    </Row>
  );
}

const wayTitle = (t, mode) => {
  if (mode === 'plane') return t('price.item.flight');
  if (WAY_ICON[mode]) return t('price.item.way', { mode: t(`way.${mode}`) });
  return t('way.label');
};
const hoursOf = (w) => (Number.isFinite(w?.hours) ? minutesText(Math.round(w.hours * 60))
  : Number.isFinite(w?.minutes) ? minutesText(w.minutes) : null);

function WayRow({ s, r, data, open, onToggle, t }) {
  const view = useDayView();
  const settings = useSettings();
  const way = s.cost?.way || null;
  const mode = r.way.mode || way?.mode || 'any';
  const Icon = WAY_ICON[mode] || HouseIcon.route;
  const dest = destOf(data, s);
  // Every way the models price for this place from the traveller's start
  // (browse/placeWays.js, what the place page shows), for the view's people.
  const ways = useMemo(() => {
    if (!open || !dest) return [];
    const choices = { drive_home: settings?.fromPlace || null, origin: settings?.origin || null,
      group_size: settings?.party, children: settings?.children, babies: settings?.babies };
    const w = waysThere({
      dest, anchor: destAnchor(dest), home: homePoint(choices, data), party: partyOf(choices),
      flights: flightFiles(data), request: view.request,
    });
    return w?.rows || [];
  }, [open, dest, data, settings, view.request]);
  const k = r.group ? r.n : 1;
  // The price chain's step names the leg (G12, D10, owner 2026-11-20: the
  // card shows no sign, the receipt says which): "Typical for this route",
  // "Estimated, by train" or "Way there not priced yet"; else the airline
  // or the hours. The typical fare's full sentence stays in the amount's
  // info (its name and hover title).
  const [noteKey] = wayLegNote(r.way);
  const sub = noteKey ? t(noteKey) : mode === 'plane' ? way?.airline || null : hoursOf(way);
  const typical = mode === 'plane' && way?.typical ? t('settingsSum.typical') : null;
  const pick = (m) => {
    if (m !== mode) settings?.set?.setWay?.(m);
    if (m === 'plane') showPriceView('flights');
  };
  return (
    <Row kind="way" Icon={Icon} title={wayTitle(t, mode)} sub={sub}
      amount={r.way.eur == null ? <NotYet /> : cents(r.way.eur)}
      mark={typical ? <span className="rcp-info" role="img" aria-label={typical} title={typical}><HouseIcon.bulb size={14} /></span> : null}
      open={open} onToggle={onToggle} t={t}>
      {ways.map((w) => (
        <Option key={w.mode} on={w.mode === mode} label={t(`way.${w.mode}`)}
          sub={w.mode === 'plane' ? null : hoursOf(w)} eur={w.perPerson > 0 ? w.perPerson * k : null}
          extra={w.mode === 'plane' ? <HouseIcon.next size={14} className="rcp-opt-go" /> : null}
          onPick={() => pick(w.mode)} />
      ))}
      {mode === 'plane' && !ways.some((w) => w.mode === 'plane') && (
        <Option on label={t('way.plane')} eur={r.way.eur} extra={<HouseIcon.next size={14} className="rcp-opt-go" />}
          onPick={() => showPriceView('flights')} />
      )}
    </Row>
  );
}

/**
 * The desktop popover: hangs under (or over) the tapped card and follows it
 * on scroll, so reading the list behind it never closes it.
 */
function Popover({ anchor, label, onClose, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const place = () => {
      if (!anchor?.isConnected) return;
      const r = anchor.getBoundingClientRect();
      const w = Math.min(POP_W, window.innerWidth - 2 * GUTTER);
      const left = Math.max(GUTTER, Math.min(r.left + r.width / 2 > window.innerWidth / 2 ? r.right - w : r.left, window.innerWidth - GUTTER - w));
      const maxH = Math.min(680, window.innerHeight - 2 * GUTTER);
      const h = Math.min(ref.current?.offsetHeight || maxH, maxH);
      const below = r.bottom + GAP;
      const top = below + h <= window.innerHeight - GUTTER ? below
        : r.top - GAP - h >= GUTTER ? r.top - GAP - h
          : Math.max(GUTTER, window.innerHeight - GUTTER - h);
      setPos({ left: Math.round(left), top: Math.round(top), width: Math.round(w), maxHeight: maxH });
    };
    place();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null;
    if (ro && ref.current) ro.observe(ref.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  // The receipt's head takes focus once it is placed, so a keyboard or
  // screen reader user lands in what they opened.
  useEffect(() => {
    if (!pos) return;
    const el = ref.current;
    if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
  }, [pos]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    // A press on the card that opened it is the card's own toggle.
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchor?.contains(e.target)) return;
      closePriceSheet();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchor, onClose]);

  // Non-modal: Tab may leave it, and then it closes, as the docks do.
  const onBlur = (e) => {
    const next = e.relatedTarget;
    if (!next || ref.current?.contains(next) || anchor?.contains(next)) return;
    closePriceSheet();
  };

  return createPortal(
    <div ref={ref} role="dialog" aria-modal="false" aria-label={label} tabIndex={-1} className="psheet psheet-pop rcp-pop"
      style={pos ? { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight } : { visibility: 'hidden' }}
      onBlur={onBlur} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}
