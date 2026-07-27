import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import {
  SparkIcon, CastleIcon, MuseumIcon, TreeIcon, DiningIcon, CameraIcon,
  MapPinIcon, CheckIcon, MountainIcon, BeachIcon, HomeIcon, TicketIcon,
  CoffeeIcon, StarIcon, PersonIcon, BallIcon,
} from '../components/Icons.jsx';
import { TownPickerStep } from './TownPickerStep.jsx';
import { stopPhaseLabels } from './daySchedule.js';

/**
 * CartaChatPlanner, the guided conversation that ends in a real day route.
 *
 * One question at a time with tappable answers (conversational UI research is
 * unanimous that a stepped flow with quick replies beats a blank prompt box:
 * the traveller is never asked to invent an answer, and every turn confirms
 * what was understood). The question set is the one that actually changes a
 * walking day: where, how far, how hard, how long, what they care about,
 * whether they have been here before, and what they want to eat.
 *
 * Nothing reaches the map until the traveller presses import. They can send
 * the proposal back with a change request as often as their daily AI budget
 * allows.
 *
 *   towns       [{ id, city, km }] nearby towns to choose a focus from
 *   onRun(a)    generate; resolves { ok, plan } | { ok:false, code }
 *   onImport(p) accept the proposal (creates the plan and opens it)
 *   onBack()    leave the chat, back to the previous step
 */

// Multi-select answers show a "done" affordance; single-select advances on tap.
// Mood/interest questions come first so both the nearby-town ranking and the
// AI city-suggestion step (inside the town question) can use them; `known`
// stays right after `town` since it refers to the place just chosen.
const QUESTIONS = [
  {
    key: 'focus',
    qKey: 'chat.qFocus',
    options: [
      { key: 'city', labelKey: 'chat.focusCity', Icon: CastleIcon },
      { key: 'nature', labelKey: 'chat.focusNature', Icon: TreeIcon },
      { key: 'mix', labelKey: 'chat.focusMix', Icon: SparkIcon },
    ],
  },
  {
    key: 'interests',
    qKey: 'chat.qInterests',
    multi: true,
    options: [
      { key: 'landmarks', labelKey: 'chat.intLandmarks', Icon: CastleIcon },
      { key: 'museums', labelKey: 'chat.intMuseums', Icon: MuseumIcon },
      { key: 'food', labelKey: 'chat.intFood', Icon: DiningIcon },
      { key: 'nature', labelKey: 'chat.intNature', Icon: TreeIcon },
      { key: 'beach', labelKey: 'chat.intBeach', Icon: BeachIcon },
      { key: 'active', labelKey: 'chat.intActive', Icon: BallIcon },
      { key: 'photo', labelKey: 'chat.intPhoto', Icon: CameraIcon },
      { key: 'local', labelKey: 'chat.intLocal', Icon: CoffeeIcon },
    ],
  },
  {
    key: 'town',
    qKey: 'chat.qTown',
    dynamic: 'towns', // options are built from the nearby towns
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
    key: 'distance',
    qKey: 'chat.qDistance',
    options: [
      { key: '2', labelKey: 'chat.dist2' },
      { key: '5', labelKey: 'chat.dist5' },
      { key: '9', labelKey: 'chat.dist9' },
      { key: '15', labelKey: 'chat.dist15' },
    ],
  },
  {
    key: 'terrain',
    qKey: 'chat.qTerrain',
    options: [
      { key: 'flat', labelKey: 'chat.terrainFlat', Icon: PersonIcon },
      { key: 'some', labelKey: 'chat.terrainSome', Icon: HomeIcon },
      { key: 'hike', labelKey: 'chat.terrainHike', Icon: MountainIcon },
    ],
  },
  {
    key: 'dayLength',
    qKey: 'chat.qDayLength',
    options: [
      { key: 'half', labelKey: 'chat.lenHalf' },
      { key: 'full', labelKey: 'chat.lenFull' },
      { key: 'evening', labelKey: 'chat.lenEvening' },
    ],
  },
  {
    key: 'food',
    qKey: 'chat.qFood',
    options: [
      { key: 'sit', labelKey: 'chat.foodSit', Icon: DiningIcon },
      { key: 'quick', labelKey: 'chat.foodQuick', Icon: CoffeeIcon },
      { key: 'none', labelKey: 'chat.foodNone' },
    ],
  },
  {
    key: 'events',
    qKey: 'chat.qEvents',
    options: [
      { key: 'yes', labelKey: 'chat.eventsYes', Icon: TicketIcon },
      { key: 'no', labelKey: 'chat.eventsNo' },
    ],
  },
  {
    key: 'extra',
    qKey: 'chat.qExtra',
    free: true,
  },
];

