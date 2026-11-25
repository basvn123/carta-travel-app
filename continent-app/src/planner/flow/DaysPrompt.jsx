import React, { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, ChipGroup, Segmented } from '../../components/ui/index.js';
import { CheckIcon, ListDayIcon, PencilIcon, SparkIcon } from '../../components/Icons.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { useTripSettings } from './flowHooks.js';
import { RHYTHM, markAnswered, normalizeSettings } from './tripSettings.js';
import { daysPrefill } from './daysPrefill.js';
import { useHoldApp } from './StyleBar.jsx';

/**
 * Plan your days (T658; T896, the owner's plan days board 2026-10-30): how
 * the days are planned comes first, because two of the three ways need
 * nothing more (Iyengar: the easy, path-setting choice first keeps people
 * in). Carta plans every day asks once more, on one screen already filled
 * from the trip: what the days should hold more of, the pace, when the
 * days start and what to keep in mind. The seven rhythm screens before it
 * (mornings, pace, how planned, the goal, food, getting around, then who
 * plans) are gone: how planned is a view on the day, food a goal, getting
 * around the trip's own answer.
 *
 * G12 plan rethink (lane L7, decision §12, the question rule): mornings and
 * pace live in the travel style, so they show as chips filled from it and
 * are not asked again; detail, the goal (what more of) and food are not in
 * the style, so they are asked, the goal and food opening prefilled
 * (daysPrefill.js). How the days are planned stays the first question.
 *
 *   onPlan(how)   'carta' | 'bot' | 'self'
 */
const WAYS = [
  { value: 'carta', Icon: ListDayIcon },
  { value: 'bot', Icon: SparkIcon },
  { value: 'self', Icon: PencilIcon },
];

