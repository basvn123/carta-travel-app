import React, { useEffect, useMemo, useRef } from 'react';
import {
  TRIP_TYPES, TRIP_GROUPS, MAX_TRIP_TYPES, SPEND_CHOICES,
} from '../lib/countryMatch.js';
import { PlannerSection } from './PlannerSection.jsx';
import {
  BeachIcon, LotusIcon, LakeIcon, CityIcon, CastleIcon, DiningIcon, MoonIcon,
  HeartIcon, CameraIcon, BootIcon, ShoeIcon, BikeIcon, SwimIcon, SnowIcon,
  RoadIcon, BackpackIcon, FriendsIcon, PalmIcon, MusicIcon,
  PiggyIcon, BedIcon, HotelIcon, TrainIcon, CarIcon,
  CompassIcon, MapPinIcon, GlobeIcon, RouteIcon, BoltIcon,
  SunIcon, BanIcon, ClockIcon, CheckIcon, PencilIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { useI18n } from '../i18n/index.jsx';

/** One icon per trip type, so a chip is recognisable before it is read. */
const TYPE_ICON = {
  beach: BeachIcon, wellness: LotusIcon, lakes: LakeIcon,
  city: CityIcon, culture: CastleIcon, food: DiningIcon, nightlife: MoonIcon,
  romantic: HeartIcon, hidden: CameraIcon,
  hiking: BootIcon, trailrun: ShoeIcon, cycling: BikeIcon, water: SwimIcon,
  ski: SnowIcon, roadtrip: RoadIcon,
  backpack: BackpackIcon, family: FriendsIcon, islands: PalmIcon, festivals: MusicIcon,
};

const SPEND_ICON = { budget: PiggyIcon, standard: BedIcon, luxury: HotelIcon };
const AROUND_ICON = { flytrain: PlaneIcon, car: CarIcon, trainonly: TrainIcon, any: CompassIcon };
const DISTANCE_ICON = { short: MapPinIcon, anywhere: GlobeIcon };
const PACE_ICON = { base: BedIcon, fewstops: RouteIcon, moving: BoltIcon };
const AVOID_ICON = { crowds: FriendsIcon, heat: SunIcon, car: BanIcon, longdays: ClockIcon };

/**
 * One question of the Where quiz.
 *
 * Answered questions collapse to their answer, which is the only way a quiz of
 * six questions fits on a phone without becoming a wizard inside a wizard. The
 * summary is a button: editing an answer is one tap, not a walk back.
 */
function Question({
  id, title, sub, answered, summary, onEdit, children, openRef,
}) {
  const ref = useRef(null);
  useEffect(() => { if (openRef) openRef.current = ref.current; }, [openRef]);
  if (answered) {
    return (
      <button
        type="button"
        className="wq-done"
        onClick={onEdit}
        aria-label={`${title}: ${summary}`}
      >
        <span className="wq-done-check" aria-hidden="true"><CheckIcon size={12} /></span>
        <span className="wq-done-text">
          <small>{title}</small>
          <b>{summary}</b>
        </span>
        <span className="wq-done-edit" aria-hidden="true"><PencilIcon size={13} /></span>
      </button>
    );
  }
  return (
    <PlannerSection title={title} sub={sub} className="wq-q" id={id}>
      <div ref={ref} />
      {children}
    </PlannerSection>
  );
}

/** A row of large tappable chips. Multi-select shows a tick, single-select
 *  reads as a radio group, and both keep the 44px target on a phone. */
function ChipRow({ options, value, onPick, multi = false, cols = 2 }) {
  const on = (key) => (multi ? value.has(key) : value === key);
  return (
    <div className={`wq-chips wq-cols-${cols}`} role={multi ? 'group' : 'radiogroup'}>
      {options.map((o) => {
        const Icon = o.Icon;
        const picked = on(o.key);
        return (
          <button
            key={o.key}
            type="button"
            className={`wq-chip ${picked ? 'on' : ''} ${o.disabled ? 'off' : ''}`}
            onClick={() => onPick(o.key)}
            disabled={o.disabled}
            role={multi ? undefined : 'radio'}
            aria-checked={multi ? undefined : picked}
            aria-pressed={multi ? picked : undefined}
          >
            {Icon && <span className="wq-chip-icon"><Icon size={17} /></span>}
            <span className="wq-chip-text">
              <b>{o.label}</b>
              {o.sub && <small>{o.sub}</small>}
            </span>
            {picked && <span className="wq-chip-check" aria-hidden="true"><CheckIcon size={12} /></span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "Help me choose": six questions that turn into a ranked list of countries.
 *
 * The answers live in the wizard (and so in the planner draft), not here, so
 * that leaving the step and coming back does not re-ask anything. This
 * component only renders them and reports changes.
 *
 * @param answers  { types: string[], spend, around, distance, pace, avoid: [] }
 * @param onAnswer patch -> void
 * @param month    the month from the When step, already known and never asked
 */
export function WhereQuiz({ answers, onAnswer, monthLabel }) {
  const { t } = useI18n();
  const types = useMemo(() => new Set(answers.types || []), [answers.types]);
  const avoid = useMemo(() => new Set(answers.avoid || []), [answers.avoid]);

  // Which question is open. A question is answered once it holds a value; the
  // traveller can re-open any of them, and `editing` overrides the walk.
  const editing = answers.editing || '';
  const setEditing = (q) => onAnswer({ editing: q });

  const toggleType = (key) => {
    const next = new Set(types);
    if (next.has(key)) next.delete(key);
    else if (next.size < MAX_TRIP_TYPES) next.add(key);
    onAnswer({ types: [...next] });
  };
  const toggleAvoid = (key) => {
    const next = new Set(avoid);
    next.has(key) ? next.delete(key) : next.add(key);
    onAnswer({ avoid: [...next] });
  };

  const typeLabel = (k) => t(`quiz.type.${k}`);
  const typeOptions = (group) => TRIP_TYPES
    .filter((x) => x.group === group)
    .map((x) => ({
      key: x.key,
      label: typeLabel(x.key),
      Icon: TYPE_ICON[x.key],
      // At the cap the unpicked chips go quiet rather than vanishing, so the
      // limit is visible instead of being discovered by a tap that does nothing.
      disabled: types.size >= MAX_TRIP_TYPES && !types.has(x.key),
    }));

  // A question counts as answered when it has a value AND is not being edited.
  const done = (q, has) => has && editing !== q;

  // Q1 is the one multi-select question, so it cannot collapse the moment a
  // chip is tapped: that would make "pick up to three" a promise the screen
  // breaks on the first tap. It stays open until the traveller says Done, and
  // `typesDone` is what remembers that they did.
  const typesDone = Boolean(answers.typesDone) && editing !== 'types';

  return (
    <div className="wq">
      <Question
        id="wq-types"
        title={t('quiz.q1')}
        sub={t('quiz.q1Sub', { n: MAX_TRIP_TYPES })}
        answered={typesDone && types.size > 0}
        summary={[...types].map(typeLabel).join(', ')}
        onEdit={() => onAnswer({ editing: 'types' })}
      >
        {TRIP_GROUPS.map((g) => (
          <div className="wq-group" key={g}>
            <span className="wq-group-label">{t(`quiz.group.${g}`)}</span>
            <ChipRow options={typeOptions(g)} value={types} onPick={toggleType} multi />
          </div>
        ))}
        {types.size > 0 && (
          <button
            type="button"
            className="wq-next"
            onClick={() => onAnswer({ typesDone: true, editing: '' })}
          >
            {t('quiz.done')}
          </button>
        )}
      </Question>

      {typesDone && types.size > 0 && (
        <Question
          title={t('quiz.q2')}
          answered={done('spend', Boolean(answers.spend))}
          summary={answers.spend ? t(`quiz.spend.${answers.spend}`) : ''}
          onEdit={() => setEditing('spend')}
        >
          <ChipRow
            cols={1}
            options={SPEND_CHOICES.map((s) => ({
              key: s.key,
              label: t(`quiz.spend.${s.key}`),
              sub: t(`quiz.spend.${s.key}Sub`),
              Icon: SPEND_ICON[s.key],
            }))}
            value={answers.spend || ''}
            onPick={(k) => onAnswer({ spend: k, editing: '' })}
          />
        </Question>
      )}

      {answers.spend && (
        <Question
          title={t('quiz.q3')}
          answered={done('around', Boolean(answers.around))}
          summary={answers.around ? t(`quiz.around.${answers.around}`) : ''}
          onEdit={() => setEditing('around')}
        >
          <ChipRow
            options={['flytrain', 'car', 'trainonly', 'any'].map((k) => ({
              key: k, label: t(`quiz.around.${k}`), Icon: AROUND_ICON[k],
            }))}
            value={answers.around || ''}
            onPick={(k) => onAnswer({ around: k, editing: '' })}
          />
        </Question>
      )}

      {answers.around && (
        <Question
          title={t('quiz.q4')}
          answered={done('distance', Boolean(answers.distance))}
          summary={answers.distance ? t(`quiz.distance.${answers.distance}`) : ''}
          onEdit={() => setEditing('distance')}
        >
          <ChipRow
            options={['short', 'anywhere'].map((k) => ({
              key: k, label: t(`quiz.distance.${k}`), Icon: DISTANCE_ICON[k],
            }))}
            value={answers.distance || ''}
            onPick={(k) => onAnswer({ distance: k, editing: '' })}
          />
        </Question>
      )}

      {answers.distance && (
        <Question
          title={t('quiz.q5')}
          answered={done('pace', Boolean(answers.pace))}
          summary={answers.pace ? t(`quiz.pace.${answers.pace}`) : ''}
          onEdit={() => setEditing('pace')}
        >
          <ChipRow
            options={['base', 'fewstops', 'moving'].map((k) => ({
              key: k, label: t(`quiz.pace.${k}`), Icon: PACE_ICON[k],
            }))}
            value={answers.pace || ''}
            onPick={(k) => onAnswer({ pace: k, editing: '' })}
          />
        </Question>
      )}

      {answers.pace && (
        <PlannerSection title={t('quiz.q6')} sub={t('quiz.q6Sub')} className="wq-q">
          <ChipRow
            options={['crowds', 'heat', 'car', 'longdays'].map((k) => ({
              key: k, label: t(`quiz.avoid.${k}`), Icon: AVOID_ICON[k],
            }))}
            value={avoid}
            onPick={toggleAvoid}
            multi
          />
        </PlannerSection>
      )}

      {/* The month is not a question. It was answered on the When step and is
          shown here so the recommendations below are visibly seasonal. */}
      {monthLabel && types.size > 0 && (
        <p className="wq-month">{t('quiz.usingMonth', { month: monthLabel })}</p>
      )}
    </div>
  );
}
