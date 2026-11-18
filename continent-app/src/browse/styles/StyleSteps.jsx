import React from 'react';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Segmented } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import {
  AreaIcon, BeachIcon, BoltIcon, CityIcon, CoffeeIcon, CompassIcon, DiningIcon, InfoIcon, LeafIcon, LotusIcon,
  MuseumIcon, MusicIcon, PalmIcon, RoadIcon, ScaleIcon, ShoeIcon, SkylineIcon, SnowIcon, TownIcon, VillageIcon,
  PiggyIcon,
} from '../../components/Icons.jsx';
import { PartyEditor } from '../../planner/PartyEditor.jsx';
import { radioGroupKeyDown, useRovingRadios } from '../../components/ui/radioGroup.js';
import {
  AROUND, AVOID, LIKES, MORNINGS, PACE, PRIORITIES, QUIET, SHAPES, SIZES, TRADEOFF_DEFAULTS, WHO_KINDS,
} from '../../lib/travelStyles.js';
import { TRAVEL_MODES } from '../../lib/travelWay.js';
import { WHO_ICONS, optLabel } from './styleBits.jsx';
import { Tile } from './StaySpendFields.jsx';
import { HOSTEL_TIERS, togglePick, toggleWay } from './studioSteps.js';

/*
 * The wizard's screens (Style Studio, G12, decision.md "Steps"). Each takes
 * the draft and a `set(step, nextDraft)` that also marks the step as
 * answered, so a template picked later in step 1 never overwrites it.
 */

const WAY_ICONS = { plane: HouseIcon.flight, train: HouseIcon.train, bus: HouseIcon.bus, car: HouseIcon.car };
/** The kinds of company that count heads beyond a fixed one or two. */
const COUNTED = ['friends', 'family', 'group'];

/** A heading that takes focus when its step arrives, so a screen reader
 *  hears the new question and Tab starts from it. */
export function StepTitle({ children, focus }) {
  const ref = React.useRef(null);
  // A frame later, so the sheet's focus trap (which focuses its first
  // control on open) has run first and the question wins.
  React.useEffect(() => {
    if (!focus) return undefined;
    const id = requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(id);
  }, [focus]);
  return <h2 ref={ref} className="sst-q" id="sst-title" tabIndex={-1}>{children}</h2>;
}

/** Step 1: the name at the top, then who's coming as five rows. */
export function StepName({ draft, set, onWho, focusTitle, autoName }) {
  const { t } = useI18n();
  const nameRef = React.useRef(null);
  const rowsRef = React.useRef(null);
  useRovingRadios(rowsRef);
  // The name takes focus on a desktop only: on a phone the keyboard would
  // cover the five answers under it.
  React.useEffect(() => {
    if (autoName && window.matchMedia?.('(min-width: 769px) and (pointer: fine)').matches) nameRef.current?.focus();
  }, [autoName]);
  const kind = draft.who.kind;
  return (
    <>
      <label className="sst-name-label" htmlFor="sst-name">{t('studio.nameLabel')}</label>
      <input
        ref={nameRef}
        id="sst-name"
        className="sst-name"
        value={draft.name || ''}
        placeholder={t(`styles.t.${kind}`)}
        maxLength={40}
        autoComplete="off"
        onChange={(e) => set('name', { ...draft, name: e.target.value })}
      />
      <StepTitle focus={focusTitle}>{t('studio.q.who')}</StepTitle>
      <div ref={rowsRef} className="sst-rows" role="radiogroup" aria-labelledby="sst-title" onKeyDown={radioGroupKeyDown}>
        {WHO_KINDS.map((k) => {
          const Ico = WHO_ICONS[k];
          const on = k === kind;
          return (
            <Pressable key={k} type="button" role="radio" aria-checked={on} className={`sst-row${on ? ' is-on' : ''}`}
              onClick={() => { if (!on) onWho(k); }}>
              <span className="sst-row-ic" aria-hidden="true"><Ico size={20} /></span>
              <span className="sst-row-label">{t(`pf.who.${k}`)}</span>
              <span className="sst-tile-tick" aria-hidden="true"><HouseIcon.check size={12} /></span>
            </Pressable>
          );
        })}
      </div>
      {COUNTED.includes(kind) && (
        <div className="sst-party">
          <PartyEditor
            compact
            value={{ adults: draft.who.adults, children: draft.who.kids, babies: draft.who.babies }}
            onChange={(v) => set('name', { ...draft, who: { ...draft.who, adults: v.adults, kids: v.children, babies: v.babies } })}
          />
        </div>
      )}
    </>
  );
}

/** Step 3: every way there the traveller would take; the first picked is
 *  the one Explore prices with, marked on its tile. */
