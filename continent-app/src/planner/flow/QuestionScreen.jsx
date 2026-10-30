import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { usePaywall } from '../../hooks/usePaywall.jsx';
import { filesToPayload, requestBookingImport, IMPORT_ACCEPT } from '../bookingImport.js';
import { Button, Chip, ChoiceRows } from '../../components/ui/index.js';
import { PlusIcon, UploadIcon } from '../../components/Icons.jsx';
import { QUESTIONS, toggleValue } from './questions.js';
import { answer, markAnswered, normalizeSettings, fromImports } from './tripSettings.js';
import { parseTrip, placeCountries, tripVocab } from '../../lib/plan/parseTrip.js';
import { loadSearchIndex } from '../../lib/searchIndex.js';
import { loadAskLexicon } from '../../lib/ask/data.js';
import { formatMoney } from '../../lib/money.js';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { tellChips, tellSettings } from './tellChips.js';
import { useBcp47, useMonths } from './flowHooks.js';
import { syncParty, syncWhen } from './appSync.js';
import { useSettings } from '../../components/SettingsLine.jsx';
import { plannerStore } from '../plannerStore.js';
import {
  WhoScreen, SleepScreen, StayScreen, WhenScreen, FromScreen, WayScreen, AirportsScreen, LikesScreen, BudgetScreen, PickScreen, PersonaScreen,
  NowWhereScreen, NowUntilScreen,
} from './setupScreens.jsx';

/** How long after the last key the words are read again. */
const PARSE_DELAY_MS = 250;

