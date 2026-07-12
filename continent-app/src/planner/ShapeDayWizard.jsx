import React, { useState } from 'react';
import { INTERESTS } from './GuidedTripWizard.jsx';
import { PACES } from './dayDraft.js';
import { CheckIcon } from '../components/Icons.jsx';

// Selectable "when does your day start" options, shared with the planner view.
export const DAY_STARTS = [
  { min: 8 * 60, label: '8 AM', hint: 'early start' },
  { min: 9 * 60, label: '9 AM', hint: 'standard' },
  { min: 10 * 60, label: '10 AM', hint: 'late start' },
];

/**
 * "Shape your day" - the two-step mini-wizard shown when a day plan opens with
 * nothing planned yet. Asks what the traveller enjoys, then how the day should
 * feel (pace, start time, lunch), and hands the answers back so the planner can
 * auto-draft every day. Skippable at any point for hand-planning.
 *
 *   initial   { interests: string[], pace, startMin, lunch } to prefill
 *   city      city name, for the title
 *   numDays   how many days will be drafted (copy only)
 *   onSkip()  close without drafting
 *   onDraft(prefs) - prefs as above; caller drafts + persists
 */
export function ShapeDayWizard({ city, numDays, initial, onSkip, onDraft }) {
  const [step, setStep] = useState(1);
  const [interests, setInterests] = useState(() => new Set(initial?.interests || []));
  const [pace, setPace] = useState(initial?.pace || 'balanced');
  const [startMin, setStartMin] = useState(initial?.startMin ?? 9 * 60);
  const [lunch, setLunch] = useState(initial?.lunch ?? true);

  const toggleInterest = (key) => {
    setInterests((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const finish = () => {
    onDraft({ interests: [...interests], pace, startMin, lunch });
  };

  return (
    <div className="guide-overlay" onClick={onSkip}>
      <div className="guide-modal shape-modal" onClick={(e) => e.stopPropagation()}>
        <div className="guide-head">
          <button className="guide-close" onClick={onSkip} aria-label="Close">×</button>
          <div className="shape-head-title">
            Shape your {numDays > 1 ? `${numDays} days` : 'day'} in {city}
            <span className="shape-head-step">step {step} of 2</span>
          </div>
        </div>

        <div className="guide-body">
          {step === 1 && (
            <>
              <h2 className="guide-title">What do you enjoy?</h2>
              <p className="guide-sub">Select any that apply. Your picks rank each day's highlights; leave empty for a general mix.</p>
              <div className="guide-interest-grid">
                {INTERESTS.map((it) => (
                  <button
                    key={it.key}
                    className={`guide-interest ${interests.has(it.key) ? 'on' : ''}`}
                    onClick={() => toggleInterest(it.key)}
                    aria-pressed={interests.has(it.key)}
                  >
                    {interests.has(it.key) && <span className="guide-interest-check"><CheckIcon size={11} /></span>}
                    <span className="guide-interest-icon"><it.Icon size={20} /></span>
                    <span className="guide-interest-label">{it.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="guide-title">Set your pace</h2>
              <p className="guide-sub">This determines how many stops fit into each day and when the schedule starts.</p>

              <div className="shape-field-title">Pace</div>
              <div className="shape-pace-row">
                {PACES.map((p) => (
                  <button
                    key={p.key}
                    className={`shape-pace ${pace === p.key ? 'on' : ''}`}
                    onClick={() => setPace(p.key)}
                    aria-pressed={pace === p.key}
                  >
                    <span className="shape-pace-label">{p.label}</span>
                    <span className="shape-pace-hint">{p.hint}</span>
                  </button>
                ))}
              </div>

              <div className="shape-field-title">Day starts at</div>
              <div className="shape-pace-row">
                {DAY_STARTS.map((s) => (
                  <button
                    key={s.min}
                    className={`shape-pace ${startMin === s.min ? 'on' : ''}`}
                    onClick={() => setStartMin(s.min)}
                    aria-pressed={startMin === s.min}
                  >
                    <span className="shape-pace-label">{s.label}</span>
                    <span className="shape-pace-hint">{s.hint}</span>
                  </button>
                ))}
              </div>

              <label className="shape-lunch">
                <input type="checkbox" checked={lunch} onChange={(e) => setLunch(e.target.checked)} />
                Leave room for a lunch break
              </label>
            </>
          )}
        </div>

        <div className="guide-foot">
          <div className="guide-foot-summary">
            <button className="shape-skip" onClick={onSkip}>Skip and plan manually</button>
          </div>
          <div className="guide-foot-actions">
            {step === 2 && <button className="guide-back" onClick={() => setStep(1)}>Back</button>}
            {step === 1 ? (
              <button className="guide-next" onClick={() => setStep(2)}>Next</button>
            ) : (
              <button className="guide-next" onClick={finish}>
                Draft my {numDays > 1 ? 'days' : 'day'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
