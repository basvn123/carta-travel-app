import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, ChipGroup, IconButton, Tabs } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import {
  AlertIcon, ArrowLeftIcon, ArrowRightIcon, BeachIcon, BedIcon, BikeIcon, BootIcon, BusIcon, CalendarIcon, CheckIcon,
  ChevronRightIcon, CityIcon, CloseIcon, DiamondIcon, DiningIcon, FriendsIcon, HeartIcon, InfoIcon, LakeIcon, LotusIcon,
  MapPinIcon, MoonIcon, MuseumIcon, MusicIcon, PalmIcon, PlaneIcon, SnowIcon, SparkIcon, SunIcon, TicketIcon,
} from '../../components/Icons.jsx';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { durationMs, prefersReducedMotion, useDialogExit } from '../../lib/motion.js';
import { fetchDestPoiMap } from '../../lib/appData.js';
import { formatMoney } from '../../lib/money.js';
import { monthName } from '../../lib/dates.js';
import { cityLabel } from '../../lib/placeName.js';
import { CROWD_KEYS, crowdTier, dayHighs } from '../../lib/recommend/compare.js';
import { chooseOption, slotTotals } from '../../lib/recommend/slots.js';
import { useTotalDelta } from '../planHooks.js';
import { useBcp47, useMonths, whenText } from '../flow/flowHooks.js';
import { useKeepTrip } from './finderHooks.js';
import { LinePicker } from './LinePicker.jsx';
import {
  factText, likeLabel, matchBars, pickLine, signedMoney, topSights, totalLeavesOut, tripName, tripPhotos, whyLine, withSlot,
} from './finderText.js';

/** The icon of each price line (config/slots.json names the same ones). */
const SLOT_ICON = { flight: PlaneIcon, stay: BedIcon, food: DiningIcon, local: BusIcon, activities: TicketIcon };

/** The icon of each like (question 2's answers). */
const LIKE_ICON = {
  beach: BeachIcon, hiking: BootIcon, lakes: LakeIcon, culture: MuseumIcon, city: CityIcon, food: DiningIcon,
  nightlife: MusicIcon, hidden: DiamondIcon, cycling: BikeIcon, ski: SnowIcon, wellness: LotusIcon, islands: PalmIcon,
};

const PHONE = '(max-width: 768px)';
const isPhone = () => typeof window !== 'undefined' && window.matchMedia?.(PHONE).matches;

/** The POI lists of the trip's places (public/poi shards, cached by appData). */
function usePlacePois(ids) {
  const key = ids.join('|');
  const [state, setState] = useState({ key: null, map: null });
  useEffect(() => {
    let alive = true;
    fetchDestPoiMap(key.split('|')).then((map) => { if (alive) setState({ key, map }); }).catch(() => { if (alive) setState({ key, map: {} }); });
    return () => { alive = false; };
  }, [key]);
  return state.key === key ? state.map : null;
}

/**
 * The photo track (T811): the places' own photos, then the best sights
 * near them. One photo a screen on a phone, swiped; on a desktop two or
 * three across with Previous and Next. The position and the photo's name
 * sit on the caption line under it.
 */
function Gallery({ photos, name, t }) {
  const track = useRef(null);
  const [at, setAt] = useState(0);
  const step = () => {
    const el = track.current;
    const slide = el?.firstElementChild;
    return slide ? slide.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || '0') : 0;
  };
  const go = (dir) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * step(), behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };
  const onScroll = () => {
    const s = step();
    if (s) setAt(Math.min(photos.length - 1, Math.round(track.current.scrollLeft / s)));
  };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  };
  const cur = photos[at] || photos[0];
  return (
    <div className="tff-gal">
      <div className="tff-gal-track" ref={track} onScroll={onScroll} onKeyDown={onKeyDown} tabIndex={0} role="region" aria-label={t('tf.pv.gallery', { name })}>
        {photos.map((p, i) => (
          <div className="tff-gal-slide" key={p.url}>
            <HeroImage url={p.url} city={p.city} iso2={p.iso2} className="tff-gal-img" maxWidth={960} sizes="(max-width: 768px) 100vw, 480px" ratio={[3, 2]} eager={i === 0} />
          </div>
        ))}
      </div>
      {photos.length > 1 && (
        <>
          <IconButton tone="photo" className="tff-gal-prev" label={t('tf.pv.prev')} disabled={at === 0} onClick={() => go(-1)}>
            <ArrowLeftIcon size={18} />
          </IconButton>
          <IconButton tone="photo" className="tff-gal-next" label={t('tf.pv.next')} disabled={at >= photos.length - 1} onClick={() => go(1)}>
            <ArrowRightIcon size={18} />
          </IconButton>
        </>
      )}
      {cur && (
        <p className="tff-gal-cap">
          <span className="tff-gal-name">{cur.caption}</span>
          {photos.length > 1 && <span className="tff-gal-pos">{t('tf.pv.pos', { n: at + 1, total: photos.length })}</span>}
        </p>
      )}
    </div>
  );
}