/** The questions with their own controls (setupScreens.jsx). */
const CUSTOM = {
  who: WhoScreen, sleep: SleepScreen, stay: StayScreen, when: WhenScreen, from: FromScreen, way: WayScreen, airports: AirportsScreen,
  'g:persona': PersonaScreen, 'g:likes': LikesScreen, 'g:budget': BudgetScreen,
  'g:pick': PickScreen,
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
      {/* T900 (owner, plan days board 2026-10-30): no help line under a
          question; the question and its answers say it. A question may still
          carry helpKey for a screen that wants one. */}
      {showHelp && q.helpKey && <p className="pf-help">{t(q.helpKey)}</p>}
      {Custom ? (
        <Custom id={id} settings={settings} commit={commit} doneLabel={doneLabel} />
      ) : (
        <>
          <ChoiceRows
            label={t(q.titleKey)}
            multi={!!q.multi}
            options={q.options.filter((o) => !q.offered || q.offered(settings, o.value)).map((o) => ({ value: o.value, icon: o.icon, label: t(o.labelKey), sub: o.subKey ? t(o.subKey) : '' }))}
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
 * (after Layla's prompt box). T858: the words are read as they are typed
 * (lib/plan/parseTrip.js, a beat after the last key) and shown under the
 * field as chips, every answer a selected chip and every setup question
 * still open a dashed one; a tap opens that answer in a popover to change
 * it. A booking is read by parse-booking and fills what it booked and its
 * dates. Continue asks only the questions still open.
 */
function TellBody({ settings, commit }) {
  const { t, lang } = useI18n();
  const ctx = useFirstRun();
  const app = useSettings();
  const paywall = usePaywall();
  const months = useMonths();
  const bcp47 = useBcp47();
  const [text, setText] = useState(settings.note || '');
  const [state, setState] = useState({ phase: 'idle' }); // idle | busy | done | error
  const [read, setRead] = useState(settings);
  // What a popover saved, by question id: the traveller's own, kept over the words.
  const [overrides, setOverrides] = useState({});
  const [open, setOpen] = useState('');
  // The body the popover shows: the question itself, or (T862, row T858-b)
  // the stay types alone for the stay chip, which still answers Where to sleep.
  const [popBody, setPopBody] = useState('');
  // The chip a popover hangs from on a pointer screen.
  const anchorRef = useRef(null);
  const fileRef = useRef(null);

  // The catalogue's vocabulary: towns and countries at once, the search
  // index's aliases ("Roma") and the lexicon's exonyms when they arrive.
  const destinations = ctx?.data?.destinations;
  const origins = ctx?.data?.meta?.origins;
  const [extra, setExtra] = useState({ index: null, lexicon: null });
  useEffect(() => {
    let live = true;
    Promise.all([loadSearchIndex(), loadAskLexicon()]).then(([index, lexicon]) => {
      if (live) setExtra({ index: index || null, lexicon: lexicon || null });
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  const vocab = useMemo(
    () => (destinations ? tripVocab({ destinations, lang, index: extra.index, lexicon: extra.lexicon }) : null),
    [destinations, lang, extra],
  );
  const parseCtx = useMemo(() => ({ vocab, lang, destinations, origins }), [vocab, lang, destinations, origins]);
  const [parsed, setParsed] = useState(() => parseTrip(settings.note || '', parseCtx));
  // Read again a beat after the last key, and when the vocabulary grows.
  useEffect(() => {
    const id = setTimeout(() => setParsed(parseTrip(text, parseCtx)), PARSE_DELAY_MS);
    return () => clearTimeout(id);
  }, [text, parseCtx]);

  const now = useMemo(() => tellSettings(read, parsed, overrides), [read, parsed, overrides]);
  const dayFmt = useMemo(() => new Intl.DateTimeFormat(bcp47, { day: 'numeric', month: 'short' }), [bcp47]);
  const stayTier = ctx?.choices?.stay_tier || 'home';
  const chips = useMemo(() => tellChips(now.settings, parsed, {
    t,
    monthName: (m) => months.find((x) => x.m === m)?.label || '',
    day: (iso) => dayFmt.format(new Date(`${iso}T12:00:00`)),
    money: (eur) => formatMoney(eur),
    stayTier,
    choices: now.choices,
    airports: app?.airportHours ? app.airports : null,
  }), [now, parsed, t, months, dayFmt, stayTier, app?.airportHours, app?.airports]);

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

  /** The words' stay and way, written app-wide (they are the app's own choices). */
  const writeChoices = (choices) => {
    if (!ctx?.setChoices || !Object.keys(choices).length) return;
    ctx.setChoices((prev) => ({ ...prev, ...choices }));
  };

  const openChip = (screen, el, key = '') => {
    anchorRef.current = el;
    // The Lifestyle and the way read the app's choices: let them show what the words said.
    if (screen === 'sleep' || screen === 'way') writeChoices(now.choices);
    setPopBody(key === 'stay' ? 'stay' : screen);
    setOpen(screen);
  };
  const savePopover = (screen, next) => {
    const s = normalizeSettings(next);
    setOverrides((cur) => ({ ...cur, [screen]: s }));
    if (screen === 'who') syncParty(app, s.party);
    if (screen === 'when') syncWhen(app, s.when);
    setOpen('');
  };

  const go = () => {
    const words = text.trim();
    // Tell's own answer is the words (T857): the sources then tell a later
    // visit which answers the words gave.
    const s = markAnswered(normalizeSettings({ ...now.settings, note: words }), 'tell', words ? 'words' : 'screen');
    writeChoices(now.choices);
    // T676, T859: the countries the words name are the ones picked on Where
    // (up to three, the compare limit); words typed again replace them.
    const names = placeCountries(s.places);
    if (names.length && (s.sources?.places === 'words' || overrides.places)) plannerStore.setWizard({ countries: names.slice(0, 3) });
    else if (!names.length && settings.sources?.places === 'words') plannerStore.setWizard({ countries: [] });
    // What the words (or a booking) answered moves Explore's prices too, as
    // the Who and When screens do when they are asked.
    if (now.words.includes('who')) syncParty(app, s.party);
    if (now.words.includes('when') || read !== settings) syncWhen(app, s.when);
    commit(s);
  };

  const errorText = (code, name) => {
    if (code === 'file_type') return t('extras.importBadType', { name });
    if (code === 'file_size' || code === 'file_total') return t('extras.importTooBig', { name: name || '' });
    if (code === 'auth') return t('extras.importSignIn');
    if (code === 'nothing_found' || code === 'nothing_to_parse') return t('extras.importNothing');
    return t('extras.importError');
  };

  const anchor = open ? anchorRef : null;
  const q = open && open !== 'places' ? QUESTIONS[popBody || open] : null;

  return (
    <>
      <div className="pf-prompt">
        <label className="sr-only" htmlFor="pf-tell">{t('pf.tell.label')}</label>
        <textarea
          id="pf-tell"
          className="pf-prompt-field"
          rows={3}
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
      <div className="pf-read">
        <p className="pf-label" id="pf-read-label">{t('pf.tell.understood')}</p>
        <ul className="pf-read-chips" aria-labelledby="pf-read-label">
          {chips.map((c) => (
            <li key={c.key}>
              <Chip
                kind="filter"
                selected={!c.missing}
                aria-pressed={undefined}
                aria-haspopup="dialog"
                aria-expanded={open === c.screen}
                className={c.missing ? 'pf-read-chip is-missing' : 'pf-read-chip'}
                icon={c.missing ? <PlusIcon size={14} /> : null}
                onClick={(e) => openChip(c.screen, e.currentTarget, c.key)}
              >
                {c.text}
              </Chip>
            </li>
          ))}
        </ul>
      </div>
      <p className="pf-note" role="status">
        {state.phase === 'busy' && t('pf.tell.reading')}
        {state.phase === 'done' && (state.n ? t('pf.tell.read', { n: state.n }) : t('extras.importNothing'))}
        {state.phase === 'error' && errorText(state.code, state.name)}
      </p>
      <div className="pf-foot">
        <Button variant="primary" block onClick={go}>{text.trim() || state.phase === 'done' ? t('pf.continue') : t('pf.tell.skip')}</Button>
      </div>
      {open && (
        <SheetShell
          title={open === 'places' ? t('pf.places.title') : t(q?.titleKey || 'pf.q.tell')}
          onClose={() => setOpen('')}
          anchorRef={anchor}
          width={440}
          className="pf-settings pf-read-pop"
        >
          <div className="pf-set-edit">
            {open === 'places' ? (
              <PlacesBody places={now.settings.places} onSave={(places) => savePopover('places', { ...now.settings, places })} />
            ) : (
              <QuestionBody
                id={popBody || open}
                settings={now.settings}
                doneLabel={t('pf.set.save')}
                commit={(next) => savePopover(open, next)}
              />
            )}
          </div>
        </SheetShell>
      )}
    </>
  );
}

/**
 * The places the words named (T858): each one a filter chip, on while it
 * stays in the trip; Save keeps the ones left on. With none left, Help me
 * choose asks where again.
 */
function PlacesBody({ places, onSave }) {
  const { t } = useI18n();
  const key = (p) => `${p.kind}:${p.id}`;
  const [on, setOn] = useState(() => new Set(places.map(key)));
  const toggle = (k) => setOn((cur) => {
    const next = new Set(cur);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  return (
    <>
      <div className="pf-chips" role="group" aria-label={t('pf.places.title')}>
        {places.map((p) => (
          <Chip key={key(p)} kind="filter" selected={on.has(key(p))} onClick={() => toggle(key(p))}>{p.name}</Chip>
        ))}
      </div>
      <div className="pf-foot">
        <Button variant="primary" block onClick={() => onSave(places.filter((p) => on.has(key(p))))}>{t('pf.set.save')}</Button>
      </div>
    </>
  );
}
