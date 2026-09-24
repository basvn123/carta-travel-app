import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { E2E_SEAMS } from '../lib/e2eSeams.js';
import {
  SparkIcon, CastleIcon, MuseumIcon, TreeIcon, DiningIcon, CameraIcon,
  MapPinIcon, CheckIcon, BeachIcon, HomeIcon, TicketIcon,
  CoffeeIcon, StarIcon, PersonIcon, BallIcon, FriendsIcon, FamilyIcon,
  SunIcon, PartSunIcon, MoonIcon, ShoeIcon, ShoppingIcon, MusicIcon,
  BootIcon, ClockIcon,
} from '../components/Icons.jsx';
import { formatSteps, kmToSteps, stepsToKm } from '../lib/steps.js';
import { TownPickerStep } from './TownPickerStep.jsx';
import { RouteBuildingStage } from './RouteBuildingStage.jsx';
import { AiPlanRoute } from './AiPlanRoute.jsx';
import { stopPhaseLabels } from './daySchedule.js';

/**
 * CartaChatPlanner, the guided conversation that ends in a real day route.
 *
 * One question at a time with tappable answers (conversational UI research is
 * unanimous that a stepped flow with quick replies beats a blank prompt box:
 * the traveller is never asked to invent an answer, and every turn confirms
 * what was understood). The questions run hard constraints first (who is
 * coming, how much of the day, how much walking) and preferences after, and
 * the flow drops any question whose answer is already known.
 *
 * Nothing reaches the map until the traveller presses import. They can send
 * the proposal back with a change request as often as their daily AI budget
 * allows.
 *
 *   towns               [{ id, dest, km }] nearby towns to choose a focus from
 *   ideas               the step-3 must-includes, which pre-tick moods
 *   defaultTownId       where the day lands when nothing is said, gating the town question
 *   townCandidateCount  walkable places in that town, gating the town question
 *   townMustSeeCount    must-see places there, gating "been here before"
 *   weatherNote         a read forecast line, shown instead of asking about rain
 *   hasEvents           festivals match the date, so the events toggle defaults on
 *   onRun(a)            generate; resolves { ok, plan } | { ok:false, code }
 *   onImport(p)         accept the proposal (creates the plan and opens it)
 *   onBack()            leave the chat, back to the previous step
 */

/**
 * The question set, in the order a good human guide would ask it.
 *
 * Hard constraints come first: who is coming and how much day and energy
 * there is decide what the day can physically be. Preferences (mood, food)
 * only rank inside those limits, so asking them first would be asking the
 * traveller to choose between options that were never on the table.
 *
 * Nothing already known is asked again. The stay, the date and the ideas
 * from step 3 are answers the traveller has already given, so `skip` takes
 * the question out of the flow entirely rather than showing it pre-filled;
 * the profile still carries the value.
 *
 * Every question either offers a "no preference" answer or is skippable,
 * and the target is at most six taps to a plan.
 */

// The start of the day, as a clock and as minutes for buildDaySchedule.
const START_CHIPS = [
  { key: 'early', labelKey: 'chat.startEarly', min: 8 * 60 },
  { key: 'normal', labelKey: 'chat.startNormal', min: 9 * 60 + 30 },
  { key: 'late', labelKey: 'chat.startLate', min: 11 * 60 },
];

const START_MIN_BY_KEY = Object.fromEntries(START_CHIPS.map((c) => [c.key, c.min]));

// Step budgets, not kilometres. A phone-calibrated number the traveller
// already has a feel for; the payload converts back to km at the edge.
const STEP_OPTIONS = [
  { key: '5000', steps: 5000, labelKey: 'chat.stepsEasy', Icon: PersonIcon },
  { key: '10000', steps: 10000, labelKey: 'chat.stepsNormal', Icon: ShoeIcon },
  { key: '15000', steps: 15000, labelKey: 'chat.stepsActive', Icon: BootIcon },
  { key: '20000', steps: 20000, labelKey: 'chat.stepsBig', Icon: BallIcon },
];

const MAX_MOODS = 3;

