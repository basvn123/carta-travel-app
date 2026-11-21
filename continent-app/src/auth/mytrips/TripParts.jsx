import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import {
  CalendarIcon, PlaneIcon, BedIcon, SunIcon, CheckIcon, ChevronRightIcon, ChevronDownIcon, EyeIcon, CloseIcon,
  PersonIcon, FriendsIcon, PlusIcon, ShareIcon, LinkIcon, DownloadIcon, MoonIcon, GlobeIcon, CameraIcon,
} from '../../components/Icons.jsx';
import { priceUnit, setSpan, setPeople, stepNights, MAX_PEOPLE } from '../../lib/price/priceView.js';
import { formatMoney } from '../../lib/money.js';

/* Reizen (G12, Phase C): the parts of the approved reference's Trips tab
   that the trip card, the rows and the panel share. */

/** A trip's figure in the traveller's chosen unit (the "Prijzen tonen"
 *  setting), from tripFigure(): a day or the whole trip, one person or the
 *  trip's own party. Whole trips use the engine's own totals, so the figure
 *  is never a day multiplied back up. Null without a figure. */
// eslint-disable-next-line react-refresh/only-export-components -- a pure helper the panel shares
export function tripInUnit(figure, choices) {
  if (!figure) return null;
  const u = priceUnit(choices);
  const party = Math.max(1, figure.party || 1);
  if (u.span === 'trip') return u.group ? figure.total : figure.perPerson;
  const day = figure.perPersonDay;
  return Number.isFinite(day) ? day * (u.group ? party : 1) : null;
}

/** The unit in words: "Per dag, 1 persoon". */
// eslint-disable-next-line react-refresh/only-export-components -- a pure helper the panel shares
export function unitWords(t, choices, party = null) {
  const u = priceUnit(choices);
  const n = party || u.seats;
  if (u.span === 'trip') return u.group ? t('mt.unitTripGroup', { n }) : t('mt.unitTripPp');
  return u.group ? t('mt.unitDayGroup', { n }) : t('mt.unitDayPp');
}

/** Closes a small popover on an outside press or Escape. */
function useDismiss(open, setOpen, box) {
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', off, true);
    document.addEventListener('keydown', key, true);
    return () => { document.removeEventListener('pointerdown', off, true); document.removeEventListener('keydown', key, true); };
  }, [open, setOpen, box]);
}

/**
 * "Voor 1 persoon" / "Voor N personen" (G12 polish): one button and a short
 * menu, 1 to 4 and a stepper for more. It writes the People setting and the
 * unit together (priceView.setPeople), the setting Explore reads, so 1 reads
 * per person and N reads the group of N everywhere.
 */
