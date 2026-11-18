/**
 * The price sheet (D10, G12, explore polish decision step 6; strings
 * copy.md 2 to 6). A row's figure and each wagon open it on the tab that
 * explains what was tapped: Flight (or the row's own ground way), Stay,
 * Food, In this price. Each tab says what its number is built on in one
 * line and has one button to the setting that moves it (the Trip dock at
 * From for getting there and the whole day, the Style dock at the Stay,
 * Food or Way row).
 *
 * Phone: the shared bottom sheet (SheetShell), modal and full width.
 * 769 px and up: a 380 px popover hung off the tapped part, non-modal: it
 * follows the part on scroll instead of closing (the owner reads the list
 * behind it), Escape and a press outside close it, focus goes back.
 *
 * Mounted once in App beside the docks; rows only call openPriceSheet.
 */
import React, { Suspense, lazy, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/index.jsx';
import { useDayView } from '../../hooks/useDayView.js';
import { formatApprox, formatMoney } from '../../lib/money.js';
import { seatsOf } from '../../lib/price/request.js';
import { rowFigures } from '../../lib/price/rowFigures.js';
import {
  TABS, capturedMonth, foodBasisKey, handoff, inPriceRows, isGroundWay, stayBasisKey, wayTabKey,
} from '../../lib/price/priceSheet.js';
import { partyText } from '../../lib/party.js';
import { countryName } from '../../lib/countryName.js';
import { matchProfile, PROFILE_LABEL_KEYS } from '../../browse/styles/spendBits.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { Button, Tabs } from '../ui/index.js';
import NotYet from '../NotYet.jsx';
import { openDock } from '../dock/dockStore.js';
import { closePriceSheet, usePriceSheet } from './priceSheetStore.js';
import '../../styles/86-price-items.css';

const FlightTab = lazy(() => import('./FlightTab.jsx'));

const DESKTOP_FROM = 769;
const POP_W = 380;
const GUTTER = 16;
const GAP = 8;

// Explore rows carry the place's name as `city`.
const placeName = (p) => p?.name || p?.city || '';
const isDesktop = () => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_FROM;

export function PriceSheet({ data }) {
  const s = usePriceSheet();
  if (!s) return null;
  return <OpenSheet key={`${s.place?.id}-${s.tab}`} s={s} data={data} />;
}

function OpenSheet({ s, data }) {
  const { t } = useI18n();
  const [tab, setTab] = useState(s.tab);
  const [desk] = useState(isDesktop);
  const baseId = useId();
  const title = t('price.sheetLabel', { place: placeName(s.place) });

  const close = () => {
    closePriceSheet();
    if (s.anchor?.isConnected) s.anchor.focus({ preventScroll: true });
  };
  // A hand-off closes the sheet without handing focus back, then opens the
  // dock at its row, which takes focus (accessibility critique: the sheet's
  // focus return would race the dock's).
  const handOff = (h) => {
    closePriceSheet();
    requestAnimationFrame(() => openDock(h.dock, { focus: h.focus }));
  };

  const body = <SheetBody s={s} data={data} tab={tab} setTab={setTab} baseId={baseId} onHand={handOff} t={t} />;
  if (desk) {
    return <Popover anchor={s.anchor} label={title} onClose={close}>{body}</Popover>;
  }
  return (
    <SheetShell title={title} onClose={close} className="psheet" labelId={`${baseId}-title`} closeLabel={t('price.close')}>
      {body}
    </SheetShell>
  );
}

function SheetBody({ s, data, tab, setTab, baseId, onHand, t }) {
  const view = useDayView();
  const wrapRef = useRef(null);
  const tabs = TABS.map((id) => ({ id, label: id === 'flight' ? t(wayTabKey(s.cost)) : t(`price.tab${id === 'in' ? 'In' : id[0].toUpperCase() + id.slice(1)}`) }));
  // The tapped part chose the tab; it takes focus so a keyboard or screen
  // reader user lands on what they opened.
  // Two frames: the phone sheet's trap focuses its close button in its own
  // effect after this one, and the desktop popover is hidden until placed.
  useEffect(() => {
    let id = requestAnimationFrame(() => {
      id = requestAnimationFrame(() => {
        wrapRef.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
      });
    });
    return () => cancelAnimationFrame(id);
  }, []);
  const panelId = `${baseId}-panel`;
  const shownLabel = tabs.find((x) => x.id === tab)?.label;

  return (
    <div className="psheet-in" ref={wrapRef}>
      <Tabs label={t('price.sheetLabel', { place: placeName(s.place) })} tabs={tabs} value={tab} onChange={setTab}
        panelId={panelId} className="psheet-tabs" />
      <div className="psheet-panel" role="tabpanel" id={panelId} aria-label={shownLabel} data-tab={tab}>
        {tab === 'flight' && (isGroundWay(s.cost)
          ? <WayPanel cost={s.cost} view={view} t={t} onHand={onHand} />
          : (
            <Suspense fallback={<p className="psheet-basis" role="status">{t('price.flight.loading')}</p>}>
              <FlightTab place={s.place} data={data} request={view.request} view={view}
                active={tab === 'flight'} onChangeTrip={() => onHand(handoff('flight', s.cost))} />
            </Suspense>
          ))}
        {tab === 'stay' && <StayPanel s={s} view={view} t={t} onHand={onHand} />}
        {tab === 'food' && <FoodPanel s={s} view={view} t={t} onHand={onHand} />}
        {tab === 'in' && <InPanel s={s} view={view} t={t} onHand={onHand} />}
      </div>
    </div>
  );
}

const list = (lang, items) => {
  const xs = items.filter(Boolean);
  try { return new Intl.ListFormat(lang, { type: 'conjunction' }).format(xs); } catch { return xs.join(', '); }
};
const known = (t, key) => { const v = t(key); return v && v !== key ? v : null; };
const monthName = (ym, lang) => {
  try {
    return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));
  } catch { return ym; }
};