// ?paymock stands in for an entitled, signed-in traveller on every client
// gate (see usePaywall); the bot's own sign-in gate honours it too, so the
// build-state harness can still drive a run without credentials. Compiled
// out of production builds with the rest of the seams.
const BOT_MOCK = E2E_SEAMS && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('paymock');

const MOOD_OPTIONS = [
  { key: 'sights', labelKey: 'chat.moodSights', Icon: CastleIcon },
  { key: 'museums', labelKey: 'chat.moodMuseums', Icon: MuseumIcon },
  { key: 'nature', labelKey: 'chat.moodNature', Icon: TreeIcon },
  { key: 'beach', labelKey: 'chat.moodBeach', Icon: BeachIcon },
  { key: 'active', labelKey: 'chat.moodActive', Icon: BallIcon },
  { key: 'food', labelKey: 'chat.moodFood', Icon: DiningIcon },
  { key: 'local', labelKey: 'chat.moodLocal', Icon: CoffeeIcon },
  { key: 'views', labelKey: 'chat.moodViews', Icon: CameraIcon },
  { key: 'shopping', labelKey: 'chat.moodShopping', Icon: ShoppingIcon },
  // Only offered when the day actually runs into the evening: a nightlife
  // stop in a day that ends at 18:00 is a promise the schedule cannot keep.
  { key: 'nightlife', labelKey: 'chat.moodNightlife', Icon: MusicIcon, eveningOnly: true },
];

const DIET_CHIPS = ['veg', 'vegan', 'gf', 'cheap', 'treat'];

const QUESTIONS = [
  {
    key: 'companions',
    qKey: 'chat.qCompanions',
    options: [
      { key: 'solo', labelKey: 'chat.compSolo', Icon: PersonIcon },
      { key: 'partner', labelKey: 'chat.compPartner', Icon: HomeIcon },
      { key: 'friends', labelKey: 'chat.compFriends', Icon: FriendsIcon },
      { key: 'family', labelKey: 'chat.compFamily', Icon: FamilyIcon },
      { key: 'group', labelKey: 'chat.compGroup', Icon: FriendsIcon },
    ],
  },
  {
    key: 'window',
    qKey: 'chat.qWindow',
    // The start chips ride along under the four window answers: both belong
    // to "how much of the day", and splitting them would cost a tap.
    withStart: true,
    options: [
      { key: 'morning', labelKey: 'chat.winMorning', Icon: SunIcon },
      { key: 'afternoon', labelKey: 'chat.winAfternoon', Icon: PartSunIcon },
      { key: 'full', labelKey: 'chat.winFull', Icon: ClockIcon },
      { key: 'evening', labelKey: 'chat.winEvening', Icon: MoonIcon },
    ],
  },
  {
    key: 'steps',
    qKey: 'chat.qSteps',
    stepBudget: true,
    options: STEP_OPTIONS,
  },
  {
    key: 'moods',
    qKey: 'chat.qMood',
    multi: true,
    max: MAX_MOODS,
    options: MOOD_OPTIONS,
  },
  {
    key: 'town',
    qKey: 'chat.qTown',
    dynamic: 'towns', // options are built from the nearby towns
  },
  {
    key: 'food',
    qKey: 'chat.qFood',
    dietChips: true,
    options: [
      { key: 'sit', labelKey: 'chat.foodSit', Icon: DiningIcon },
      { key: 'quick', labelKey: 'chat.foodQuick', Icon: CoffeeIcon },
      { key: 'picnic', labelKey: 'chat.foodPicnic', Icon: TreeIcon },
      { key: 'none', labelKey: 'chat.foodNone' },
    ],
  },
  {
    key: 'known',
    qKey: 'chat.qKnown',
    options: [
      { key: 'first', labelKey: 'chat.knownFirst', Icon: StarIcon },
      { key: 'again', labelKey: 'chat.knownAgain', Icon: MapPinIcon },
    ],
  },
  {
    key: 'extra',
    qKey: 'chat.qExtra',
    free: true,
  },
];

const NUDGES = ['chat.nudgeMore', 'chat.nudgeFewerSteps', 'chat.nudgeFood', 'chat.nudgeIndoor'];