export function StepWay({ draft, set, focusTitle }) {
  const { t } = useI18n();
  const ways = draft.ways || [];
  const modes = TRAVEL_MODES.filter((m) => m !== 'any');
  return (
    <>
      <StepTitle focus={focusTitle}>{t('studio.q.way')}</StepTitle>
      <p className="sst-label" id="sst-way-pick">{t('studio.wayPick')}</p>
      <div className="sst-tiles sst-tiles-2" role="group" aria-labelledby="sst-way-pick">
        {modes.map((m) => (
          <Tile key={m} on={ways.includes(m)} Icon={WAY_ICONS[m]} label={t(`way.${m}`)}
            tag={draft.way === m && ways.includes(m) ? t('studio.onExplore') : null}
            onClick={() => set('way', toggleWay(draft, m))} />
        ))}
      </div>
      {ways.length === 0 && <p className="sst-line">{t('studio.wayNone')}</p>}
      {/* One control, only when there is a choice to make: which of the
          ways picked Explore prices with. */}
      {ways.length > 1 && (
        <div className="sst-group">
          <p className="sst-label" id="sst-way-shown" aria-hidden="true">{t('studio.wayShown')}</p>
          <Segmented
            label={t('studio.wayShown')}
            block
            className="sst-way-main"
            value={draft.way}
            onChange={(m) => set('way', { ...draft, way: m })}
            options={ways.map((m) => ({ value: m, label: t(`way.${m}`), icon: React.createElement(WAY_ICONS[m], { size: 16 }) }))}
          />
        </div>
      )}
    </>
  );
}

// Three outline glyphs alike (the filled diamond stood out of the set).
const PRIORITY_ICONS = { price: PiggyIcon, balance: ScaleIcon, comfort: HouseIcon.star };

/** Step 4: what matters most, then the three trade-offs it sets, each one
 *  flippable. Picking a card puts the three back to that card's answers. */
export function StepPriority({ draft, set, focusTitle }) {
  const { t } = useI18n();
  const cardsRef = React.useRef(null);
  useRovingRadios(cardsRef);
  const trade = draft.tradeoffs || TRADEOFF_DEFAULTS[draft.priority] || TRADEOFF_DEFAULTS.balance;
  const rows = ['early', 'stops', ...(HOSTEL_TIERS.includes(draft.stay) ? [] : ['hostel'])];
  return (
    <>
      <StepTitle focus={focusTitle}>{t('studio.q.priority')}</StepTitle>
      <div ref={cardsRef} className="sst-rows" role="radiogroup" aria-labelledby="sst-title" onKeyDown={radioGroupKeyDown}>
        {PRIORITIES.map((p) => {
          const on = draft.priority === p;
          const Ico = PRIORITY_ICONS[p];
          return (
            <Pressable key={p} type="button" role="radio" aria-checked={on} className={`sst-row is-tall${on ? ' is-on' : ''}`}
              onClick={() => { if (!on) set('priority', { ...draft, priority: p, tradeoffs: { ...TRADEOFF_DEFAULTS[p] } }); }}>
              <span className="sst-row-ic" aria-hidden="true"><Ico size={20} /></span>
              <span className="sst-row-text">
                <span className="sst-row-label">{optLabel(t, 'priority', p)}</span>
                <span className="sst-row-sub">{t(`pf.o.${p}Sub`)}</span>
              </span>
              <span className="sst-tile-tick" aria-hidden="true"><HouseIcon.check size={12} /></span>
            </Pressable>
          );
        })}
      </div>
      <h3 className="sst-label sst-label-gap">{t('studio.saveAsk')}</h3>
      <div className="sst-trades">
        {rows.map((k) => (
          <div key={k} className="sst-trade">
            <span className="sst-trade-label" id={`sst-trade-${k}`}>{t(`studio.trade.${k}`)}</span>
            <Segmented
              label={t(`studio.trade.${k}`)}
              size="sm"
              className="sst-yn"
              value={trade[k] ? 'yes' : 'no'}
              onChange={(v) => set('priority', { ...draft, tradeoffs: { ...trade, [k]: v === 'yes' } })}
              options={[{ value: 'yes', label: t('studio.yes') }, { value: 'no', label: t('studio.no') }]}
            />
          </div>
        ))}
      </div>
    </>
  );
}

// ---- How you explore: one question a screen, as icon tiles ----

const ICONS = {
  shapes: { one: HouseIcon.pin, towns: HouseIcon.route, road: RoadIcon, countries: HouseIcon.borders },
  likes: {
    beach: BeachIcon, hiking: HouseIcon.trails, lakes: HouseIcon.lakes, culture: MuseumIcon, city: SkylineIcon,
    food: DiningIcon, nightlife: MusicIcon, hidden: CompassIcon, cycling: HouseIcon.cycling, ski: SnowIcon,
    wellness: LotusIcon, islands: PalmIcon,
  },
  avoid: { crowds: HouseIcon.people, transfers: HouseIcon.clock, heat: HouseIcon.sun },
  size: { city: CityIcon, town: TownIcon, village: VillageIcon, mix: AreaIcon },
  quiet: { quiet: LeafIcon, lively: MusicIcon },
  around: { public: HouseIcon.bus, taxi: HouseIcon.car, car: RoadIcon, mix: HouseIcon.route },
  mornings: { early: HouseIcon.sun, onthego: ShoeIcon, slow: CoffeeIcon },
  pace: { slow: LeafIcon, balanced: ScaleIcon, packed: BoltIcon },
};