export function PeopleButton({ choices, setChoices }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useDismiss(open, setOpen, box);
  const n = priceUnit(choices).n;
  const set = (k, close = true) => { setChoices?.(setPeople(k)); if (close) setOpen(false); };
  const label = n === 1 ? t('mt.forOne') : t('mt.forN', { n });
  return (
    <span className="mt-who" ref={box}>
      <Pressable className="mt-whobtn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {n === 1 ? <PersonIcon size={16} /> : <FriendsIcon size={16} />}<b>{label}</b><ChevronDownIcon size={14} />
      </Pressable>
      {open && (
        <span className="mt-who-menu" role="group" aria-label={t('mt.pricesFor')}>
          <span className="mt-who-h" aria-hidden="true">{t('mt.pricesFor')}</span>
          {[1, 2, 3, 4].map((k) => (
            <Pressable key={k} aria-pressed={n === k} onClick={() => set(k)}>
              {k === 1 ? <PersonIcon size={16} /> : <FriendsIcon size={16} />}
              {k === 1 ? t('mt.onePerson') : t('mt.nPeople', { n: k })}
              <small>{t(k === 1 ? 'mt.unitEach' : 'mt.unitGroup')}</small>
            </Pressable>
          ))}
          <span className="mt-who-step">
            <span>{t('mt.morePeople')}</span>
            <Pressable aria-label={t('mt.oneLess')} disabled={n <= 1} onClick={() => set(n - 1, false)}><span className="atlas-minus" aria-hidden="true" /></Pressable>
            <b aria-live="polite">{n}</b>
            <Pressable aria-label={t('mt.oneMore')} disabled={n >= MAX_PEOPLE} onClick={() => set(n + 1, false)}><PlusIcon size={14} /></Pressable>
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * The compact price control: [Per dag | Hele reis], the People button and,
 * for Hele reis, the nights stepper. It writes the one "Prijzen tonen"
 * setting Explore writes, through lib/price/priceView.
 */
export function PriceControl({ choices, setChoices, withNights = true }) {
  const { t } = useI18n();
  const u = priceUnit(choices);
  const set = (fn) => setChoices?.(fn);
  return (
    <div className="atlas-pricectl" role="group" aria-label={t('ac.showPrices')}>
      <span className="atlas-seg2">
        <Pressable aria-pressed={u.span === 'day'} onClick={() => set(setSpan('day'))}>{t('mt.perDay')}</Pressable>
        <Pressable aria-pressed={u.span === 'trip'} onClick={() => set(setSpan('trip'))}>{t('mt.wholeTrip')}</Pressable>
      </span>
      <PeopleButton choices={choices} setChoices={setChoices} />
      {withNights && u.span === 'trip' && (
        <span className="atlas-nights" role="group" aria-label={t('mt.nightsGroup')}>
          <span>{t('mt.nightsShort', { n: u.nights })}</span>
          <Pressable aria-label={t('mt.nightLess')} onClick={() => set(stepNights(-1))}><span className="atlas-minus" aria-hidden="true" /></Pressable>
          <Pressable aria-label={t('mt.nightMore')} onClick={() => set(stepNights(1))}><PlusIcon size={14} /></Pressable>
        </span>
      )}
    </div>
  );
}

/** "Prijzen tonen" as a sheet, opened from the plate or a unit button. */
export function UnitSheet({ choices, setChoices, onClose }) {
  const { t } = useI18n();
  return (
    <SheetShell title={t('ac.showPrices')} onClose={onClose} labelId="mt-unit-title" width={420} className="mt-unit-sheet">
      <PriceControl choices={choices} setChoices={setChoices} />
      <div className="mt-sheet-foot">
        <Button variant="primary" onClick={onClose}>{t('saved.done')}</Button>
      </div>
    </SheetShell>
  );
}

/** The unit as a quiet button: the control says the unit, not each row. */
export function UnitButton({ choices, onOpen }) {
  const { t } = useI18n();
  return (
    <Pressable className="mt-unit-btn" onClick={onOpen}>
      {unitWords(t, choices)}<ChevronDownIcon size={14} />
    </Pressable>
  );
}

/** The umber mark plate (Revision 2): the figure only, a chevron; a tap opens Prijzen tonen. */
export function MarkPlate({ value, est = false, label, onOpen }) {
  return (
    <Pressable className="mt-mark-plate" onClick={onOpen} aria-label={label}>
      <b className="mt-mark-fig">{est ? '~' : ''}{formatMoney(value)}</b>
      <ChevronDownIcon size={18} />
    </Pressable>
  );
}

const TILE_ICON = { dates: CalendarIcon, travel: PlaneIcon, beds: BedIcon, days: SunIcon };

/** Ready for the trip as four step tiles (Revision 1), each a door to its step. */
export function ReadyTiles({ readiness, onStep }) {
  const { t } = useI18n();
  if (!readiness) return null;
  const name = { dates: 'mt.tileDates', travel: 'mt.tileTravel', beds: 'mt.tileBeds', days: 'mt.tileDays' };
  return (
    <section className="mt-ready mt-ready4" aria-labelledby="mt-ready-h">
      <div className="mt-ready-head">
        <h4 className="mt-ready-title" id="mt-ready-h">{t('mt.readyTitle')}</h4>
        <span className="mt-ready-n">{t('mt.readyDone', { n: readiness.done, of: readiness.total })}</span>
      </div>
      <div className="mt-tiles4">
        {readiness.steps.map((s) => {
          const Icon = TILE_ICON[s.key] || CalendarIcon;
          const count = (s.key === 'beds' || s.key === 'days') && !s.done ? t('mt.tileOf', { n: s.n, of: s.of }) : '';
          return (
            <Pressable key={s.key} className={`mt-tile${s.done ? ' is-done' : ''}`} onClick={() => onStep?.(s.key)}>
              <i aria-hidden="true">{s.done ? <CheckIcon size={14} /> : <Icon size={14} />}</i>
              <span>
                {t(name[s.key] || 'mt.tileDays')}
                {count && <small>{count}</small>}
                <span className="sr-only">{t(s.done ? 'mt.stepIsDone' : 'mt.stepIsOpen')}</span>
              </span>
            </Pressable>
          );
        })}
      </div>
    </section>
  );
}

/** "Na deze reis", collapsed: what this trip will add to Your Europe. */
export function AfterTrip({ country = '', nights = 0, onEurope }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const rows = [
    country ? { k: 'c', icon: <GlobeIcon size={16} />, text: t('mt.afterCountry', { country }) } : null,
    { k: 'm', icon: <CameraIcon size={16} />, text: t('mt.afterMemory') },
    { k: 'y', icon: <CalendarIcon size={16} />, text: t('mt.afterCard') },
    nights > 0 ? { k: 'n', icon: <MoonIcon size={16} />, text: t('mt.afterNights', { n: nights }) } : null,
  ].filter(Boolean);
  return (
    <div className={`mt-disc${open ? ' is-open' : ''}`}>
      <Pressable aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {t('mt.after')}<ChevronRightIcon size={18} className="mt-disc-chev" />
      </Pressable>
      {open && (
        <ul>
          {rows.map((r) => (
            <li key={r.k}>
              <Pressable onClick={onEurope}><span aria-hidden="true">{r.icon}</span>{r.text}</Pressable>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The one dark umber Example pill, sticky under the tabs (Revision 1). */
export function ExampleBar({ onClose }) {
  const { t } = useI18n();
  return (
    <div className="atlas-example mt-exbar" role="status">
      <EyeIcon size={16} /><span>{t('mt.example')}</span>
      <Pressable onClick={onClose} aria-label={t('mt.exampleCloseAria')}>
        {t('mt.exampleClose')} <CloseIcon size={14} />
      </Pressable>
    </div>
  );
}

/** "Hoe was {trip}?": ten taps, the traveller's own grade (decision 8). */
export function RateTrip({ title, onRate }) {
  const { t } = useI18n();
  return (
    <section className="mt-rate" aria-labelledby="mt-rate-h">
      <b id="mt-rate-h">{t('mt.rateQ', { trip: title })}</b>
      <div className="mt-rate-scale" role="group" aria-labelledby="mt-rate-h">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable key={n} haptic="tick" aria-label={t('mt.rateN', { n })} onClick={() => onRate(n)}>{n}</Pressable>
        ))}
      </div>
    </section>
  );
}

/** The share icon in the card head: the route as an image, beside the
 *  existing share panel (invite and link). */
export function ShareMenu({ onImage, onShare }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useDismiss(open, setOpen, box);
  const pick = (fn) => () => { setOpen(false); fn?.(); };
  return (
    <span className="mt-share" ref={box}>
      <IconButton label={t('mt.shareRoute')} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <ShareIcon size={18} />
      </IconButton>
      {open && (
        <span className="mt-share-pop">
          <Pressable onClick={pick(onImage)}><DownloadIcon size={16} />{t('mt.shareRouteImg')}</Pressable>
          {onShare && <Pressable onClick={pick(onShare)}><LinkIcon size={16} />{t('saved.shareInvite')}</Pressable>}
        </span>
      )}
    </span>
  );
}