export function DaysPrompt({ onClose, onPlan }) {
  const { t } = useI18n();
  const [settings, save] = useTripSettings();
  const r = settings.rhythm;
  const app = useHoldApp();
  const style = (app?.travelStyles?.list || []).find((x) => x.id === settings.style) || null;
  const [first] = useState(() => daysPrefill(settings, style));
  const [way, setWay] = useState(settings.daysHow === 'self' ? 'self' : settings.daysHow === 'bot' ? 'bot' : 'carta');
  const [view, setView] = useState('how');
  const [goals, setGoals] = useState(first.goals);
  const [pace, setPace] = useState(first.pace);
  const [mornings, setMornings] = useState(first.mornings);
  const [detail, setDetail] = useState(first.detail);
  const [food, setFood] = useState(first.food);
  const [keep, setKeep] = useState(r.keep);
  const flip = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const finish = (how) => {
    let next = { ...settings, daysHow: how };
    if (how === 'carta') {
      next = { ...next, rhythm: { ...settings.rhythm, goals, pace, mornings, keep, detail, food } };
      // An answer the travel style gave and left as it was stays the style's,
      // so switching the trip's style later still moves it; one the
      // traveller changed here is theirs.
      const kept = { 'r:pace': pace === settings.rhythm.pace, 'r:mornings': mornings === settings.rhythm.mornings };
      for (const id of ['r:pace', 'r:mornings', 'r:goal', 'r:detail', 'r:food']) {
        if (kept[id] && settings.sources?.[id] === 'style') continue;
        next = markAnswered(next, id);
      }
    }
    save(normalizeSettings(next));
    onPlan(how);
  };

  const goLabel = way === 'bot' ? t('pf.dh.goBot') : way === 'self' ? t('pf.dh.goSelf') : t('pf.continue');
  return (
    <SheetShell title={view === 'how' ? t('pf.dh.title') : t('pf.dh.prefsTitle')} onClose={onClose} width={760} className="pf-days pdh">
      {view === 'how' ? (
        <div className="pdh-body">
          <div className="pdh-ways" role="radiogroup" aria-label={t('pf.dh.title')}>
            {WAYS.map(({ value, Icon }) => (
              <Button key={value} variant="quiet" role="radio" aria-checked={way === value}
                className={`pdh-way${way === value ? ' is-on' : ''}`} onClick={() => setWay(value)}>
                <span className="pdh-way-ic" aria-hidden="true"><Icon size={22} /></span>
                <span className="pdh-way-txt">
                  <span className="pdh-way-name">{t(`pf.dh.${value}`)}</span>
                  {/* T1017 (owner): the way's name only, no subline. */}
                </span>
                <span className="pdh-way-tick" aria-hidden="true">{way === value && <CheckIcon size={13} />}</span>
              </Button>
            ))}
          </div>
          <div className="pdh-foot">
            <Button variant="primary" onClick={() => (way === 'carta' ? setView('prefs') : finish(way))}>{goLabel}</Button>
          </div>
        </div>
      ) : (
        <div className="pdh-body">
          <div className="pdh-prefs">
            <div className="pdh-group is-wide">
              <p className="pdh-q" id="pdh-goals">{t('pf.dh.more')}</p>
              <div className="pdh-chips" role="group" aria-labelledby="pdh-goals">
                {RHYTHM.goals.map((g) => (
                  <Chip key={g} kind="filter" selected={goals.includes(g)} onClick={() => setGoals((cur) => flip(cur, g))}>{t(`pf.dh.g.${g}`)}</Chip>
                ))}
              </div>
            </div>
            <OneChips id="pdh-pace" label={t('pf.dh.pace')} value={pace} onChange={setPace} styled={first.from.pace === 'style' && pace === first.pace}
              options={['slow', 'balanced', 'packed'].map((v) => ({ value: v, label: t(`pf.dh.pace.${v}`) }))} />
            <OneChips id="pdh-start" label={t('pf.dh.start')} value={mornings} onChange={setMornings} styled={first.from.mornings === 'style' && mornings === first.mornings}
              options={['early', 'onthego', 'slow'].map((v) => ({ value: v, label: t(`pf.dh.start.${v}`) }))} />
            <div className="pdh-group">
              <p className="pdh-q">{t('pf.q.detail')}</p>
              <Segmented block label={t('pf.q.detail')} value={detail} onChange={setDetail}
                options={RHYTHM.detail.map((v) => ({ value: v, label: t(`pf.o.${v}`) }))} />
            </div>
            <OneChips id="pdh-food" label={t('pf.q.food')} value={food} onChange={setFood} styled={first.from.food === 'style' && food === first.food}
              options={RHYTHM.food.map((v) => ({ value: v, label: t(`pf.o.${v}`) }))} />
            <div className="pdh-group is-wide">
              <p className="pdh-q" id="pdh-keep">{t('pf.dh.keep')}</p>
              <div className="pdh-chips" role="group" aria-labelledby="pdh-keep">
                {RHYTHM.keep.map((k) => (
                  <Chip key={k} kind="filter" selected={keep.includes(k)} onClick={() => setKeep((cur) => flip(cur, k))}>{t(`pf.dh.k.${k}`)}</Chip>
                ))}
              </div>
            </div>
          </div>
          <div className="pdh-foot">
            <Button variant="secondary" onClick={() => setView('how')}>{t('pf.back')}</Button>
            <Button variant="primary" disabled={!goals.length} onClick={() => finish('carta')}>{t('pf.dh.go')}</Button>
          </div>
        </div>
      )}
    </SheetShell>
  );
}

/**
 * One answer as chips (G12 L7): mornings, pace and food read at a glance
 * and change with one tap; "From your style" says the style filled it,
 * until the traveller picks another for this trip.
 */
function OneChips({ id, label, value, onChange, options, styled = false }) {
  const { t } = useI18n();
  return (
    <div className="pdh-group">
      <p className="pdh-q" id={id}>
        {label}
        {styled && <span className="pdh-from">{t('pf.dh.fromStyle')}</span>}
      </p>
      <ChipGroup label={label} className="pdh-chips">
        {options.map((o) => (
          <Chip key={o.value} kind="choice" selected={value === o.value} onClick={() => onChange(o.value)}>{o.label}</Chip>
        ))}
      </ChipGroup>
    </div>
  );
}
