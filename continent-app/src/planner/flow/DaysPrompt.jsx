import React, { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, Segmented } from '../../components/ui/index.js';
import { CheckIcon, ListDayIcon, PencilIcon, SparkIcon } from '../../components/Icons.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { useTripSettings } from './flowHooks.js';
import { RHYTHM, markAnswered, normalizeSettings } from './tripSettings.js';

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
 *   onPlan(how)   'carta' | 'bot' | 'self'
 */
const WAYS = [
  { value: 'carta', Icon: ListDayIcon },
  { value: 'bot', Icon: SparkIcon },
  { value: 'self', Icon: PencilIcon },
];
// The trip's likes as the days' goals, so the screen opens filled in.
const LIKE_GOAL = { beach: 'beach', islands: 'beach', hiking: 'nature', lakes: 'nature', cycling: 'nature', culture: 'sights', city: 'sights', food: 'food', nightlife: 'nightlife' };

export function DaysPrompt({ onClose, onPlan }) {
  const { t } = useI18n();
  const [settings, save] = useTripSettings();
  const r = settings.rhythm;
  const [way, setWay] = useState(settings.daysHow === 'self' ? 'self' : settings.daysHow === 'bot' ? 'bot' : 'carta');
  const [view, setView] = useState('how');
  const [goals, setGoals] = useState(() => {
    if (r.goals.length) return r.goals;
    const fromLikes = [...new Set(settings.guide.likes.map((k) => LIKE_GOAL[k]).filter(Boolean))].slice(0, 3);
    return fromLikes.length ? fromLikes : ['sights', 'food'];
  });
  const [pace, setPace] = useState(r.pace || 'balanced');
  const [mornings, setMornings] = useState(r.mornings || 'onthego');
  const [keep, setKeep] = useState(r.keep);
  const flip = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const finish = (how) => {
    let next = { ...settings, daysHow: how };
    if (how === 'carta') {
      next = { ...next, rhythm: { ...settings.rhythm, goals, pace, mornings, keep } };
      for (const id of ['r:pace', 'r:mornings', 'r:goal']) next = markAnswered(next, id);
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
                  <span className="pdh-way-sub">{t(`pf.dh.${value}Sub`)}</span>
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
            <div className="pdh-group">
              <p className="pdh-q">{t('pf.dh.pace')}</p>
              <Segmented block label={t('pf.dh.pace')} value={pace} onChange={setPace}
                options={['slow', 'balanced', 'packed'].map((v) => ({ value: v, label: t(`pf.dh.pace.${v}`) }))} />
            </div>
            <div className="pdh-group">
              <p className="pdh-q">{t('pf.dh.start')}</p>
              <Segmented block label={t('pf.dh.start')} value={mornings} onChange={setMornings}
                options={['early', 'onthego', 'slow'].map((v) => ({ value: v, label: t(`pf.dh.start.${v}`) }))} />
            </div>
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
