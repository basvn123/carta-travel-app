import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { usePaywall } from '../../hooks/usePaywall.jsx';
import { filesToPayload, requestBookingImport, IMPORT_ACCEPT } from '../bookingImport.js';
import { Button, ChoiceRows } from '../../components/ui/index.js';
import { UploadIcon } from '../../components/Icons.jsx';
import { QUESTIONS, toggleValue } from './questions.js';
import { answer, markAnswered, normalizeSettings, fromImports } from './tripSettings.js';
import { prefillFromText } from './prefill.js';
import { syncParty, syncWhen } from './appSync.js';
import { useSettings } from '../../components/SettingsLine.jsx';
import { plannerStore } from '../plannerStore.js';
import { WhoScreen, SleepScreen, WhenScreen, FromScreen, LikesScreen, BudgetScreen, NowWhereScreen, NowUntilScreen } from './setupScreens.jsx';

/** The questions with their own controls (setupScreens.jsx). */
const CUSTOM = {
  who: WhoScreen, sleep: SleepScreen, when: WhenScreen, from: FromScreen, 'g:likes': LikesScreen, 'g:budget': BudgetScreen,
  nowWhere: NowWhereScreen, nowUntil: NowUntilScreen,
};

/**
 * The body of one question: its help line, its answers (rows, or the
 * question's own controls from setupScreens.jsx) and its footer. The same
 * body runs in the flow and in the settings sheet; `doneLabel` names the
 * footer's button ("Continue" in the flow, "Save" in the sheet).
 *
 *   commit(s)   store the answer and move on
 */
export function QuestionBody({ id, settings, commit, doneLabel, showHelp = true }) {
  const { t } = useI18n();
  const q = QUESTIONS[id];
  const [picked, setPicked] = useState(() => (q?.read ? q.read(settings) : []));
  // A new question starts from its stored answer.
  useEffect(() => { setPicked(q?.read ? q.read(settings) : []); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- reset on a new question only, not on every save
  if (!q) return null;
  const Custom = CUSTOM[id] || (id === 'tell' ? TellBody : null);
  const label = doneLabel || t('pf.continue');
  return (
    <>
      {showHelp && q.helpKey && <p className="pf-help">{t(q.helpKey)}</p>}
      {Custom ? (
        <Custom id={id} settings={settings} commit={commit} doneLabel={doneLabel} />
      ) : (
        <>
          <ChoiceRows
            label={t(q.titleKey)}
            multi={!!q.multi}
            options={q.options.map((o) => ({ value: o.value, icon: o.icon, label: t(o.labelKey), sub: o.subKey ? t(o.subKey) : '' }))}
            value={picked}
            onPick={(v) => setPicked((cur) => toggleValue(q, cur, v))}
          />
          <div className="pf-foot">
            <Button
              variant="primary"
              block
              disabled={!picked.length}
              onClick={() => commit(answer(settings, id, q.write(settings, picked)))}
            >
              {label}
            </Button>
            {q.skippable && !doneLabel && (
              <Button variant="secondary" block onClick={() => commit(markAnswered(settings, id))}>{t('pf.skip')}</Button>
            )}
          </div>
        </>
      )}
    </>
  );
}

/**
 * "Tell Carta about your trip": one free field and a way to add a booking
 * (after Layla's prompt box). The words fill the questions they answer
 * (prefill.js); a booking is read by parse-booking and fills what it booked
 * and its dates. Both are optional: Skip asks every question in turn.
 */
function TellBody({ settings, commit }) {
  const { t, lang } = useI18n();
  const ctx = useFirstRun();
  const app = useSettings();
  const paywall = usePaywall();
  const [text, setText] = useState(settings.note || '');
  const [state, setState] = useState({ phase: 'idle' }); // idle | busy | done | error
  const [read, setRead] = useState(settings);
  const fileRef = useRef(null);
  const countries = useMemo(() => {
    const out = new Set();
    for (const d of Object.values(ctx?.data?.destinations || {})) if (d?.country) out.add(d.country);
    return [...out];
  }, [ctx?.data?.destinations]);

  const onFiles = async (fileList) => {
    if (!fileList?.length || state.phase === 'busy') return;
    // The pass is asked the moment a file lands, before a byte is read
    // (MagicImportZone's rule, T488-h).
    if (!paywall.require('import')) return;
    setState({ phase: 'busy' });
    const payload = await filesToPayload(fileList);
    if (payload.error) { setState({ phase: 'error', code: `file_${payload.error}`, name: payload.name || '' }); return; }
    const res = await requestBookingImport({ files: payload.files, text: '', context: {}, lang });
    if (!res.ok) { setState({ phase: 'error', code: res.code }); return; }
    const bookings = res.result?.bookings || [];
    const s = fromImports(read, bookings);
    setRead(bookings.length ? markAnswered(s, 'booked') : s);
    setState({ phase: 'done', n: bookings.length });
  };

  const go = () => {
    let s = { ...read, note: text.trim() };
    const { patch, answered: ids, countries: named } = prefillFromText(text, { countries });
    // The words never overwrite an answer already given on a screen.
    const FIELD = { who: 'party', when: 'when', priority: 'priority', booked: 'booked' };
    for (const id of ids) if (read.answered.includes(id)) delete patch[FIELD[id]];
    s = normalizeSettings({ ...s, ...patch, guide: { ...s.guide, ...(patch.guide || {}) } });
    for (const id of ids) s = markAnswered(s, id);
    // T676: the countries the words name are the ones picked on Where (up to
    // three, the compare limit), unless the engine already holds a choice.
    if (named.length && !(plannerStore.getState().wizard?.countries || []).length) {
      plannerStore.setWizard({ countries: named.slice(0, 3) });
    }
    // What the words (or a booking) answered moves Explore's prices too, as
    // the Who and When screens do when they are asked.
    if (patch.party) syncParty(app, s.party);
    if (patch.when || read !== settings) syncWhen(app, s.when);
    commit(markAnswered(s, 'tell'));
  };

  const errorText = (code, name) => {
    if (code === 'file_type') return t('extras.importBadType', { name });
    if (code === 'file_size' || code === 'file_total') return t('extras.importTooBig', { name: name || '' });
    if (code === 'auth') return t('extras.importSignIn');
    if (code === 'nothing_found' || code === 'nothing_to_parse') return t('extras.importNothing');
    return t('extras.importError');
  };

  return (
    <>
      <div className="pf-prompt">
        <label className="sr-only" htmlFor="pf-tell">{t('pf.tell.label')}</label>
        <textarea
          id="pf-tell"
          className="pf-prompt-field"
          rows={4}
          value={text}
          maxLength={600}
          placeholder={t('pf.tell.placeholder')}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="pf-prompt-row">
          <Button
            variant="secondary"
            size="sm"
            iconStart={<UploadIcon size={16} />}
            loading={state.phase === 'busy'}
            onClick={() => fileRef.current?.click()}
          >
            {t('pf.tell.attach')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={IMPORT_ACCEPT}
            multiple
            hidden
            onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
      </div>
      <p className="pf-note" role="status">
        {state.phase === 'busy' && t('pf.tell.reading')}
        {state.phase === 'done' && (state.n ? t('pf.tell.read', { n: state.n }) : t('extras.importNothing'))}
        {state.phase === 'error' && errorText(state.code, state.name)}
      </p>
      <div className="pf-foot">
        <Button variant="primary" block onClick={go}>{text.trim() || state.phase === 'done' ? t('pf.continue') : t('pf.tell.skip')}</Button>
      </div>
    </>
  );
}