const NUDGES = ['chat.nudgeMore', 'chat.nudgeLess', 'chat.nudgeFood', 'chat.nudgeIndoor'];

// The last question is a blank box, which is the one moment the flow asks the
// traveller to invent an answer. These are the wishes people actually type,
// one tap instead of a sentence.
const EXTRA_PRESETS = [
  'chat.presetCoffee', 'chat.presetRain', 'chat.presetFamily', 'chat.presetEarly',
];

export function CartaChatPlanner({
  towns, dateISO, groupSize, signedIn, onRun, onImport, onBack, onManual,
  stayPoint, cityOptions, onSuggestCity, resolveNearest,
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ interests: [] });
  const [freeText, setFreeText] = useState('');
  const [phase, setPhase] = useState('ask'); // ask | busy | result | fail
  const [result, setResult] = useState(null);
  const [rounds, setRounds] = useState(0);
  const [refineText, setRefineText] = useState('');
  const [failCode, setFailCode] = useState('');
  const endRef = useRef(null);

  // Macro blocks (Morning / Midday / ...) for the proposed route, announced
  // once per block, matching how the imported day reads on the timeline.
  const stopPhases = useMemo(() => stopPhaseLabels(result?.stops), [result]);

  // Nearby towns become the first question's options, closest first.
  const questions = useMemo(() => QUESTIONS.map((q) => {
    if (q.dynamic !== 'towns') return q;
    // Towns arrive as { id, dest, km }: the name lives on the destination
    // record, and anything without one cannot be offered as a choice.
    const opts = (towns || []).slice(0, 6)
      .filter((tn) => tn?.dest?.city)
      .map((tn) => ({
        key: tn.id,
        label: tn.dest.city,
        sub: tn.km <= 1
          ? t('chat.rightHere')
          : t('chat.kmAway', { km: Math.round(tn.km) }),
        // The traveller rating rides along so the choice is a comparison,
        // not just a list of names and distances.
        rating: tn.dest.rating || null,
        Icon: HomeIcon,
      }));
    // The nearby list can be empty (a remote stay point), but the town
    // question itself never skips: search, map and AI suggestion all work
    // without it.
    return { ...q, options: opts.length ? opts : null, skip: false };
  }), [towns, t]);

  const visible = questions.filter((q) => !q.skip);
  const current = visible[step] || null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [step, phase, result]);

  const answerLabel = (q, value) => {
    if (q.free) return value || t('chat.nothingSpecial');
    if (q.multi) {
      const picked = (q.options || []).filter((o) => (value || []).includes(o.key));
      return picked.length ? picked.map((o) => t(o.labelKey)).join(', ') : t('chat.anything');
    }
    // The town may have been picked by search/map/AI, none of which are
    // among this question's "nearby" options, so its display name travels
    // alongside the answer itself rather than through the options lookup.
    if (q.key === 'town') return answers.townLabel || String(value ?? '');
    const o = (q.options || []).find((x) => x.key === value);
    return o ? (o.label || t(o.labelKey)) : String(value ?? '');
  };

  const advance = (key, value, extra) => {
    const next = { ...answers, [key]: value, ...(extra || {}) };
    setAnswers(next);
    if (step + 1 >= visible.length) generate(next, '');
    else setStep(step + 1);
  };

  const toggleMulti = (key, optKey) => {
    const cur = answers[key] || [];
    setAnswers({
      ...answers,
      [key]: cur.includes(optKey) ? cur.filter((k) => k !== optKey) : [...cur, optKey],
    });
  };

  const generate = async (profile, refine) => {
    setPhase('busy');
    const res = await onRun({
      ...profile,
      freeText: (profile.extra || '').trim(),
      refine,
      prevStops: refine && result ? result.stops.map((s) => s.name) : [],
    });
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
    if (step === 0) { onBack(); return; }
    setStep(step - 1);
  };

  return (
    <div className="chat-flow">
      <div className="chat-head">
        <button className="chat-back" onClick={back} aria-label={t('chat.back')}>‹</button>
        <span className="chat-head-title"><SparkIcon size={14} /> {t('chat.title')}</span>
        {phase === 'ask' && current && (
          <span className="chat-progress">{step + 1}/{visible.length}</span>
        )}
      </div>

      <div className="chat-body">
        {/* Everything answered so far, as a short transcript. */}
        {visible.slice(0, step).map((q) => (
          <div key={q.key} className="chat-turn">
            <div className="chat-bubble bot">{t(q.qKey)}</div>
            <div className="chat-bubble me">{answerLabel(q, answers[q.key])}</div>
          </div>
        ))}

        {phase === 'ask' && current && (
          <div className="chat-turn">
            <div className="chat-bubble bot chat-bubble-live">{t(current.qKey)}</div>
            {current.key === 'town' ? (
              <TownPickerStep
                towns={towns}
                nearbyOptions={current.options}
                stayPoint={stayPoint}
                cityOptions={cityOptions}
                resolveNearest={resolveNearest}
                onSuggestCity={(freeText) => onSuggestCity(freeText, answers)}
                onPick={(id, label) => advance('town', id, { townLabel: label })}
              />
            ) : current.free ? (
              <>
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
                        onClick={() => toggleMulti(current.key, o.key)}
                        aria-pressed={on}
                      >
                        {Icon && <Icon size={16} />}
                        <span>{o.label || t(o.labelKey)}</span>
                        {on && <CheckIcon size={12} />}
                      </button>
                    );
                  })}
                </div>
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
              <div className="chat-opts">
                {(current.options || []).map((o) => {
                  const Icon = o.Icon;
                  return (
                    <button
                      key={o.key}
                      className="chat-opt"
                      onClick={() => advance(current.key, o.key)}
                    >
                      {Icon && <Icon size={16} />}
                      <span className="chat-opt-text">
                        <b>{o.label || t(o.labelKey)}</b>
                        {o.sub && <small>{o.sub}</small>}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {phase === 'busy' && (
          <div className="chat-turn">
            <div className="chat-bubble bot chat-typing">
              <span /><span /><span />
            </div>
            <p className="chat-busy-note">{rounds ? t('chat.reworking') : t('chat.building')}</p>
          </div>
        )}

        {phase === 'result' && result && (
          <div className="chat-result">
            <div className="chat-bubble bot">{result.summary || t('chat.here')}</div>
            <div className="chat-route">
              <div className="chat-route-head">
                <span className="ai-plan-proposal-tag">{t('ai.proposalTag', { n: rounds })}</span>
                <span className="chat-route-stats">
                  {t('ai.totals', { km: result.totals?.walkKm ?? 0, t: result.totals?.endTime ?? '' })}
                </span>
              </div>
              <ol className="ai-sched">
                {result.stops.map((s, i) => (
                  <li key={i} className={`ai-sched-stop ${s.external ? 'ext' : ''}`}>
                    {/* Same macro blocks the planned day reads in, not a
                        per-stop clock. */}
                    <span className="ai-sched-time">{stopPhases[i] ? t(stopPhases[i]) : ''}</span>
                    <span className="ai-sched-body">
                      <b>
                        {s.name}
                        {s.isEvent ? (
                          <span className="ai-disc-tag ai-event-tag"><TicketIcon size={9} /> {t('ai.eventTag')}</span>
                        ) : s.external ? (
                          <span className="ai-disc-tag"><MapPinIcon size={9} /> {t('ai.discovery')}</span>
                        ) : null}
                      </b>
                      {s.why && <small>{s.why}</small>}
                    </span>
                  </li>
                ))}
              </ol>
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
              <button className="chat-opt" onClick={() => generate(answers, '')}>{t('ai.retry')}</button>
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