/** The figure, its unit and the estimate tilde, as the row draws them. */
function Big({ eur, est, unit }) {
  return (
    <p className="psheet-figrow">
      {eur == null ? <NotYet className="psheet-big" /> : (
        <span className="psheet-big money">{est ? formatApprox(eur) : formatMoney(eur)}</span>
      )}
      {eur != null && <span className="psheet-unit">{unit}</span>}
    </p>
  );
}

function Foot({ h, t, onHand }) {
  return (
    <div className="psheet-foot">
      <Button variant="primary" block className="psheet-primary" data-handoff={`${h.dock}:${h.focus}`} onClick={() => onHand(h)}>
        {t(h.key)}
      </Button>
    </div>
  );
}

// The row's own figures (rowFigures), so the sheet and the row it opened
// from cannot show two amounts for one thing.
function useFigures(cost, view) {
  const req = view.request;
  return { f: rowFigures(cost, { group: view.total, seats: seatsOf(req) }), req };
}
const peopleOf = (t, req) => partyText(t, req.group || {});

function StayPanel({ s, view, t, onHand }) {
  const { lang } = useI18n();
  const { f, req } = useFigures(s.cost, view);
  const people = peopleOf(t, req);
  const key = stayBasisKey(s.cost);
  const ym = capturedMonth(s.cost);
  const unit = f.group ? t('price.unitNightGroup', { people }) : t('price.unitNight');
  return (
    <div className="psheet-tabbody">
      <h3 className="psheet-h">{t('price.stay.title')}</h3>
      <Big eur={f.bed} est={s.cost?.stayLevel !== 'city'} unit={unit} />
      <p className="psheet-basis" data-basis={key}>{t(key, { month: ym ? monthName(ym, lang) : '' })}</p>
      <p className="psheet-basis">{t('price.yourSettings', { list: list(lang, [known(t, `stay.${req.stay}`), people]) })}</p>
      <Foot h={handoff('stay')} t={t} onHand={onHand} />
    </div>
  );
}