/** "Why it fits": a row per like with its icon and bar, the reasons, what stands against it. */
function WhyFits({ trip, t, lang }) {
  const bars = matchBars(trip);
  const against = (trip.match?.conflicts || []).filter((c) => ['busy', 'car', 'heat'].includes(c.key));
  const againstText = (c) => (c.key === 'heat'
    ? t('tf.why.heat', { month: monthName(c.month ?? trip.month, lang) })
    : factText({ key: `tf.catch.${c.key}`, facts: { place: c.place, month: c.month ?? trip.month } }, { t, lang }));
  const catchText = trip.catch ? factText(trip.catch, { t, lang }) : '';
  const lines = [...new Set([...against.map(againstText), catchText].filter(Boolean))];
  return (
    <div className="tff-fit">
      {bars.length > 0 && (
        <ul className="tff-fit-bars">
          {bars.map((b) => {
            const Icon = LIKE_ICON[b.key] || SparkIcon;
            return (
              <li key={b.key} className="tff-fit-bar">
                <Icon size={18} />
                <span className="tff-fit-label">{likeLabel(t, b.key)}</span>
                <span className="tff-fit-track" aria-hidden="true"><span className="tff-fit-fill" style={{ transform: `scaleX(${b.pct / 100})` }} /></span>
                <span className="tff-fit-pct">{t('tf.why.pct', { pct: b.pct })}</span>
              </li>
            );
          })}
        </ul>
      )}
      {(trip.reasons.length > 0 || lines.length > 0) && (
        <ul className="tff-fit-lines">
          {trip.reasons.map((r, i) => <li key={`r${i}`}><CheckIcon size={14} /><span>{factText(r, { t, lang })}</span></li>)}
          {lines.map((x) => <li key={x} className="is-catch"><AlertIcon size={14} /><span>{x}</span></li>)}
        </ul>
      )}
    </div>
  );
}

