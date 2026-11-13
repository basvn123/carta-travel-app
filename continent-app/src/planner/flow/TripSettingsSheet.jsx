import React, { useState } from 'react';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { useSettings } from '../../components/SettingsLine.jsx';
import { fromName } from '../../components/FromPicker.jsx';
import { Button } from '../../components/ui/index.js';
import { ArrowLeftIcon, ChevronRightIcon } from '../../components/Icons.jsx';
import { useLifestyleLabel } from '../planHooks.js';
import { QUESTIONS } from './questions.js';
import { QuestionBody } from './QuestionScreen.jsx';
import { useBcp47, useMonths, useTripSettings, whenText } from './flowHooks.js';
import { normalizeSettings } from './tripSettings.js';
import { VisibilityChoice } from './VisibilityChoice.jsx';
import { StylePicker, styleName } from '../../browse/TravelStylesSheet.jsx';
import { switchTripStyle } from './styleSeed.js';
import { explorePatchFromSettings, normalizeStyle } from '../../lib/travelStyles.js';
import { formatMoney } from '../../lib/money.js';

/**
 * Trip settings (T655), behind the gear on the planner's map: every answer
 * the planner asked, grouped, each row the answer in a few words. A row opens
 * the same question it was asked with, on this sheet, with Save; changing an
 * answer re-prices the trip, because the trip reads these settings and the
 * app-wide values the questions also write. A planned trip, which keeps its
 * own party and dates, takes each saved answer through `onSaved(next, prev)`.
 */
