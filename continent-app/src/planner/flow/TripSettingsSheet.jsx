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
      ],
    },
    {
      key: 'guide',
      title: t('pf.set.guide'),
      rows: [
        { id: 'g:shape', label: t('pf.set.shape'), value: optLabel('g:shape', s.guide.shape) },
        { id: 'g:likes', label: t('pf.set.likes'), value: many('g:likes', s.guide.likes) },
        { id: 'g:weather', label: t('pf.set.weather'), value: optLabel('g:weather', s.guide.weather) },
        { id: 'g:reach', label: t('pf.set.reach'), value: optLabel('g:reach', s.guide.reach) },
        { id: 'g:avoid', label: t('pf.set.avoid'), value: many('g:avoid', s.guide.avoid) },
      ],
    },
    {
      key: 'days',
      title: t('pf.set.days'),
      rows: ['r:mornings', 'r:pace', 'r:detail', 'r:goal', 'r:food', 'r:around'].map((id) => ({
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
