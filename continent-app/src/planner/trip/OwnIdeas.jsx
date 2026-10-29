import React, { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Field, IconButton } from '../../components/ui/index.js';
import { CloseIcon, PlusIcon } from '../../components/Icons.jsx';
import { cityLabel } from '../../lib/placeName.js';
import { addIdea, removeIdea, setIdeaDay } from './ownIdeas.js';

/**
 * Your ideas (T850, owner board panel 9): anything in your own words (a
 * restaurant a friend named, "swim in the lake", "buy cheese"), kept for
 * later or put on a day. One field and Add; each idea then has its day (a
 * select of the trip's days, "For later" first) and a remove. An idea on a
 * day shows on that day's card. Kept in the trip extras, so the account
 * keeps it too.
 *
 *   store     useTripDayStore() ({ extras, saveExtras })
 *   dayPlan   the trip's days, for the day select
 */
export function OwnIdeas({ store, dayPlan }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const { extras, saveExtras } = store;
  const ideas = extras.ideas || [];
  const add = () => {
    if (!text.trim()) return;
    saveExtras(addIdea(extras, text));
    setText('');
  };
  return (
    <section className="tpi" aria-labelledby="tpi-h">
      <h3 className="tpi-h" id="tpi-h">{t('tp.ideas.title')}</h3>
      <form className="tpi-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <Field label={t('tp.ideas.label')} value={text} maxLength={140} autoComplete="off" onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="secondary" iconStart={<PlusIcon size={16} />} disabled={!text.trim()}>{t('tp.ideas.add')}</Button>
      </form>
      {ideas.length > 0 && (
        <ul className="tpi-list">
          {ideas.map((x) => (
            <li key={x.id} className={`tpi-item${x.day ? ' is-placed' : ''}`}>
              <span className="tpi-text">{x.text}</span>
              <label className="tpi-day">
                <span className="sr-only">{t('tp.ideas.when', { idea: x.text })}</span>
                <select value={x.day || ''} onChange={(e) => saveExtras(setIdeaDay(extras, x.id, Number(e.target.value) || null))}>
                  <option value="">{t('tp.ideas.later')}</option>
                  {dayPlan.map((d) => (
                    <option key={d.dayNum} value={d.dayNum}>{t('tp.ideas.dayOpt', { n: d.dayNum, city: cityLabel(d.stop?.dest?.city || '') })}</option>
                  ))}
                </select>
              </label>
              <IconButton tone="plain" label={t('tp.ideas.remove', { idea: x.text })} onClick={() => saveExtras(removeIdea(extras, x.id))}>
                <CloseIcon size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