export function TripSettingsSheet({ onClose, anchorRef, onSaved = null, planned = false }) {
  const { t } = useI18n();
  const app = useSettings();
  const [settings, save] = useTripSettings();
  const [editing, setEditing] = useState('');
  // T731: what a saved answer did to a planned trip, in one line, with the
  // next move when there is one ({ text, actionLabel?, onAction? }).
  const [notice, setNotice] = useState(null);
  const lifestyle = useLifestyleLabel();
  const months = useMonths();
  const bcp47 = useBcp47();

  const optLabel = (id, v) => {
    const o = QUESTIONS[id]?.options?.find((x) => x.value === v);
    return o ? t(o.labelKey) : '';
  };
  const many = (id, list) => list.map((v) => optLabel(id, v)).filter(Boolean).join(', ');
  const s = settings;
  const p = s.party;
  const w = whenText(t, s.when, months, bcp47);
  const booked = Object.entries(s.booked).filter(([, on]) => on).map(([k]) => k);

  // The travel style this trip was started from, and whether the trip's own
  // explore answers have since moved away from it (then they can be kept in
  // the style, for the next trip).
  const ts = app?.travelStyles;
  const tripStyle = ts?.list?.find((x) => x.id === s.style) || null;
  const drifted = tripStyle && JSON.stringify(normalizeStyle({ ...tripStyle, ...explorePatchFromSettings(s, tripStyle) }).explore)
    !== JSON.stringify(tripStyle.explore);
  const fromStyle = (id) => s.answered.includes(id) && s.sources?.[id] === 'style';
  const budget = s.guide.budget;
  const budgetText = budget.eur > 0
    ? t(budget.kind === 'total' ? 'styles.budgetTotal' : 'styles.budgetDay', { price: formatMoney(budget.per === 'group' && budget.groupEur ? budget.groupEur : budget.eur) })
    : '';

  const groups = [
    {
      key: 'basics',
      title: t('pf.set.basics'),
      rows: [
        { id: 'booked', label: t('pf.set.booked'), value: booked.length ? many('booked', booked) : t('pf.o.nothing') },
        { id: 'who', label: t('pf.set.who'), value: t('pf.set.whoValue', { kind: t(`pf.who.${p.kind}`), n: p.adults + p.kids + p.babies }) },
        { id: 'sleep', label: t('pf.set.sleep'), value: lifestyle },
        { id: 'priority', label: t('pf.set.priority'), value: optLabel('priority', s.priority) },
        { id: 'when', label: t('pf.set.when'), value: [w.start, w.end].filter(Boolean).join(', ') || t('pf.when.unsure') },
        { id: 'from', label: t('pf.set.from'), value: s.from?.name || fromName(app) || t('pf.set.notSet') },
        // T860: the way there and the home airports in reach (the app's own choices).
        { id: 'way', label: t('pf.set.way'), value: t(`pf.way.${s.way || (app?.transportMode === 'bus' ? 'train' : ['plane', 'train', 'car'].includes(app?.transportMode) ? app.transportMode : 'any')}`) },
        { id: 'airports', label: t('pf.set.airports'), value: app?.airports?.length ? app.airports.join(', ') : t('pf.set.notSet') },
      ],
    },
    {
      key: 'guide',
      title: t('pf.set.guide'),
      rows: [
        { id: 'g:persona', label: t('styles.persona'), value: (s.guide.personas || []).map((v) => t(`pf.persona.${v}`)).join(', ') },
        // T753 left one shape behind: several picked read as their list.
        { id: 'g:shape', label: t('pf.set.shape'), value: many('g:shape', s.guide.shapes) },
        { id: 'g:likes', label: t('pf.set.likes'), value: many('g:likes', s.guide.likes) },
        { id: 'g:around', label: t('styles.around'), value: optLabel('g:around', s.guide.around) },
        { id: 'g:weather', label: t('pf.set.weather'), value: optLabel('g:weather', s.guide.weather) },
        { id: 'g:reach', label: t('pf.set.reach'), value: optLabel('g:reach', s.guide.reach) },
        { id: 'g:avoid', label: t('pf.set.avoid'), value: many('g:avoid', s.guide.avoid) },
        { id: 'g:budget', label: t('styles.budget'), value: budgetText },
      ],
    },
    {
      key: 'days',
      title: t('pf.set.days'),
      // Getting around is asked once, in the guide (g:around); the one goal
      // gave way to the moods of Plan your days (tripSettings aroundOf,
      // goalOfGoals), so neither is a second row here.
      rows: ['r:mornings', 'r:pace', 'r:detail', 'r:food'].map((id) => ({
        id,
        label: t(`pf.set.${id.slice(2)}`),
        value: optLabel(id, s.rhythm[QUESTIONS[id].key]),
      })),
    },
  ];

  if (editing) {
    const q = QUESTIONS[editing];
    return (
      <SheetShell title={t(q.titleKey)} onClose={onClose} anchorRef={anchorRef} className="pf-settings">
        <div className="pf-set-edit">
          <Button variant="quiet" size="sm" className="pf-set-back" iconStart={<ArrowLeftIcon size={16} />} onClick={() => setEditing('')}>
            {t('pf.set.all')}
          </Button>
          <QuestionBody
            id={editing}
            settings={s}
            doneLabel={t('pf.set.save')}
            commit={(next) => {
              save(next);
              setNotice(onSaved ? onSaved(normalizeSettings(next), s) || null : null);
              setEditing('');
            }}
          />
        </div>
      </SheetShell>
    );
  }

  return (
    <SheetShell title={t('pf.settings')} onClose={onClose} anchorRef={anchorRef} className="pf-settings">
      <div className="pf-set">
        {notice && (
          <div className="pf-set-notice" role="status">
            <p className="pf-note">{notice.text}</p>
            {notice.actionLabel && (
              <Button variant="secondary" size="sm" onClick={notice.onAction}>{notice.actionLabel}</Button>
            )}
          </div>
        )}
        <div className="pf-set-trip">
          <label className="pf-label" htmlFor="pf-set-name">{t('pf.create.name')}</label>
          <input
            id="pf-set-name"
            className="pf-input pf-set-input"
            value={s.trip.name}
            maxLength={80}
            onChange={(e) => save(normalizeSettings({ ...s, trip: { ...s.trip, name: e.target.value } }))}
          />
          {/* T847: who can see the trip lives in Share this trip on the
              trip page; the settings hold what the trip is made of. Before
              a trip exists (no page yet) it stays here. */}
          {!planned && (
            <>
              <span className="pf-label">{t('pf.create.visibility')}</span>
              <VisibilityChoice
                value={s.trip.visibility}
                onChange={(v) => save(normalizeSettings({ ...s, trip: { ...s.trip, visibility: v } }))}
              />
            </>
          )}
        </div>
        {ts?.list?.length > 0 && (
          <section className="pf-set-group pf-style" aria-labelledby="pf-set-style">
            <h3 className="pf-label" id="pf-set-style">{t('styles.tripStyle')}</h3>
            <StylePicker
              compact
              list={ts.list}
              activeId={s.style}
              label={t('styles.tripStyle')}
              onPick={(id) => {
                const st = ts.list.find((x) => x.id === id);
                if (!st || id === s.style) return;
                const next = switchTripStyle(s, st);
                ts.switchTo(id);
                save(next);
                setNotice(onSaved ? onSaved(normalizeSettings(next), s) || null : null);
              }}
            />
            {drifted && (
              <Button variant="secondary" size="sm" onClick={() => ts.update(tripStyle.id, explorePatchFromSettings(s, tripStyle))}>
                {t('styles.keep', { name: styleName(t, tripStyle) })}
              </Button>
            )}
          </section>
        )}
        {groups.map((g) => (
          <section className="pf-set-group" key={g.key} aria-labelledby={`pf-set-${g.key}`}>
            <h3 className="pf-label" id={`pf-set-${g.key}`}>{g.title}</h3>
            {planned && g.key === 'guide' && <p className="pf-note pf-set-groupnote">{t('pf.set.guideNote')}</p>}
            <ul className="pf-set-rows">
              {g.rows.map((r) => (
                <li key={r.id}>
                  <Button variant="quiet" className="pf-set-row" onClick={() => setEditing(r.id)} iconEnd={<ChevronRightIcon size={16} className="pf-ico" />}>
                    <span className="pf-set-text">
                      <span className="pf-set-label">{r.label}</span>
                      <span className={`pf-set-value${r.value ? '' : ' is-empty'}`}>{r.value || t('pf.set.notSet')}</span>
                      {fromStyle(r.id) && tripStyle && <span className="pf-style-tag">{t('styles.fromStyle', { name: styleName(t, tripStyle) })}</span>}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </SheetShell>
  );
}
