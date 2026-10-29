import React, { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Field } from '../../components/ui/index.js';
import { PencilIcon } from '../../components/Icons.jsx';
import { NOTE_MAX, setDayNote } from './ownIdeas.js';

/**
 * A day planned in a few words (T851, owner board panel 9: "flexible to
 * what the user needs, hyper-detailed or just high level"): the high-level
 * way is a line or two of your own ("Old town, lazy lunch, castle at
 * sunset"); the detailed way is the day planner, place by place. The note
 * shows on the card; Edit opens it in place.
 *
 *   day       the day's number
 *   store     useTripDayStore() ({ extras, saveExtras })
 */
export function DayNote({ day, store }) {
  const { t } = useI18n();
  const { extras, saveExtras } = store;
  const note = extras.dayNotes?.[day] || '';
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note);
  const save = () => { saveExtras(setDayNote(extras, day, text)); setEditing(false); };
  if (editing) {
    return (
      <form className="tpd-note-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field as="textarea" rows={2} maxLength={NOTE_MAX} label={t('tp.note.label', { n: day })} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="tpd-note-acts">
          <Button type="submit" variant="secondary" size="sm">{t('tp.ed.save')}</Button>
          <Button variant="quiet" size="sm" onClick={() => { setText(note); setEditing(false); }}>{t('tp.bal.cancel')}</Button>
        </div>
      </form>
    );
  }
  if (note) {
    return (
      <div className="tpd-note">
        <p>{note}</p>
        <Button variant="quiet" size="sm" iconStart={<PencilIcon size={14} />} onClick={() => { setText(note); setEditing(true); }}
          aria-label={t('tp.note.edit', { n: day })}>
          {t('tp.note.editShort')}
        </Button>
      </div>
    );
  }
  return (
    <Button variant="quiet" size="sm" className="tpd-note-add" iconStart={<PencilIcon size={14} />} onClick={() => { setText(''); setEditing(true); }}>
      {t('tp.note.add')}
    </Button>
  );
}