/** One group of tiles: several (toggles, with an optional cap) or one
 *  (a radiogroup with arrow keys). */
function Choices({ id, label, values, picked, onPick, labelOf, icons, multi = false, max = Infinity, cols = 3 }) {
  const ref = React.useRef(null);
  useRovingRadios(ref);
  const set = new Set(multi ? picked : picked ? [picked] : []);
  const full = multi && set.size >= max;
  return (
    <div
      ref={ref}
      className={`sst-tiles sst-tiles-${cols}`}
      role={multi ? 'group' : 'radiogroup'}
      aria-labelledby={id}
      aria-label={id ? undefined : label}
      onKeyDown={multi ? undefined : radioGroupKeyDown}
    >
      {values.map((v) => (
        <Tile key={v} radio={!multi} on={set.has(v)} Icon={icons[v]} label={labelOf(v)} disabled={full && !set.has(v)}
          onClick={() => onPick(multi ? togglePick(picked, v, max) : v)} />
      ))}
    </div>
  );
}

/** The six explore steps, by step id. */
export function ExploreStep({ step, draft, set, focusTitle, showSkip, onSkip }) {
  const { t } = useI18n();
  const [why, setWhy] = React.useState(false);
  const ex = draft.explore;
  const setEx = (patch) => set(step, { ...draft, explore: { ...ex, ...patch } });
  const setDays = (patch) => set(step, { ...draft, days: { ...draft.days, ...patch } });
  const whyId = `sst-why-${step}`;
  let body = null;
  if (step === 'shapes') {
    body = <Choices id="sst-title" multi cols={2} values={SHAPES} picked={ex.shapes} icons={ICONS.shapes}
      labelOf={(v) => optLabel(t, 'g:shape', v)} onPick={(v) => setEx({ shapes: v })} />;
  } else if (step === 'likes') {
    body = (
      <>
        <p className="sst-count-line" aria-live="polite">{t('studio.picked', { n: ex.likes.length, max: 3 })}</p>
        <Choices id="sst-title" multi max={3} values={LIKES} picked={ex.likes} icons={ICONS.likes}
          labelOf={(v) => t(`pf.like.${v}`)} onPick={(v) => setEx({ likes: v })} />
      </>
    );
  } else if (step === 'avoid') {
    body = <Choices id="sst-title" multi values={AVOID} picked={ex.avoid} icons={ICONS.avoid}
      labelOf={(v) => optLabel(t, 'g:avoid', v)} onPick={(v) => setEx({ avoid: v })} />;
  } else if (step === 'place') {
    body = (
      <>
        <h3 className="sst-label" id="sst-size">{t('studio.placeSize')}</h3>
        <Choices id="sst-size" cols={2} values={SIZES} picked={ex.size} icons={ICONS.size}
          labelOf={(v) => t(`taste.opt.${v}`)} onPick={(v) => setEx({ size: v })} />
        <h3 className="sst-label sst-label-gap" id="sst-feel">{t('studio.placeFeel')}</h3>
        <Choices id="sst-feel" cols={2} values={QUIET} picked={ex.quiet} icons={ICONS.quiet}
          labelOf={(v) => t(`taste.opt.${v}`)} onPick={(v) => setEx({ quiet: v })} />
      </>
    );
  } else if (step === 'around') {
    body = <Choices id="sst-title" cols={2} values={AROUND} picked={ex.around} icons={ICONS.around}
      labelOf={(v) => optLabel(t, 'g:around', v)} onPick={(v) => setEx({ around: v })} />;
  } else if (step === 'days') {
    body = (
      <>
        <h3 className="sst-label" id="sst-mornings">{t('studio.mornings')}</h3>
        <Choices id="sst-mornings" values={MORNINGS} picked={draft.days.mornings} icons={ICONS.mornings}
          labelOf={(v) => optLabel(t, 'r:mornings', v)} onPick={(v) => setDays({ mornings: v })} />
        <h3 className="sst-label sst-label-gap" id="sst-pace">{t('studio.pace')}</h3>
        <Choices id="sst-pace" values={PACE} picked={draft.days.pace} icons={ICONS.pace}
          labelOf={(v) => optLabel(t, 'r:pace', v)} onPick={(v) => setDays({ pace: v })} />
      </>
    );
  }
  return (
    <>
      <StepTitle focus={focusTitle}>{t(`studio.q.${step}`)}</StepTitle>
      <div className="sst-ask-row">
        <Pressable className="sst-whybtn" aria-expanded={why} aria-controls={whyId} onClick={() => setWhy(!why)}>
          <InfoIcon size={16} />
          {t('studio.whyAsk')}
        </Pressable>
        {showSkip && <Button variant="quiet" size="sm" className="sst-skip" onClick={onSkip}>{t('studio.skip')}</Button>}
      </div>
      {why && <p className="sst-whyline" id={whyId}>{t(`studio.why.${step}`)}</p>}
      {body}
    </>
  );
}