function FoodPanel({ s, view, t, onHand }) {
  const { lang } = useI18n();
  const { f, req } = useFigures(s.cost, view);
  const people = peopleOf(t, req);
  const key = foodBasisKey(s.cost);
  const unit = f.group ? t('price.unitDayGroup', { people }) : t('price.unitDay');
  const profile = matchProfile(req.lifestyle);
  const country = countryName(s.place?.iso2, s.place?.country || '');
  return (
    <div className="psheet-tabbody">
      <h3 className="psheet-h">{t('price.food.title')}</h3>
      <Big eur={f.food} est={s.cost?.foodLevel !== 'city'} unit={unit} />
      <p className="psheet-basis" data-basis={key}>{t(key, { country })}</p>
      {!f.group && (req.group?.children || 0) > 0 && <p className="psheet-basis">{t('price.food.kids')}</p>}
      <p className="psheet-basis">{t('price.yourSettings', { list: list(lang, [profile ? known(t, PROFILE_LABEL_KEYS[profile]) : null, people]) })}</p>
      <Foot h={handoff('food')} t={t} onHand={onHand} />
    </div>
  );
}

function InPanel({ s, view, t, onHand }) {
  const { f, req } = useFigures(s.cost, view);
  const people = peopleOf(t, req);
  const way = s.cost?.way;
  const wayEur = req.excluded?.includes('flight') ? null : view.way(way?.perPerson);
  const rows = inPriceRows(s.cost, { group: f.group, seats: f.seats, wayEur });
  const unit = f.group ? t('price.unitDayGroup', { people }) : t('price.unitDay');
  const label = (r) => {
    if (r.key === 'sum') return t('price.in.sum');
    if (r.key === 'way') return r.mode === 'plane' ? t('price.item.flight') : t('price.item.way', { mode: t(`way.${r.mode}`) });
    return t(`price.item.${r.key}`);
  };
  const value = (r) => {
    if (r.key === 'transport' && r.eur == null) return <span className="psheet-muted">{t('price.notYetMeasured')}</span>;
    if (r.eur == null) return <NotYet />;
    if (r.key === 'way') return <span className="money">{t('price.onTop', { price: formatMoney(r.eur) })}</span>;
    return <span className="money">{formatMoney(r.eur)}</span>;
  };
  return (
    <div className="psheet-tabbody">
      <h3 className="psheet-h">{t('price.in.title')}</h3>
      <Big eur={f.day} est={s.cost?.stayLevel !== 'city' || s.cost?.foodLevel !== 'city'} unit={unit} />
      <ul className="psheet-items">
        {rows.map((r) => (
          <li key={r.key} className={`psheet-item is-${r.key}${r.apart ? ' is-apart' : ''}`} data-item={r.key}>
            <span>{label(r)}</span>
            {value(r)}
          </li>
        ))}
      </ul>
      <p className="psheet-basis">{t('price.in.covers')}</p>
      <Foot h={handoff('in')} t={t} onHand={onHand} />
    </div>
  );
}

/** Train, bus or car: the way's own figure and basis, no flight wording. */
function WayPanel({ cost, view, t, onHand }) {
  const way = cost.way;
  const req = view.request;
  const kids = (req.group?.children || 0) + (req.group?.babies || 0) > 0;
  const unit = view.total ? t('price.flight.unitGroup', { n: seatsOf(req) }) : t('price.flight.unit');
  return (
    <div className="psheet-tabbody">
      <h3 className="psheet-h">{t('price.item.way', { mode: t(`way.${way.mode}`) })}</h3>
      <Big eur={view.way(way.perPerson)} est unit={unit} />
      <p className="psheet-basis">{t(way.mode === 'car' ? 'price.way.basisCar' : 'price.way.basis')}</p>
      {kids && way.mode !== 'car' && <p className="psheet-basis">{t('price.way.kids')}</p>}
      <Foot h={handoff('flight', cost)} t={t} onHand={onHand} />
    </div>
  );
}

/**
 * The desktop popover: hangs under (or over) the tapped part and follows it
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
      const maxH = Math.min(640, window.innerHeight - 2 * GUTTER);
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

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      e.preventDefault();
      onClose();
    };
    // A press on the part that opened it is the part's own toggle.
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
    <div ref={ref} role="dialog" aria-modal="false" aria-label={label} className="psheet psheet-pop"
      style={pos ? { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight } : { visibility: 'hidden' }}
      onBlur={onBlur} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}