// A town needs this many walkable candidates before "stay around here" is a
// day rather than a morning. Below it, the town question is worth the tap.
const ENOUGH_CANDIDATES = 12;

// Getting to another town is driving or a bus, not a walk. 55 km/h is the
// honest door-to-door figure for a regional hop on ordinary roads.
const TOWN_KMH = 55;

/** Roughly how long it takes to reach a nearby town, in whole minutes. */
function townMinutes(km) {
  return Math.max(5, Math.round((Number(km) / TOWN_KMH) * 60 / 5) * 5);
}

/**
 * Moods the ideas step already answered. An idea is a place with a kind, and
 * a beach idea is a "beach and water" answer whether or not the traveller
 * would have thought to tick it.
 */
function moodsFromIdeas(ideas) {
  const out = new Set();
  for (const i of ideas || []) {
    const k = String(i?.cat || i?.kind || '').toLowerCase();
    if (/beach|lake|swim|water/.test(k)) out.add('beach');
    else if (/trail|hike|cycl|mountain|peak|bike/.test(k)) out.add('active');
    else if (/museum|gallery|art/.test(k)) out.add('museums');
    else if (/park|nature|forest|garden/.test(k)) out.add('nature');
    else if (/food|restaurant|market|cafe/.test(k)) out.add('food');
    else if (/view|panorama|lookout/.test(k)) out.add('views');
  }
  return [...out].slice(0, MAX_MOODS);
}

// The last question is a blank box, which is the one moment the flow asks the
// traveller to invent an answer. These are the wishes people actually type,
// one tap instead of a sentence.
const EXTRA_PRESETS = [
  'chat.presetCoffee', 'chat.presetRain', 'chat.presetFamily', 'chat.presetEarly',
];