function Overview({ trip, destinations, pois, t, lang, ui }) {
  const { NotYet } = ui;
  const month = monthName(trip.month, lang);
  const highs = dayHighs(trip, destinations);
  const crowd = crowdTier(trip, destinations);
  return (
    <div className="tff-ov">
      <section className="tff-sec">
        <h3 className="tff-sec-title">{t('tf.pv.route')}</h3>
        <ol className="tff-route">
          {trip.places.map((p) => {
            const d = destinations?.[p.id];
            return (
              <li key={p.id} className="tff-route-stop">
                <HeroImage url={d?.image?.url} city={d?.city || ''} iso2={d?.iso2} className="tff-route-img" maxWidth={320} sizes="64px" ratio={[1, 1]} />
                <span className="tff-route-name">{cityLabel(d?.city || '')}</span>
                <span className="tff-route-n"><MoonIcon size={14} />{t('tf.keep.nights', { n: p.nights })}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="tff-sec">
        <h3 className="tff-sec-title">{t('tf.pv.why')}</h3>
        <WhyFits trip={trip} t={t} lang={lang} />
      </section>

      <section className="tff-sec">
        <h3 className="tff-sec-title">{t('tf.pv.see')}</h3>
        {trip.places.map((p) => {
          const d = destinations?.[p.id];
          const sights = pois ? topSights(pois[p.id], 4) : null;
          return (
            <div key={p.id} className="tff-see">
              {trip.places.length > 1 && <h4 className="tff-see-place">{cityLabel(d?.city || '')}</h4>}
              {sights == null ? (
                <div className="tff-see-row is-loading" aria-busy="true"><span className="sr-only">{t('tf.pv.loading')}</span></div>
              ) : sights.length ? (
                <ul className="tff-see-row">
                  {sights.map((s) => (
                    <li key={s.name} className="tff-sight">
                      <HeroImage url={s.img} city={s.name} iso2={d?.iso2} className="tff-sight-img" maxWidth={320} sizes="160px" ratio={[4, 3]} />
                      <span className="tff-sight-name">{s.name}</span>
                      {s.desc && <span className="tff-sight-desc">{s.desc}</span>}
                    </li>
                  ))}
                </ul>
              ) : <NotYet line />}
            </div>
          );
        })}
      </section>

      <section className="tff-sec">
        <h3 className="tff-sec-title">{t('tf.pv.weather')}</h3>
        <dl className="tff-facts">
          <div>
            <dt><SunIcon size={18} />{t('tf.pv.highs', { month })}</dt>
            <dd>{highs ? t(highs.lo === highs.hi ? 'tf.cmp.high' : 'tf.cmp.highs', { lo: highs.lo, hi: highs.hi }) : <NotYet />}</dd>
          </div>
          <div>
            <dt><FriendsIcon size={18} />{t('tf.pv.crowds', { month })}</dt>
            <dd>{crowd != null && CROWD_KEYS[crowd] ? t(CROWD_KEYS[crowd]) : <NotYet />}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

/**
 * The Cost tab: the Lifestyle levers for this trip on top (food, stay),
 * then one row per price line with its icon, Carta's pick and the figure in
 * cents. A row with choices opens its line picker in place; the small (i)
 * beside a row says where its figure comes from. No cost bar.
 */
function Cost({ trip, destinations, onEdit, onLine, rowFocus, t, lang, ui }) {
  const { NotYet } = ui;
  const airlines = ui.useAirlines();
  const airline = (code) => ui.airlineName(airlines, code);
  const [why, setWhy] = useState(null);
  const many = trip.party.head + (trip.party.babies || 0) > 1;
  const money = (eur) => formatMoney(eur, { precision: 'cents', locale: lang });
  const adjustable = ['food', 'stay']
    .map((id) => trip.slots.find((s) => s.id === id))
    .filter((s) => s && s.owner === 'carta' && (s.options || []).filter((o) => o.eur != null).length > 1);
  return (
    <div className="tff-cost">
      {adjustable.length > 0 && (
        <div className="tff-adjusts">
          {adjustable.map((s) => (
            <div key={s.id} className="tff-adj">
              <span className="tff-adj-label" aria-hidden="true">{t(s.id === 'food' ? 'tf.lever.food' : 'tf.card.stay')}</span>
              <ChipGroup label={t(s.id === 'food' ? 'tf.lever.food' : 'tf.card.stay')} className="tff-adj-chips">
                {s.options.filter((o) => o.eur != null).map((o, i) => {
                  const on = s.pick?.id === o.id;
                  return (
                    <Chip
                      key={o.id}
                      kind="choice"
                      selected={on}
                      {...(!s.pick && i === 0 ? { tabIndex: 0 } : {})}
                      onClick={() => { if (!on) onEdit(withSlot(trip, chooseOption(s, o.id), slotTotals)); }}
                    >
                      {t(o.labelKey)}
                    </Chip>
                  );
                })}
              </ChipGroup>
            </div>
          ))}
        </div>
      )}

      <ul className="tff-crows">
        {trip.slots.map((s) => {
          const Icon = SLOT_ICON[s.id] || TicketIcon;
          const opens = s.eur != null && (s.options?.length || s.id === 'flight');
          const body = (
            <>
              <span className="tff-crow-icon"><Icon size={20} /></span>
              <span className="tff-crow-what">
                <span className="tff-crow-label">{t(s.labelKey)}</span>
                {s.eur != null && <span className="tff-crow-pick">{pickLine(s, { t, airline })}</span>}
              </span>
              <span className="tff-crow-fig">{s.eur == null ? <NotYet /> : <span className="money">{money(s.eur)}</span>}</span>
            </>
          );
          return (
            <li key={s.id} className={`tff-crow${s.eur == null ? ' is-notyet' : ''}`}>
              <div className="tff-crow-line">
                {opens ? (
                  <Button
                    variant="quiet"
                    className="tff-crow-main"
                    ref={(el) => { if (el && rowFocus.current === s.id) { rowFocus.current = null; el.focus(); } }}
                    aria-label={t('tf.rc.openLine', { line: t(s.labelKey), price: money(s.eur) })}
                    onClick={() => onLine(s.id)}
                  >
                    {body}
                    <ChevronRightIcon size={16} className="tff-crow-chev" />
                  </Button>
                ) : <div className="tff-crow-main is-static">{body}</div>}
                <IconButton
                  className="tff-crow-info"
                  label={t('tf.pv.whyRow', { line: t(s.labelKey) })}
                  aria-expanded={why === s.id}
                  pressed={why === s.id}
                  onClick={() => setWhy(why === s.id ? null : s.id)}
                >
                  <InfoIcon size={16} />
                </IconButton>
              </div>
              {why === s.id && <p className="tff-crow-why">{whyLine(s, trip, { t, lang, destinations })}</p>}
            </li>
          );
        })}
      </ul>

      {many && (
        <p className="tff-cost-group">
          <span>{t('tf.card.group', { n: trip.party.head + (trip.party.babies || 0) })}</span>
          <span className="money">{money(trip.total.group)}</span>
        </p>
      )}
    </div>
  );
}

/**
 * The trip preview (T811, owner 2026-10-29: "before I plan this trip, I
 * want to see some pictures"): what a card opens, in place of the receipt.
 * The photos across the top, the head (name, country, dates, nights,
 * bases, match), then two tabs: Overview (the route, why it fits, what to
 * see and do, the weather and the crowds) and Cost (the price lines with
 * their icons and pickers, food and stay to adjust). Plan this trip, the
 * total and the heart stay pinned at the foot.
 *
 * A desktop shows it as a wide dialog (up to 1040 px, 90 percent of the
 * height, scrolling inside). A phone shows a sheet that opens half way
 * with the photos, the head and the foot in view; the handle, More or a
 * scroll inside raise it to the full height, and the handle lowers it or,
 * dragged down from half way, closes it. Escape closes it (a picker
 * first), focus returns to the card that opened it (useFocusTrap).
 *
 *   trip           the trip as it stands, swaps included
 *   onEdit(next)   the trip with a line swapped (a picker or a lever)
 *   onPlan(trip)   "Plan this trip" (T801's hand-off)
 *   keepWith       what a kept trip carries (T807)
 */
export function TripPreview({ trip, settings, destinations, ui, onClose, onPlan, onEdit, keepWith = null }) {
  const { t, lang } = useI18n();
  const months = useMonths();
  const bcp47 = useBcp47();
  const titleId = useId();
  const panelId = useId();
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const scrollRef = useRef(null);
  const rowFocus = useRef(null);
  const before = useRef(null);
  const drag = useRef(null);
  const [tab, setTab] = useState('overview');
  const [line, setLine] = useState(null);
  const [full, setFull] = useState(() => !isPhone());
  const exit = useDialogExit(onClose);
  useFocusTrap(panelRef, exit.close, { initialFocusRef: closeRef });
  const keeper = useKeepTrip({ destinations, lang, keepWith });
  const delta = useTotalDelta(trip.total.perPerson);

  const name = tripName(trip, destinations, lang);
  const partial = totalLeavesOut(trip);
  const many = trip.party.head + (trip.party.babies || 0) > 1;
  const pct = trip.match?.pct;
  const bases = trip.places.length;
  const when = settings ? whenText(t, settings.when, months, bcp47) : null;
  const dates = settings?.when?.mode === 'exact' && when?.start ? (when.end ? t('tf.chip.dates', { start: when.start, end: when.end }) : when.start) : monthName(trip.month, lang);
  const placeIds = useMemo(() => trip.places.map((p) => p.id), [trip.places]);
  const pois = usePlacePois(placeIds);
  const photos = useMemo(() => {
    const out = tripPhotos(trip, destinations).map((p) => ({ ...p, caption: cityLabel(p.city) }));
    const seen = new Set(out.map((p) => p.url));
    for (const id of placeIds) {
      const d = destinations?.[id];
      for (const s of topSights(pois?.[id], 3)) {
        if (seen.has(s.img)) continue;
        seen.add(s.img);
        out.push({ url: s.img, city: s.name, iso2: d?.iso2 || null, caption: `${s.name}, ${cityLabel(d?.city || '')}` });
      }
    }
    return out.slice(0, 12);
  }, [trip, destinations, pois, placeIds]);

  // Raise or lower the phone sheet: the layout changes at once and the
  // panel slides from where it was (transform only, --dur-3).
  const setHeight = (next) => {
    if (next === full) return;
    before.current = panelRef.current?.getBoundingClientRect().top ?? null;
    setFull(next);
  };
  useLayoutEffect(() => {
    const was = before.current;
    before.current = null;
    const el = panelRef.current;
    if (was == null || !el?.animate || prefersReducedMotion()) return;
    const dy = was - el.getBoundingClientRect().top;
    if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: durationMs('--dur-3') || 0, easing: getComputedStyle(el).getPropertyValue('--ease-out').trim() || 'ease-out' });
  }, [full]);

  const onScroll = (e) => { if (!full && e.currentTarget.scrollTop > 8) setHeight(true); };
  const onGrabDown = (e) => {
    if (e.pointerType === 'mouse') return;
    drag.current = { id: e.pointerId, y0: e.clientY };
  };
  const onGrabUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y0;
    if (dy < -40) setHeight(true);
    else if (dy > 40) { if (full) setHeight(false); else exit.close(); }
  };
  const openLine = (id) => { setHeight(true); setLine(id); };
  const back = () => { rowFocus.current = line; setLine(null); };
  const openSlot = line ? trip.slots.find((s) => s.id === line) : null;

  return createPortal(
    <div
      className={`tff-pv-scrim${exit.leaving ? ' is-leaving' : ''}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) exit.close(); }}
    >
      <div
        className={`tff-pv${full ? ' is-full' : ' is-half'}${exit.leaving ? ' is-leaving' : ''}`}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="tff-pv-grab" onPointerDown={onGrabDown} onPointerUp={onGrabUp} onPointerCancel={() => { drag.current = null; }}>
          <Button variant="quiet" className="tff-pv-handle" aria-expanded={full} aria-label={t(full ? 'tf.pv.collapse' : 'tf.pv.expand')} onClick={() => setHeight(!full)}>
            <span className="tff-pv-bar" aria-hidden="true" />
          </Button>
        </div>
        <IconButton tone="photo" className="tff-pv-close" ref={closeRef} label={t('tf.pv.close')} onClick={exit.close}>
          <CloseIcon size={16} />
        </IconButton>

        <div className="tff-pv-scroll" ref={scrollRef} onScroll={onScroll}>
          {openSlot ? (
            <LinePicker
              trip={trip}
              slot={openSlot}
              ui={ui}
              onBack={back}
              onApply={(next) => { onEdit(withSlot(trip, next, slotTotals)); back(); }}
            />
          ) : (
            <>
              <Gallery photos={photos} name={name} t={t} />
              <div className="tff-pv-head">
                <div className="tff-pv-titles">
                  <h2 className="tff-pv-title" id={titleId}>{name}</h2>
                  {!full && (
                    <Button variant="quiet" size="sm" className="tff-pv-more" onClick={() => setHeight(true)}>{t('tf.pv.more')}</Button>
                  )}
                </div>
                <p className="tff-pv-meta">
                  <span className="tff-meta-item">{trip.iso2 && <CountryFlag country={trip.iso2} size={13} />}{trip.country}</span>
                  <span className="tff-meta-item"><CalendarIcon size={14} />{dates}</span>
                  <span className="tff-meta-item"><MoonIcon size={14} />{t('tf.keep.nights', { n: trip.nights })}</span>
                  <span className="tff-meta-item"><MapPinIcon size={14} />{t(bases === 1 ? 'tf.card.base1' : 'tf.card.bases', { n: bases })}</span>
                  {pct != null && <span className="tff-pv-match">{t('tf.card.match', { pct })}</span>}
                </p>
              </div>
              <Tabs
                label={t('tf.pv.tabs')}
                className="tff-pv-tabs"
                tabs={[{ id: 'overview', label: t('tf.pv.overview') }, { id: 'cost', label: t('tf.pv.cost') }]}
                value={tab}
                onChange={setTab}
                panelId={panelId}
              />
              <div className="tff-pv-panel" role="tabpanel" id={panelId} aria-label={t(tab === 'cost' ? 'tf.pv.cost' : 'tf.pv.overview')}>
                {tab === 'cost'
                  ? <Cost trip={trip} destinations={destinations} onEdit={onEdit} onLine={openLine} rowFocus={rowFocus} t={t} lang={lang} ui={ui} />
                  : <Overview trip={trip} destinations={destinations} pois={pois} t={t} lang={lang} ui={ui} />}
              </div>
            </>
          )}
        </div>

        {!openSlot && (
          <div className="tff-pv-foot">
            <p className="tff-pv-total">
              <span className="tff-pv-eur money">{formatMoney(trip.total.perPerson, { locale: lang })}</span>
              <span className="tff-pv-unit">{t(partial ? 'tf.card.unitPartial' : 'tf.card.unit')}</span>
              {delta != null && Math.abs(delta) >= 1 && <span className="tff-delta" role="status">{signedMoney(delta, { locale: lang })}</span>}
              {many && (
                <span className="tff-pv-group">
                  {t('tf.card.group', { n: trip.party.head + (trip.party.babies || 0) })} <span className="money">{formatMoney(trip.total.group, { locale: lang })}</span>
                </span>
              )}
            </p>
            <IconButton
              tone="surface"
              className={`tff-pv-heart${keeper.isKept(trip.id) ? ' is-kept' : ''}`}
              pressed={keeper.isKept(trip.id)}
              label={t('tf.keep.one', { name })}
              onClick={() => keeper.toggle(trip)}
            >
              <HeartIcon size={18} />
            </IconButton>
            <Button variant="primary" className="tff-pv-plan" onClick={() => onPlan(trip)}>{t('tf.rc.plan')}</Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
