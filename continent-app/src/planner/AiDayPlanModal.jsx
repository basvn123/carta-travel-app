import React, { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { DAY_STYLES } from './dayDraft.js';
import { stopPhaseLabels } from './daySchedule.js';
import {
  SparkIcon, CastleIcon, MuseumIcon, TreeIcon, DiningIcon, CameraIcon,
  MapPinIcon, CheckIcon, CalendarIcon, PersonIcon, TicketIcon,
} from '../components/Icons.jsx';

const STYLE_ICONS = {
  classic: CastleIcon, culture: MuseumIcon, active: TreeIcon,
  foodie: DiningIcon, mix: CameraIcon,
};

const PACES = [
  { key: 'relaxed', labelKey: 'shape.paceRelaxed' },
  { key: 'balanced', labelKey: 'shape.paceBalanced' },
  { key: 'packed', labelKey: 'shape.pacePacked' },
];

// Failure codes that deserve a "try again" (transient) vs the ones where
// retrying is pointless and the built-in planner is the honest next step.
const RETRYABLE = new Set(['ai_busy', 'ai_timeout', 'ai_error', 'network', 'ai_bad_output']);
const FAIL_KEY = {
  auth: 'ai.signIn',
  no_auth_config: 'ai.signIn',
  user_cap: 'ai.quotaUser',
  global_cap: 'ai.quotaGlobal',
  no_ai: 'ai.unavailable',
  too_few: 'ai.tooFew',
};

// Quick nudges under the result, so refining is one tap rather than a blank
// text box the traveller has to think of something to write in.
const NUDGES = [
  { key: 'more', textKey: 'ai.nudgeMore' },
  { key: 'less', textKey: 'ai.nudgeLess' },
  { key: 'food', textKey: 'ai.nudgeFood' },
  { key: 'indoor', textKey: 'ai.nudgeIndoor' },
];

/**
 * The AI day-planner dialog. Ask, generate, review, refine, then import.
 *
 * Nothing reaches the map until the traveller presses import: a generated day
 * is a PROPOSAL living in this dialog's state. If they don't like it they can
 * push it back ("more museums, less walking") as many times as their daily
 * budget allows, each pass replacing the proposal in place.
 *
 * Works as a centered card on desktop and a full-width sheet on phones (see
 * .ai-plan-card in styles.css). Purely presentational: the API call (onRun),
 * the import (onApply) and the fallback draft (onFallback) live in
 * DayPlannerTab, next to the state they mutate.
 */
export function AiDayPlanModal({
  city, dayNumber, dateISO, groupSize, signedIn, onRun, onApply, onFallback, onClose,
}) {
  const { t } = useI18n();
  const [vibe, setVibe] = useState('mix');
  const [pace, setPace] = useState('balanced');
  const [hills, setHills] = useState(false);
  const [freeText, setFreeText] = useState('');
  const [date, setDate] = useState(dateISO || '');
  const [people, setPeople] = useState(Math.max(1, Math.min(20, groupSize || 2)));
  const [wantEvents, setWantEvents] = useState(false);
  const [phase, setPhase] = useState('form'); // form | busy | done | fail
  const [result, setResult] = useState(null);  // the current proposal
  const [refineText, setRefineText] = useState('');
  const [rounds, setRounds] = useState(0);     // how many times we generated
  const [failCode, setFailCode] = useState('');

  const answers = {
    vibe, pace, avoidHills: hills, freeText: freeText.trim(), date, groupSize: people, wantEvents,
  };

  // One entry point for both the first generation and every refinement: a
  // refinement simply carries the previous proposal's stop names along.
  const generate = async (refine = '') => {
    setPhase('busy');
    const res = await onRun({
      ...answers,
      refine,
      prevStops: refine && result ? result.stops.map((s) => s.name) : [],
    });
    if (res.ok) {
      setResult(res.plan);
      setRefineText('');
      setRounds((n) => n + 1);
      setPhase('done');
    } else {
      setFailCode(res.code || 'ai_error');
      setPhase('fail');
    }
  };

  const chipRow = (label, options, activeKey, onPick) => (
    <div className="carta-plan-row">
      <span className="carta-plan-q">{label}</span>
      <div className="carta-plan-chips">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            className={`carta-plan-chip ${activeKey === o.key ? 'on' : ''}`}
            onClick={() => onPick(o.key)}
            aria-pressed={activeKey === o.key}
          >
            {t(o.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );

  const externals = result ? result.stops.filter((s) => s.external) : [];
  const events = result ? result.stops.filter((s) => s.isEvent) : [];

  // The macro block each proposed stop falls in, announced once per block
  // rather than as a clock time on every row.
  const stopPhases = useMemo(() => stopPhaseLabels(result?.stops), [result]);

  return (
    <div className="day-saved-overlay ai-plan-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="day-saved-card ai-plan-card" onClick={(e) => e.stopPropagation()}>
        <button className="day-saved-close" onClick={onClose} aria-label={t('shape.close')} title={t('shape.close')}>×</button>
        <div className="ai-plan-head">
          <span className="ai-plan-badge"><SparkIcon size={15} /></span>
          <h3>{t('ai.title', { n: dayNumber, city })}</h3>
        </div>

        {phase === 'form' && (
          <>
            <p className="ai-plan-lead">{t('ai.lead')}</p>
            {!signedIn && (
              <p className="ai-plan-note ai-plan-note-warn">{t('ai.signIn')}</p>
            )}

            {/* When and how many: the two facts that change the whole day
                (season and heat, walking speed, table sizes). Prefilled from
                the plan, editable here because the traveller may be planning
                for a different date or a different crowd than the trip. */}
            <div className="carta-plan-row ai-plan-facts">
              <label className="ai-plan-fact">
                <span className="carta-plan-q"><CalendarIcon size={11} /> {t('ai.dateLabel')}</span>
                <input
                  type="date"
                  className="ai-plan-date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="ai-plan-fact">
                <span className="carta-plan-q"><PersonIcon size={11} /> {t('ai.peopleLabel')}</span>
                <span className="trip-people ai-plan-people">
                  <button type="button" onClick={() => setPeople((n) => Math.max(1, n - 1))} aria-label={t('ai.fewerPeople')}>-</button>
                  <span>{people}</span>
                  <button type="button" onClick={() => setPeople((n) => Math.min(20, n + 1))} aria-label={t('ai.morePeople')}>+</button>
                </span>
              </label>
            </div>

            <div className="carta-plan-row">
              <span className="carta-plan-q">{t('shape.kindOfDay')}</span>
              <div className="day-guide-moods carta-plan-moods">
                {DAY_STYLES.map((s) => {
                  const Icon = STYLE_ICONS[s.key] || SparkIcon;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`day-guide-mood ${vibe === s.key ? 'on' : ''}`}
                      onClick={() => setVibe(s.key)}
                      aria-pressed={vibe === s.key}
                      title={s.desc}
                    >
                      <Icon size={16} />
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {chipRow(t('shape.pace'), PACES, pace, setPace)}

            <div className="carta-plan-row ai-plan-toggles">
              <label className="ai-plan-hills">
                <input type="checkbox" checked={hills} onChange={(e) => setHills(e.target.checked)} />
                <span>{t('ai.hills')}</span>
              </label>
              <label className="ai-plan-hills">
                <input type="checkbox" checked={wantEvents} onChange={(e) => setWantEvents(e.target.checked)} />
                <span><TicketIcon size={11} /> {t('ai.events')}</span>
              </label>
            </div>
            {wantEvents && <p className="ai-plan-note">{t('ai.eventsNote')}</p>}

            <div className="carta-plan-row">
              <span className="carta-plan-q">{t('ai.freeLabel')}</span>
              <textarea
                className="ai-plan-free"
                value={freeText}
                maxLength={280}
                rows={2}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder={t('ai.freePlaceholder')}
              />
            </div>

            <div className="ai-plan-actions">
              {signedIn ? (
                <button className="guide-next ai-plan-generate" onClick={() => generate('')}>
                  <SparkIcon size={12} /> {t('ai.generate')}
                </button>
              ) : (
                <button className="guide-next ai-plan-generate" onClick={() => onFallback(answers)}>
                  {t('ai.fallback')}
                </button>
              )}
            </div>
            <p className="ai-plan-note">{t('ai.privacy')}</p>
          </>
        )}

        {phase === 'busy' && (
          <div className="ai-plan-busy">
            <span className="ai-plan-spinner" aria-hidden="true" />
            <p>{rounds ? t('ai.regenerating') : t('ai.generating', { city })}</p>
          </div>
        )}

        {phase === 'done' && result && (
          <>
            <p className="ai-plan-proposal-tag">{t('ai.proposalTag', { n: rounds })}</p>
            {result.summary && <p className="ai-plan-lead">{result.summary}</p>}
            {/* The proposal reads in the same macro blocks the imported day
                will: showing 09:33 here and "Morning" thirty seconds later,
                for the very same plan, would make the day look like a
                timetable being quietly loosened behind the traveller's back. */}
            <ol className="ai-sched">
              {result.stops.map((s, i) => (
                <li key={i} className={`ai-sched-stop ${s.external ? 'ext' : ''}`}>
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
                    {i > 0 && s.walkMinFromPrev > 0 && (
                      <small className="ai-sched-walk">{t('ai.walkLeg', { min: s.walkMinFromPrev })}</small>
                    )}
                  </span>
                </li>
              ))}
            </ol>
            <p className="ai-plan-note">
              {t('ai.totals', { km: result.totals?.walkKm ?? 0, t: result.totals?.endTime ?? '' })}
              {' '}
              {result.meta?.optimized ? t('ai.optimizedNote') : t('ai.routeCheckedNote')}
            </p>
            {externals.length > 0 && (
              <p className="ai-plan-note">{t('ai.discoveryNote', { n: externals.length })}</p>
            )}
            {events.length > 0 && (
              <p className="ai-plan-note ai-plan-note-warn">{t('ai.eventCaveat')}</p>
            )}

            {/* Not happy? Push it back. Each pass replaces the proposal. */}
            <div className="ai-refine">
              <span className="carta-plan-q">{t('ai.refineLabel')}</span>
              <div className="ai-refine-nudges">
                {NUDGES.map((n) => (
                  <button
                    key={n.key}
                    type="button"
                    className="carta-plan-chip"
                    onClick={() => generate(t(n.textKey))}
                  >
                    {t(n.textKey)}
                  </button>
                ))}
              </div>
              <div className="ai-refine-row">
                <input
                  type="text"
                  className="ai-refine-input"
                  value={refineText}
                  maxLength={280}
                  placeholder={t('ai.refinePlaceholder')}
                  onChange={(e) => setRefineText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && refineText.trim()) generate(refineText.trim()); }}
                />
                <button
                  className="trip-add-btn"
                  disabled={!refineText.trim()}
                  onClick={() => generate(refineText.trim())}
                >
                  {t('ai.refineGo')}
                </button>
              </div>
            </div>

            <div className="ai-plan-actions">
              <button className="guide-next ai-plan-generate ai-plan-import" onClick={() => onApply(result)}>
                <CheckIcon size={12} /> {t('ai.apply')}
              </button>
              <button className="day-saved-done ai-plan-secondary" onClick={() => setPhase('form')}>
                {t('ai.tweak')}
              </button>
            </div>
          </>
        )}

        {phase === 'fail' && (
          <>
            <p className="ai-plan-note ai-plan-note-warn">
              {t(FAIL_KEY[failCode] || 'ai.error')}
            </p>
            <div className="ai-plan-actions">
              {RETRYABLE.has(failCode) && (
                <button className="guide-next ai-plan-generate" onClick={() => generate('')}>
                  {t('ai.retry')}
                </button>
              )}
              {/* A failed refinement must not throw away a good proposal. */}
              {result && (
                <button className="day-saved-done ai-plan-secondary" onClick={() => setPhase('done')}>
                  {t('ai.backToProposal')}
                </button>
              )}
              <button
                className={RETRYABLE.has(failCode) || result ? 'day-saved-done ai-plan-secondary' : 'guide-next ai-plan-generate'}
                onClick={() => onFallback(answers)}
              >
                {t('ai.fallback')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