export function CartaChatPlanner({
  towns, dateISO, groupSize, signedIn, onRun, onImport, onBack, onManual,
  stayPoint, cityOptions, onSuggestCity, resolveNearest, onResearchCity,
  presetTownId = null, defaultTownId = null, ideas = [], townCandidateCount = null,
  townMustSeeCount = null, weatherNote = null, hasEvents = false,
  // What the trip wizard already knows about this traveller (party size,
  // travel style, pace), as answers the questions open on. Each question is
  // still asked; the likely option is simply already lit.
  initialAnswers = null,
  // A guest who reaches the last question is sent to sign in rather than to
  // a request that can only fail: the bot is account-gated.
  onSignIn = null,
}) {
  const { t, lang } = useI18n();
  const [step, setStep] = useState(0);
  // Moods the ideas step already implies: someone who named a beach has
  // answered "beach and water" without being asked, so the question opens
  // with it ticked rather than blank.
  const impliedMoods = useMemo(() => moodsFromIdeas(ideas), [ideas]);
  // A town already settled by the ideas step is an ANSWER, not an absence:
  // the question is skipped, but the profile still carries it so the run and
  // the transcript both know where the day is.
  const [answers, setAnswers] = useState(() => ({
    moods: impliedMoods,
    start: 'normal',
    diet: [],
    events: false,
    avoidCrowds: false,
    ...(initialAnswers || {}),
    // Moods named by the ideas AND by the wizard, both, within the cap.
    ...(initialAnswers?.moods
      ? { moods: [...new Set([...impliedMoods, ...initialAnswers.moods])].slice(0, MAX_MOODS) }
      : {}),
    ...(presetTownId ? { town: presetTownId } : {}),
  }));
  // Festivals that match the date default the toggle on: the traveller is
  // told what is happening rather than asked whether to look. The dossier is
  // read asynchronously, so this cannot live in the initial state, and it
  // stops applying once the traveller has touched the switch themselves.
  const eventsTouched = useRef(false);
  useEffect(() => {
    if (hasEvents && !eventsTouched.current) setAnswers((a) => ({ ...a, events: true }));
  }, [hasEvents]);
  const [freeText, setFreeText] = useState('');
  const [phase, setPhase] = useState('ask'); // ask | busy | result | fail
  const [result, setResult] = useState(null);
  const [rounds, setRounds] = useState(0);
  const [refineText, setRefineText] = useState('');
  const [failCode, setFailCode] = useState('');
  // Milestones the build reports as it runs, fed to the route animation so
  // the wait shows real work with real numbers instead of a typing bubble.
  const [stages, setStages] = useState([]);
  const endRef = useRef(null);

  // Macro blocks (Morning / Midday / ...) for the proposed route, announced
  // once per block, matching how the imported day reads on the timeline.
  const stopPhases = useMemo(() => stopPhaseLabels(result?.stops), [result]);

  // Whether the day runs past dinner decides whether nightlife is even on
  // offer, and it is answered two questions before the mood list is drawn.
  const intoEvening = answers.window === 'evening';

  /**
   * The flow, adapted to what is already known. A question is dropped when
   * its answer is inferable or its subject does not apply: the town when the
   * ideas already fixed it and the stay's own town can fill a day, the
   * "been here before" question in a town with too few headline sights for
   * the answer to change anything.
   */
  const questions = useMemo(() => QUESTIONS.map((q) => {
    if (q.key === 'moods') {
      return {
        ...q,
        options: q.options.filter((o) => !o.eveningOnly || intoEvening),
      };
    }
    if (q.key === 'known') {
      // With fewer than five must-see places, "first time or not" cannot
      // meaningfully change which stops make the cut: there is only one
      // shortlist either way. Unknown counts leave the question in.
      const enough = townMustSeeCount == null || townMustSeeCount >= 5;
      return { ...q, skip: !enough };
    }
    if (q.dynamic !== 'towns') return q;
    // Towns arrive as { id, dest, km }: the name lives on the destination
    // record, and anything without one cannot be offered as a choice.
    const opts = (towns || []).slice(0, 6)
      .filter((tn) => tn?.dest?.city)
      .map((tn) => ({
        key: tn.id,
        label: tn.dest.city,
        // Travel time, not raw distance: "22 min away" is a decision, "18 km
        // away" is an arithmetic problem the traveller has to solve first.
        sub: tn.km <= 1
          ? t('chat.rightHere')
          : t('chat.townMinAway', { min: townMinutes(tn.km) }),
        // The traveller rating rides along so the choice is a comparison,
        // not just a list of names and distances.
        rating: tn.dest.rating || null,
        Icon: HomeIcon,
      }));
    // The town question earns its tap in two cases, and is skipped in the
    // rest. It is worth asking when the town the day would land in is too
    // thin to fill a day, and when the traveller asked for something the
    // coast or the hills nearby do better than that town does. Otherwise the
    // stay (or the ideas) has already answered it, and asking would be
    // asking something the traveller has told us twice.
    const thin = townCandidateCount != null && townCandidateCount < ENOUGH_CANDIDATES;
    const wantsOutdoors = (answers.moods || []).some((m) => m === 'active' || m === 'beach');
    const worthAsking = thin || (wantsOutdoors && (towns || []).length > 1);
    // With no town to fall back on there is nothing to skip TO, so the
    // question always runs: search, map and the AI suggestion all work
    // without a nearby list.
    const haveDefault = Boolean(presetTownId || defaultTownId);
    return { ...q, options: opts.length ? opts : null, skip: haveDefault && !worthAsking };
  }), [towns, t, presetTownId, defaultTownId, townCandidateCount, townMustSeeCount, answers.moods, intoEvening]);

  const visible = questions.filter((q) => !q.skip);
  // Changing a past answer can remove a later question (dropping "beach"
  // takes the town question out again), which would leave `step` pointing
  // past the end and blank the screen. Clamping keeps the flow on its last
  // real question instead.
  const stepSafe = Math.min(step, Math.max(0, visible.length - 1));
  const current = visible[stepSafe] || null;

  // The build card grows a line at a time while it runs, so the transcript
  // follows it: without `stages` here the log walked off the bottom of the
  // scroller as soon as the third line arrived.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [stepSafe, phase, result, stages.length]);

  const answerLabel = (q, value) => {
    if (q.key === 'extra') {
      // The last screen is more than its text box now, so the transcript
      // line says what was actually turned on, not just what was typed.
      const bits = [];
      if (answers.events) bits.push(t('chat.eventsYes'));
      if (answers.avoidCrowds) bits.push(t('chat.avoidCrowds'));
      if (value) bits.push(value);
      return bits.length ? bits.join(', ') : t('chat.nothingSpecial');
    }
    if (q.free) return value || t('chat.nothingSpecial');
    if (q.multi) {
      const picked = (q.options || []).filter((o) => (value || []).includes(o.key));
      return picked.length ? picked.map((o) => t(o.labelKey)).join(', ') : t('chat.anything');
    }
    // The town may have been picked by search/map/AI, none of which are
    // among this question's "nearby" options, so its display name travels
    // alongside the answer itself rather than through the options lookup.
    if (q.key === 'town') return answers.townLabel || String(value ?? '');
    // The walk question answers with a step COUNT, not an option key, so it
    // is matched on the budget it carries. Without this the transcript read
    // back a bare "5000", which is the stored value, not an answer.
    const o = (q.options || []).find((x) => (
      q.stepBudget ? x.steps === value : x.key === value
    ));
    let base = o ? (o.label || t(o.labelKey)) : String(value ?? '');
    if (q.stepBudget && o) base = `${base}, ${t('chat.aboutSteps', { n: formatSteps(o.steps, lang) })}`;
    // Answers that carry a second choice on the same screen read as one
    // line in the transcript, the way the traveller experienced them.
    if (q.key === 'window' && answers.start) {
      const chip = START_CHIPS.find((c) => c.key === answers.start);
      return chip ? `${base}, ${t(chip.labelKey)}` : base;
    }
    if (q.key === 'steps') {
      const extras = [];
      if (answers.avoidHills) extras.push(t('chat.avoidHills'));
      if (answers.transitOk) extras.push(t('chat.transitOk'));
      return extras.length ? `${base}, ${extras.join(', ')}` : base;
    }
    if (q.key === 'food' && (answers.diet || []).length) {
      const names = answers.diet.map((d) => t(`chat.diet${d[0].toUpperCase()}${d.slice(1)}`));
      return `${base}, ${names.join(', ')}`;
    }
    return base;
  };

  /**
   * The town this day is in, by name, for the questions that ask about it.
   * It can come from the town question, from the ideas step's preset, or
   * from the nearest town to the stay when neither ran.
   */
  const townName = answers.townLabel
    || (towns || []).find((tn) => tn.id === (answers.town || presetTownId))?.dest?.city
    || (towns || [])[0]?.dest?.city
    || '';

  const questionVars = (q) => (q.key === 'known' || q.key === 'town' ? { town: townName } : undefined);

  const advance = (key, value, extra) => {
    const next = { ...answers, [key]: value, ...(extra || {}) };
    setAnswers(next);
    if (stepSafe + 1 >= visible.length) {
      // No request for a guest: plan-day answers 401 and the traveller had
      // just spent seven taps to be told so. The same bubble, with the door
      // that actually opens.
      if (!signedIn && onSignIn && !BOT_MOCK) { setFailCode('auth'); setPhase('fail'); return; }
      generate(next, '');
    } else setStep(stepSafe + 1);
  };

  /** Flip one toggle answer (avoid hills, transit, crowds, events). */
  const toggleFlag = (key) => {
    // Once the traveller has decided about events themselves, a dossier that
    // finishes loading afterwards must not overrule them.
    if (key === 'events') eventsTouched.current = true;
    setAnswers((a) => ({ ...a, [key]: !a[key] }));
  };

  const toggleMulti = (key, optKey, max = 0) => {
    const cur = answers[key] || [];
    const on = cur.includes(optKey);
    // A capped multi-select that silently ignores the fourth tap feels
    // broken. Dropping the oldest pick keeps the tap meaningful.
    const next = on
      ? cur.filter((k) => k !== optKey)
      : (max && cur.length >= max ? [...cur.slice(1), optKey] : [...cur, optKey]);
    setAnswers({ ...answers, [key]: next });
  };

  const generate = async (profile, refine) => {
    setStages([]);
    setPhase('busy');
    const res = await onRun({
      ...profile,
      // The walk answer is a step budget; the plan-day contract speaks
      // kilometres. Converting here keeps the conversion in one place and
      // the server contract unchanged.
      steps: Number(profile.steps) || null,
      maxWalkKm: profile.steps ? stepsToKm(Number(profile.steps)) : null,
      startMin: START_MIN_BY_KEY[profile.start] ?? START_MIN_BY_KEY.normal,
      freeText: (profile.extra || '').trim(),
      refine,
      prevStops: refine && result ? result.stops.map((s) => s.name) : [],
    }, (stage) => setStages((prev) => [...prev, stage]));
    if (res.ok) {
      setResult(res.plan);
      setRounds((n) => n + 1);
      setRefineText('');
      setPhase('result');
    } else {
      setFailCode(res.code || 'ai_error');
      setPhase('fail');
    }
  };

  const back = () => {
    if (phase === 'result' || phase === 'fail') { setPhase('ask'); return; }
    if (stepSafe === 0) { onBack(); return; }
    setStep(stepSafe - 1);
  };

  return (
    <div className="chat-flow">
      <div className="chat-head">
        <button className="chat-back" onClick={back} aria-label={t('chat.back')}>‹</button>
        <span className="chat-head-title"><SparkIcon size={14} /> {t('chat.title')}</span>
        {phase === 'ask' && current && (
          <span className="chat-progress">
            {t('chat.stepOf', { n: stepSafe + 1, total: visible.length })}
          </span>
        )}
      </div>

      <div className="chat-body">
        {/* Everything answered so far, as a short transcript. Each answer is
            a button back to its own question: changing your mind about who is
            coming should not mean starting the conversation again. */}
        {visible.slice(0, stepSafe).map((q, i) => (
          <div key={q.key} className="chat-turn">
            <div className="chat-bubble bot">{t(q.qKey, questionVars(q))}</div>
            <button
              type="button"
              className="chat-bubble me chat-bubble-edit"
              onClick={() => setStep(i)}
              title={t('chat.changeAnswer')}
            >
              <span className="chat-bubble-edit-text">{answerLabel(q, answers[q.key])}</span>
              <span className="chat-bubble-edit-hint">{t('chat.change')}</span>
            </button>
          </div>
        ))}

        {phase === 'ask' && current && (
          <div className="chat-turn">
            <div className="chat-bubble bot chat-bubble-live">{t(current.qKey, questionVars(current))}</div>
            {current.key === 'town' ? (
              <TownPickerStep
                towns={towns}
                nearbyOptions={current.options}
                stayPoint={stayPoint}
                cityOptions={cityOptions}
                resolveNearest={resolveNearest}
                onResearchCity={onResearchCity}
                onSuggestCity={(freeText) => onSuggestCity(freeText, answers)}
                onPick={(id, label) => advance('town', id, { townLabel: label })}
              />
            ) : current.free ? (
              <>
                {/* The forecast is something we can read, so it is reported,
                    not asked about: the indoor flag is already set by the
                    time this line appears. */}
                {weatherNote && (
                  <p className="chat-weather-note">{weatherNote}</p>
                )}
                <div className="chat-opts chat-opts-toggles">
                  <button
                    type="button"
                    className={`chat-toggle${answers.events ? ' on' : ''}`}
                    onClick={() => toggleFlag('events')}
                    aria-pressed={!!answers.events}
                  >
                    <TicketIcon size={15} />
                    <span className="chat-opt-text">
                      <b>{t('chat.eventsToggle')}</b>
                      {hasEvents && <small>{t('chat.eventsFound')}</small>}
                    </span>
                    {answers.events && <CheckIcon size={12} />}
                  </button>
                  <button
                    type="button"
                    className={`chat-toggle${answers.avoidCrowds ? ' on' : ''}`}
                    onClick={() => toggleFlag('avoidCrowds')}
                    aria-pressed={!!answers.avoidCrowds}
                  >
                    <FriendsIcon size={15} />
                    <span className="chat-opt-text"><b>{t('chat.avoidCrowds')}</b></span>
                    {answers.avoidCrowds && <CheckIcon size={12} />}
                  </button>
                </div>
                <div className="chat-opts chat-opts-nudge">
                  {EXTRA_PRESETS.map((k) => (
                    <button
                      key={k}
                      className={`carta-plan-chip${freeText === t(k) ? ' on' : ''}`}
                      onClick={() => setFreeText(freeText === t(k) ? '' : t(k))}
                      aria-pressed={freeText === t(k)}
                    >
                      {t(k)}
                    </button>
                  ))}
                </div>
                <div className="chat-free chat-free-final">
                  <input
                    className="chat-free-input"
                    type="text"
                    maxLength={280}
                    value={freeText}
                    placeholder={t('chat.extraPlaceholder')}
                    onChange={(e) => setFreeText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') advance('extra', freeText.trim()); }}
                    autoFocus
                  />
                  <button className="chat-send" onClick={() => advance('extra', freeText.trim())}>
                    <SparkIcon size={13} /> {t('chat.build')}
                  </button>
                  <button className="chat-skip" onClick={() => advance('extra', '')}>{t('chat.skip')}</button>
                </div>
              </>
            ) : current.multi ? (
              <>
                <div className="chat-opts chat-opts-multi">
                  {(current.options || []).map((o) => {
                    const on = (answers[current.key] || []).includes(o.key);
                    const Icon = o.Icon;
                    return (
                      <button
                        key={o.key}
                        className={`chat-opt ${on ? 'on' : ''}`}
                        onClick={() => toggleMulti(current.key, o.key, current.max)}
                        aria-pressed={on}
                      >
                        {Icon && <Icon size={16} />}
                        <span>{o.label || t(o.labelKey)}</span>
                        {on && <CheckIcon size={12} />}
                      </button>
                    );
                  })}
                </div>
                {current.max > 0 && (
                  <p className="chat-opts-hint">{t('chat.pickUpTo', { n: current.max })}</p>
                )}
                <button
                  className="chat-send chat-send-multi"
                  onClick={() => advance(current.key, answers[current.key] || [])}
                >
                  {(answers[current.key] || []).length
                    ? t('chat.next')
                    : t('chat.noPreference')}
                </button>
              </>
            ) : (
              <>
                <div className="chat-opts">
                  {(current.options || []).map((o) => {
                    const Icon = o.Icon;
                    // The walk answers are step budgets, and the step count is
                    // the headline: the label says how hard the day is, the
                    // sub-line says it in the number on their phone.
                    const sub = current.stepBudget
                      ? t('chat.aboutSteps', { n: formatSteps(o.steps, lang) })
                      : o.sub;
                    // A single-choice question can open with its likely
                    // answer lit (the wizard's presets, see initialAnswers);
                    // tapping any option, lit or not, is still the answer.
                    const on = current.stepBudget
                      ? answers[current.key] === o.steps
                      : answers[current.key] === o.key;
                    return (
                      <button
                        key={o.key}
                        className={`chat-opt ${on ? 'on' : ''}`}
                        aria-pressed={on}
                        onClick={() => advance(
                          current.key,
                          current.stepBudget ? o.steps : o.key,
                        )}
                      >
                        {Icon && <Icon size={16} />}
                        <span className="chat-opt-text">
                          <b>{o.label || t(o.labelKey)}</b>
                          {sub && <small>{sub}</small>}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Start time belongs to "how much of the day", so it sits on
                    the same screen rather than costing its own tap. */}
                {current.withStart && (
                  <div className="chat-opts chat-opts-nudge chat-opts-start">
                    <span className="chat-opts-label">{t('chat.startLabel')}</span>
                    {START_CHIPS.map((c) => (
                      <button
                        key={c.key}
                        className={`carta-plan-chip${answers.start === c.key ? ' on' : ''}`}
                        onClick={() => setAnswers({ ...answers, start: c.key })}
                        aria-pressed={answers.start === c.key}
                      >
                        {t(c.labelKey)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Two things that change which route is even possible, and
                    neither deserves a screen of its own. */}
                {current.stepBudget && (
                  <div className="chat-opts chat-opts-nudge">
                    <button
                      className={`carta-plan-chip${answers.avoidHills ? ' on' : ''}`}
                      onClick={() => toggleFlag('avoidHills')}
                      aria-pressed={!!answers.avoidHills}
                    >
                      {t('chat.avoidHills')}
                    </button>
                    <button
                      className={`carta-plan-chip${answers.transitOk ? ' on' : ''}`}
                      onClick={() => toggleFlag('transitOk')}
                      aria-pressed={!!answers.transitOk}
                    >
                      {t('chat.transitOk')}
                    </button>
                  </div>
                )}

                {current.dietChips && (
                  <div className="chat-opts chat-opts-nudge">
                    {DIET_CHIPS.map((d) => {
                      const on = (answers.diet || []).includes(d);
                      return (
                        <button
                          key={d}
                          className={`carta-plan-chip${on ? ' on' : ''}`}
                          onClick={() => toggleMulti('diet', d)}
                          aria-pressed={on}
                        >
                          {t(`chat.diet${d[0].toUpperCase()}${d.slice(1)}`)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {phase === 'busy' && (
          <div className="chat-turn">
            <RouteBuildingStage stages={stages} reworking={rounds > 0} />
          </div>
        )}

        {phase === 'result' && result && (
          <div className="chat-result">
            <div className="chat-bubble bot">{result.summary || t('chat.here')}</div>
            <div className="chat-route">
              <div className="chat-route-head">
                <span className="ai-plan-proposal-tag">{t('ai.proposalTag', { n: rounds })}</span>
                <span className="chat-route-stats">
                  {t('ai.totalsSteps', {
                    n: result.stops?.length ?? 0,
                    steps: formatSteps(kmToSteps(result.totals?.walkKm ?? 0), lang),
                    t: result.totals?.endTime ?? '',
                  })}
                </span>
              </div>
              {/* The route on a map, then the stops in the same macro blocks
                  the planned day reads in, not a per-stop clock. */}
              <AiPlanRoute stops={result.stops} phases={stopPhases} />
              {result.stops.some((s) => s.isEvent) && (
                <p className="ai-plan-note ai-plan-note-warn">{t('ai.eventCaveat')}</p>
              )}
            </div>

            <div className="chat-refine">
              <div className="chat-opts chat-opts-nudge">
                {NUDGES.map((k) => (
                  <button key={k} className="carta-plan-chip" onClick={() => generate(answers, t(k))}>
                    {t(k)}
                  </button>
                ))}
              </div>
              <div className="ai-refine-row">
                <input
                  className="ai-refine-input"
                  type="text"
                  maxLength={280}
                  value={refineText}
                  placeholder={t('chat.refinePlaceholder')}
                  onChange={(e) => setRefineText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && refineText.trim()) generate(answers, refineText.trim()); }}
                />
                <button className="trip-add-btn" disabled={!refineText.trim()} onClick={() => generate(answers, refineText.trim())}>
                  {t('ai.refineGo')}
                </button>
              </div>
            </div>
          </div>
        )}

        {phase === 'fail' && (
          <div className="chat-turn">
            <div className="chat-bubble bot chat-bubble-warn">{t(`ai.${failCode === 'user_cap' ? 'quotaUser' : failCode === 'global_cap' ? 'quotaGlobal' : failCode === 'auth' ? 'signIn' : 'error'}`)}</div>
            <div className="chat-opts">
              {failCode === 'auth' && onSignIn
                ? <button className="chat-opt" onClick={onSignIn}>{t('auth.signIn')}</button>
                : <button className="chat-opt" onClick={() => generate(answers, '')}>{t('ai.retry')}</button>}
              <button className="chat-opt" onClick={onManual}>{t('chat.planManually')}</button>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {phase === 'result' && result && (
        <div className="chat-foot">
          <button className="chat-import" onClick={() => onImport(result, answers)}>
            <CheckIcon size={14} /> {t('chat.import')}
          </button>
        </div>
      )}
      {phase === 'ask' && !signedIn && (
        <div className="chat-foot chat-foot-warn">{t('ai.signIn')}</div>
      )}
    </div>
  );
}
