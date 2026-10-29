import React, { useMemo, useState } from 'react';
import { useBcp47, useMonths, whenText } from './flowHooks.js';
import { formatMoney } from '../../lib/money.js';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { normalizeTaste } from '../../lib/taste.js';
import { likePhotos } from './guidePhotos.js';
import { syncParty, syncWhen } from './appSync.js';
import { QUESTIONS, toggleValue } from './questions.js';
import { useI18n } from '../../i18n/index.jsx';
import { useSettings } from '../../components/SettingsLine.jsx';
import { FromPanel, fromPoint } from '../../components/FromPicker.jsx';
import { DateField } from '../../components/DateField.jsx';
import { Stepper } from '../../components/FilterControls.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import {
  Button, Chip, ChipGroup, ChoiceRows, Field, IconButton, Segmented, Switch,
} from '../../components/ui/index.js';
import {
  ArrowLeftIcon, CalendarIcon, CameraIcon, CheckIcon, ChevronRightIcon, CloseIcon, EyeIcon, FriendsIcon, PencilIcon, PlusIcon,
} from '../../components/Icons.jsx';
import * as AllIcons from '../../components/Icons.jsx';
import SLOTS from '../../../config/slots.json' with { type: 'json' };
import { LifestyleStep } from './LifestyleStep.jsx';
import { VisibilityChoice } from './VisibilityChoice.jsx';
import { PartyEditor } from '../PartyEditor.jsx';
import { answer, markAnswered, normalizeSettings, withPartyKind, PARTY_KINDS } from './tripSettings.js';
import { MAX_TRIP_NIGHTS, addDaysUTC, nightsBetween, windowFromStart } from '../../lib/tripDates.js';

/*
 * The setup questions that need their own controls (T655), and the Create
 * trip screen. Each question writes the trip settings AND the app-wide value
 * it shares with Explore (people, dates, From, the Lifestyle), so the price a
 * place shows on Explore and in the planner is always the same figure.
 *
 * Each question gets { settings, commit }: commit(nextSettings) stores the
 * answer and moves on. QuestionScreen.jsx maps the question ids to them.
 */

// T815: the trip's date rules live in lib/tripDates.js, shared with the
// wizard's When and the trip settings (the local-noon addDaysISO here was a
// day early east of UTC+12, and the wizard allowed 21 nights to this 60).
const MAX_NIGHTS = MAX_TRIP_NIGHTS;
const addDaysISO = addDaysUTC;
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Foot({ onContinue, disabled = false, label }) {
  const { t } = useI18n();
  return (
    <div className="pf-foot">
      <Button variant="primary" block disabled={disabled} onClick={onContinue}>{label || t('pf.continue')}</Button>
    </div>
  );
}

// ---- Who is going ----

const KIND_ICONS = { solo: 'PersonIcon', couple: 'HeartIcon', friends: 'FriendsIcon', family: 'FamilyIcon', group: 'FriendsIcon' };

/** The Who rows' options (T764: shared with the taste profile's first question). */
export function partyKindOptions(t) {
  return Object.keys(PARTY_KINDS).map((k) => ({ value: k, icon: KIND_ICONS[k], label: t(`pf.who.${k}`) }));
}

export function WhoScreen({ settings, commit, doneLabel }) {
  const { t } = useI18n();
  const app = useSettings();
  const [s, setS] = useState(settings);
  const p = s.party;
  const setParty = (patch) => setS((cur) => normalizeSettings({ ...cur, party: { ...cur.party, ...patch } }));
  const go = () => {
    syncParty(app, p);
    commit(answer(s, 'who', {}));
  };
  return (
    <>
      <ChoiceRows
        label={t('pf.q.who')}
        options={partyKindOptions(t)}
        value={[p.kind]}
        onPick={(k) => setS((cur) => withPartyKind(cur, k))}
      />
      <div className="pf-group">
        <PartyEditor
          value={{ adults: p.adults, children: p.kids, babies: p.babies }}
          onChange={({ adults, children, babies }) => setParty({
            adults, kids: children, babies,
            kidAges: [...p.kidAges, ...Array(Math.max(0, children - p.kidAges.length)).fill(7)].slice(0, children),
          })}
        />
        {p.kids > 0 && (
          <div className="pf-ages">
            <p className="pf-label">{t('pf.who.ages')}</p>
            <div className="pf-ages-row">
              {Array.from({ length: p.kids }, (_, i) => (
                <Field
                  key={i}
                  as="select"
                  label={t('pf.who.ageOf', { n: i + 1 })}
                  value={p.kidAges[i] ?? 7}
                  onChange={(e) => {
                    const ages = [...p.kidAges];
                    ages[i] = Number(e.target.value);
                    setParty({ kidAges: ages });
                  }}
                >
                  {Array.from({ length: 9 }, (_, k) => k + 3).map((a) => (
                    <option key={a} value={a}>{t('pf.who.age', { n: a })}</option>
                  ))}
                </Field>
              ))}
            </div>
          </div>
        )}
        <Switch
          label={t('pf.who.slow')}
          hint={t('pf.who.slowHint')}
          checked={p.slowWalkers}
          onChange={(v) => setParty({ slowWalkers: v })}
        />
      </div>
      <Foot onContinue={go} label={doneLabel} />
    </>
  );
}

// ---- Where you sleep and how you spend ----

/** The whole Lifestyle (T750: where you sleep, how you spend, getting there
 *  and the counts). They are app-wide choices, so there is nothing to keep
 *  here but "answered". */
export function SleepScreen({ settings, commit, doneLabel }) {
  return (
    <>
      <LifestyleStep />
      <Foot onContinue={() => commit(markAnswered(settings, 'sleep'))} label={doneLabel} />
    </>
  );
}

// ---- When ----

export function WhenScreen({ settings, commit, doneLabel }) {
  const { t } = useI18n();
  const app = useSettings();
  const months = useMonths();
  const bcp47 = useBcp47();
  const [w, setW] = useState(settings.when);
  const [pickEnd, setPickEnd] = useState('start');
  const set = (patch) => setW((cur) => ({ ...cur, ...patch }));
  const min = app?.dateBounds?.min || todayISO();
  const max = app?.dateBounds?.max;
  const short = (iso) => (iso ? new Intl.DateTimeFormat(bcp47, { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`)) : t('pf.when.set'));

  const pickDate = (iso) => {
    if (pickEnd === 'start') {
      // The end keeps the trip's length and stays inside the last day that
      // may be planned (T815: a start near the end of the window gave an end
      // past it).
      set(windowFromStart(iso, nightsBetween(w.start, w.end) || w.nights || 7, max));
      setPickEnd('end');
    } else if (w.start && iso > w.start) {
      set({ end: iso, nights: nightsBetween(w.start, iso) });
    }
  };
  const ready = w.mode !== 'exact' || (w.start && w.end);
  const go = () => {
    const when = { ...w, mode: w.mode === 'months' && !w.months.length ? 'any' : w.mode };
    // The app-wide When follows, so Explore prices the same days.
    syncWhen(app, when);
    commit(answer(settings, 'when', { when }));
  };

  return (
    <>
      <ChoiceRows
        label={t('pf.q.when')}
        options={[
          { value: 'exact', icon: 'CalendarIcon', label: t('pf.when.exact') },
          { value: 'months', icon: 'SunIcon', label: t('pf.when.months') },
          { value: 'any', icon: 'PiggyIcon', label: t('pf.when.any'), sub: t('pf.when.anySub') },
          { value: 'unsure', icon: 'QuestionIcon', label: t('pf.when.unsure') },
        ]}
        value={[w.mode]}
        onPick={(mode) => set({ mode })}
      />
      {w.mode === 'exact' && (
        <div className="pf-group">
          <Segmented
            block
            size="sm"
            label={t('pf.when.exact')}
            value={pickEnd}
            onChange={setPickEnd}
            options={[
              { value: 'start', label: t('pf.when.startOn', { date: short(w.start) }) },
              { value: 'end', label: t('pf.when.endOn', { date: short(w.end) }) },
            ]}
          />
          <DateField
            inline
            value={pickEnd === 'start' ? w.start : w.end}
            rangeStart={w.start || null}
            rangeEnd={w.end || null}
            min={pickEnd === 'end' && w.start ? addDaysISO(w.start, 1) : min}
            max={max}
            onChange={pickDate}
          />
        </div>
      )}
      {w.mode === 'months' && (
        <div className="pf-group">
          <p className="pf-label" id="pf-months-label">{t('pf.when.monthsLabel')}</p>
          <div className="pf-chips" role="group" aria-labelledby="pf-months-label">
            {months.map(({ m, label }) => (
              <Chip
                key={m}
                kind="filter"
                selected={w.months.includes(m)}
                onClick={() => set({ months: w.months.includes(m) ? w.months.filter((x) => x !== m) : [...w.months, m] })}
              >
                {label}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {w.mode !== 'exact' && (
        <div className="pf-group pf-line">
          <span className="pf-line-label">{t('pf.when.nights')}</span>
          <Stepper
            value={w.nights}
            min={1}
            max={MAX_NIGHTS}
            onChange={(n) => set({ nights: n })}
            ariaLabel={t('pf.when.nightsAria', { n: w.nights })}
            decLabel={t('trip.fewer')}
            incLabel={t('trip.more')}
          />
        </div>
      )}
      <Foot onContinue={go} disabled={!ready} label={doneLabel} />
    </>
  );
}

// ---- Where from ----

export function FromScreen({ settings, commit, doneLabel }) {
  const app = useSettings();
  const [picked, setPicked] = useState(settings.from);
  const current = picked ? { name: picked.name, lat: picked.lat, lon: picked.lng } : fromPoint(app);
  const go = () => {
    const pt = picked || (current ? { name: current.name, lat: current.lat, lng: current.lon, countryCode: '' } : null);
    if (picked) app?.setFrom?.({ name: picked.name, lat: picked.lat, lon: picked.lng });
    commit(answer(settings, 'from', { from: pt }));
  };
  return (
    <>
      <div className="pf-from">
        <FromPanel
          data={app?.data}
          current={current}
          autoFocus={false}
          onPick={(pt) => setPicked({ name: pt.name, lat: pt.lat, lng: pt.lon, countryCode: pt.iso2 || '' })}
        />
      </div>
      <Foot onContinue={go} disabled={!current} label={doneLabel} />
    </>
  );
}

// ---- On a trip now (T675): where you are, until when ----

/** The town the traveller is in, by the same search as Where from. */
export function NowWhereScreen({ settings, commit, doneLabel }) {
  const app = useSettings();
  const [picked, setPicked] = useState(settings.now);
  const current = picked ? { name: picked.name, lat: picked.lat, lon: picked.lng } : null;
  return (
    <>
      <div className="pf-from">
        <FromPanel
          data={app?.data}
          current={current}
          autoFocus={false}
          onPick={(pt) => setPicked({ name: pt.name, lat: pt.lat, lng: pt.lon, countryCode: pt.iso2 || '' })}
        />
      </div>
      <Foot onContinue={() => commit(answer(settings, 'nowWhere', { now: picked }))} disabled={!picked} label={doneLabel} />
    </>
  );
}

/** The day the traveller goes home; the trip runs from today to it. */
export function NowUntilScreen({ settings, commit, doneLabel }) {
  const { t } = useI18n();
  const app = useSettings();
  const today = todayISO();
  const [end, setEnd] = useState(settings.when.end > today ? settings.when.end : '');
  const nights = nightsBetween(today, end);
  const go = () => {
    const when = { mode: 'exact', start: today, end, months: [], nights };
    syncWhen(app, when);
    commit(markAnswered(answer(settings, 'nowUntil', { when }), 'when'));
  };
  return (
    <>
      <div className="pf-group">
        <DateField
          inline
          value={end}
          rangeStart={today}
          rangeEnd={end || null}
          min={addDaysISO(today, 1)}
          max={app?.dateBounds?.max}
          onChange={setEnd}
        />
      </div>
      {nights > 0 && (
        <div className="pf-group pf-line">
          <span className="pf-line-label">{t('pf.when.nights')}</span>
          <strong>{nights}</strong>
        </div>
      )}
      <Foot onContinue={go} disabled={!nights} label={doneLabel} />
    </>
  );
}

// ---- What you're up for: photo tiles (after GetYourGuide's rails) ----

/** Up to three kinds of trip, each a real catalogue photograph with its name
 *  under it (never on it). Selected is the brown edge and a tick. T764: the
 *  tiles are LikeTiles, shared with the taste profile's "What do you go for". */
export function LikeTiles({ picked, onToggle }) {
  const { t } = useI18n();
  const ctx = useFirstRun();
  const q = QUESTIONS['g:likes'];
  const keys = q.options.map((o) => o.value);
  const photos = useMemo(() => likePhotos(ctx?.data?.destinations, keys), [ctx?.data?.destinations]); // eslint-disable-line react-hooks/exhaustive-deps -- keys are the fixed option list
  // The layer photographs carry an author and a licence; they are credited
  // in one line under the grid (carta-design: a credit is text, under the photo).
  const credits = Object.values(photos).filter((p) => p.by).map((p) => `${p.city}, ${p.by}, ${p.lic}`).join('; ');
  return (
    <>
      <div className="pf-likes" role="group" aria-label={t(q.titleKey)}>
        {q.options.map((o) => {
          const on = picked.includes(o.value);
          const ph = photos[o.value];
          return (
            <Button
              key={o.value}
              variant="quiet"
              className={`pf-like${on ? ' is-on' : ''}`}
              aria-pressed={on}
              data-like={o.value}
              onClick={() => onToggle(o.value)}
            >
              <span className="pf-like-media">
                <HeroImage url={ph?.url} city={ph?.city || t(o.labelKey)} iso2={ph?.iso2} className="pf-like-img" ratio={[1, 1]} maxWidth={320} />
                {on && <span className="pf-like-tick" aria-hidden="true"><CheckIcon size={14} /></span>}
              </span>
              <span className="pf-like-name">{t(o.labelKey)}</span>
            </Button>
          );
        })}
      </div>
      {credits && <p className="pf-credit">{t('pf.likes.credit', { list: credits })}</p>}
    </>
  );
}

export function LikesScreen({ settings, commit, doneLabel }) {
  const q = QUESTIONS['g:likes'];
  const ctx = useFirstRun();
  // T766: a trip with no likes yet starts from the traveller's travel style.
  const [picked, setPicked] = useState(() => (settings.guide.likes.length
    ? settings.guide.likes : normalizeTaste(ctx?.choices?.taste).likes));
  return (
    <>
      <LikeTiles picked={picked} onToggle={(v) => setPicked((cur) => toggleValue(q, cur, v))} />
      <Foot
        disabled={!picked.length}
        label={doneLabel}
        onContinue={() => commit(answer(settings, 'g:likes', { guide: { ...settings.guide, likes: picked } }))}
      />
    </>
  );
}

// ---- Budget ----

// The quick amounts under the field (T753: the whole trip only).
const TRIP_STEPS = [500, 800, 1200, 1800, 2500, 4000];
const BUDGET_MAX = 100000;

/** An optional budget, a person a day or for the whole trip. Places that fit
 *  it are marked, and the trip's cost card says how far under or over it is. */
/**
 * The budget (T753): one figure for the whole trip, a person, typed or taken
 * from six quick amounts. A day budget is no longer asked (an older one
 * opens empty); the whole trip is the figure people actually hold.
 */
export function BudgetScreen({ settings, commit, doneLabel }) {
  const { t } = useI18n();
  const bcp47 = useBcp47();
  const start = settings.guide.budget;
  const [eur, setEur] = useState(start.kind === 'total' ? start.eur : 0);
  const grouped = (n) => n.toLocaleString(bcp47);
  // The currency sign as the one money formatter writes it, not a literal.
  const sign = formatMoney(0).replace(/[\d\s.,]/g, '');
  const save = (n) => commit(answer(settings, 'g:budget', { guide: { ...settings.guide, budget: { kind: 'total', eur: n } } }));
  const onType = (e) => {
    const n = Number(String(e.target.value).replace(/\D/g, '')) || 0;
    setEur(Math.min(BUDGET_MAX, n));
  };
  return (
    <>
      <div className="pf-budget">
        <label className="pf-budget-label" htmlFor="pf-budget-eur">{t('pf.budget.label')}</label>
        <div className="pf-budget-field">
          <span className="pf-budget-cur" aria-hidden="true">{sign}</span>
          <input
            id="pf-budget-eur"
            className="pf-budget-input"
            inputMode="numeric"
            autoComplete="off"
            placeholder={grouped(1500)}
            value={eur ? grouped(eur) : ''}
            onChange={onType}
            onKeyDown={(e) => { if (e.key === 'Enter' && eur) save(eur); }}
          />
        </div>
        <ChipGroup label={t('pf.budget.quick')} className="pf-budget-steps">
          {TRIP_STEPS.map((n) => (
            <Chip key={n} kind="choice" selected={eur === n} onClick={() => setEur(n)}>
              {formatMoney(n)}
            </Chip>
          ))}
        </ChipGroup>
      </div>
      <div className="pf-foot">
        <Button variant="primary" block disabled={!eur} onClick={() => save(eur)}>{doneLabel || t('pf.continue')}</Button>
        <Button variant="quiet" block onClick={() => save(0)}>{t('pf.budget.none')}</Button>
      </div>
    </>
  );
}

// ---- What should Carta pick (question 7, T796) ----

/** A row the traveller cannot change: where to go (always Carta's) or a
 *  price line that is not measured yet. Drawn as a ChoiceRows row. */
function FixedPickRow({ icon, label, sub, tag, on }) {
  const Glyph = icon ? AllIcons[icon] : null;
  return (
    <div className={`ui-crow pf-pick-fixed${on ? ' is-on' : ''}${sub ? ' has-sub' : ''}`} role="checkbox" aria-checked={on} aria-disabled="true">
      <span className="ui-crow-mark is-box" aria-hidden="true" />
      {Glyph && <span className="ui-crow-icon" aria-hidden="true"><Glyph size={20} /></span>}
      <span className="ui-crow-text">
        <span className="ui-crow-label">{label}</span>
        {sub && <span className="ui-crow-sub">{sub}</span>}
      </span>
      <Chip kind="status" className="pf-pick-tag">{tag}</Chip>
    </div>
  );
}

/**
 * Which price lines Carta picks (T796). Every trip is priced in full either
 * way: a line left to the traveller still counts at its typical price. The
 * rows are config/slots.json's pickable slots; a slot not measured yet shows
 * "Not yet" and cannot be ticked, and where to go is always Carta's.
 */
export function PickScreen({ settings, commit, doneLabel }) {
  const { t } = useI18n();
  const rows = SLOTS.slots.filter((r) => r.pickable).sort((a, b) => a.order - b.order);
  const live = rows.filter((r) => r.status === 'live');
  const [pick, setPick] = useState(settings.guide.pick);
  const toggle = (id) => setPick((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const save = () => commit(answer(settings, 'g:pick', { guide: { ...settings.guide, pick } }));
  return (
    <>
      <div className="pf-pick">
        <FixedPickRow icon="MapPinIcon" label={t('tf.slot.where')} sub={t('tf.slot.whereSub')} tag={t('tf.pick.always')} on />
        <ChoiceRows
          label={t('pf.q.pick')}
          multi
          options={live.map((r) => ({ value: r.id, icon: r.icon, label: t(r.labelKey), sub: r.subKey ? t(r.subKey) : '' }))}
          value={pick}
          onPick={toggle}
        />
        {rows.filter((r) => r.status === 'notYet').map((r) => (
          <FixedPickRow key={r.id} icon={r.icon} label={t(r.labelKey)} sub={r.subKey ? t(r.subKey) : ''} tag={t('tf.pick.notYet')} on={false} />
        ))}
      </div>
      <Foot onContinue={save} label={doneLabel} />
    </>
  );
}

// ---- Create trip (after the Polarsteps "new trip" screen) ----

/** Twelve well rated places with a photograph, the cover choices. */
function useCoverChoices(data) {
  return useMemo(() => {
    const seen = new Set();
    const rows = Object.values(data?.destinations || {})
      .filter((d) => d?.image?.url && d.city && (d.rating?.score || 0) >= 8.5)
      .sort((a, b) => (b.rating?.fame || 0) - (a.rating?.fame || 0));
    const out = [];
    for (const d of rows) {
      if (seen.has(d.image.url) || seen.has(d.city)) continue;
      seen.add(d.image.url);
      seen.add(d.city);
      out.push({ url: d.image.url, city: d.city, iso2: d.iso2 });
      if (out.length >= 12) break;
    }
    return out;
  }, [data?.destinations]);
}

export function CreateScreen({ settings, save, onBack, onDone, onEditWhen }) {
  const { t } = useI18n();
  const app = useSettings();
  const months = useMonths();
  const bcp47 = useBcp47();
  const covers = useCoverChoices(app?.data);
  const [name, setName] = useState(settings.trip.name);
  const [cover, setCover] = useState(settings.trip.cover);
  const [coversOpen, setCoversOpen] = useState(false);
  const [visibility, setVisibility] = useState(settings.trip.visibility);
  const [buddies, setBuddies] = useState(settings.trip.buddies);
  const [buddiesOpen, setBuddiesOpen] = useState(false);
  const [buddy, setBuddy] = useState('');
  const coverRow = covers.find((c) => c.url === cover);
  const when = whenText(t, settings.when, months, bcp47);

  const create = () => {
    const trip = {
      ...settings.trip,
      name: name.trim() || t('pf.create.defaultName'),
      cover,
      visibility,
      buddies,
      created: settings.trip.created || Date.now(),
    };
    save(normalizeSettings({ ...settings, trip }));
    onDone();
  };
  const addBuddy = () => {
    const n = buddy.trim();
    if (!n) return;
    setBuddies((cur) => [...cur, n].slice(0, 19));
    setBuddy('');
  };

  return (
    <div className="pf-create">
      <div className={`pf-create-head${coverRow ? ' has-photo' : ''}`}>
        {coverRow && <HeroImage url={coverRow.url} city={coverRow.city} iso2={coverRow.iso2} className="pf-create-photo" ratio={[16, 9]} maxWidth={720} />}
        <div className="pf-create-bar">
          <IconButton tone={coverRow ? 'photo' : 'surface'} label={t('pf.back')} onClick={onBack} className="pf-round"><ArrowLeftIcon size={18} /></IconButton>
          {!coverRow && <h2 className="pf-title pf-create-title" tabIndex={-1}>{t('pf.create.title')}</h2>}
          {coverRow ? (
            <IconButton tone="photo" label={t('pf.create.cover')} onClick={() => setCoversOpen((v) => !v)} className="pf-round pf-create-end" aria-expanded={coversOpen}>
              <CameraIcon size={18} />
            </IconButton>
          ) : <span className="pf-create-end" aria-hidden="true" />}
        </div>
        {!coverRow && (
          <Button variant="secondary" size="sm" className="pf-cover-pill" iconStart={<CameraIcon size={16} />} onClick={() => setCoversOpen((v) => !v)} aria-expanded={coversOpen}>
            {t('pf.create.cover')}
          </Button>
        )}
      </div>
      {coverRow && <h2 className="pf-title pf-create-title is-under" tabIndex={-1}>{t('pf.create.title')}</h2>}

      {coversOpen && (
        <div className="pf-covers" role="radiogroup" aria-label={t('pf.create.cover')}>
          {covers.map((c) => (
            <Button
              key={c.url}
              variant="quiet"
              className={`pf-cover${cover === c.url ? ' is-on' : ''}`}
              role="radio"
              aria-checked={cover === c.url}
              onClick={() => { setCover(c.url); setCoversOpen(false); }}
            >
              <HeroImage url={c.url} city={c.city} iso2={c.iso2} className="pf-cover-img" ratio={[1, 1]} maxWidth={240} />
              <span className="pf-cover-name">{c.city}</span>
            </Button>
          ))}
        </div>
      )}

      <div className="pf-card pf-dates">
        <p className="pf-dates-head"><CalendarIcon size={18} /> {t('pf.create.dates')}</p>
        <div className="pf-dates-row">
          <Button variant="quiet" className="pf-dates-cell" onClick={onEditWhen}>
            <span className="pf-dates-label">{t(settings.when.mode === 'exact' ? 'pf.when.start' : 'pf.when.when')}</span>
            <span className="pf-dates-value">{when.start || t('pf.when.set')}</span>
          </Button>
          <ChevronRightIcon size={18} className="pf-dates-arrow" />
          <Button variant="quiet" className="pf-dates-cell is-end" onClick={onEditWhen}>
            <span className="pf-dates-label">{t(settings.when.mode === 'exact' ? 'pf.when.end' : 'pf.when.length')}</span>
            <span className="pf-dates-value">{when.end || t('pf.when.optional')}</span>
          </Button>
        </div>
      </div>

      <div className="pf-card pf-field-row">
        <PencilIcon size={18} />
        <label className="sr-only" htmlFor="pf-trip-name">{t('pf.create.name')}</label>
        <input
          id="pf-trip-name"
          className="pf-input"
          value={name}
          maxLength={80}
          placeholder={t('pf.create.name')}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="pf-card">
        <Button
          variant="quiet"
          className="pf-link-row"
          iconStart={<FriendsIcon size={18} className="pf-ico" />}
          iconEnd={<ChevronRightIcon size={18} className="pf-ico" />}
          aria-expanded={buddiesOpen}
          onClick={() => setBuddiesOpen((v) => !v)}
        >
          <span className="pf-link-text">
            <span>{t('pf.create.buddies')}</span>
            {buddies.length > 0 && <span className="pf-link-sub">{buddies.join(', ')}</span>}
          </span>
        </Button>
        {buddiesOpen && (
          <div className="pf-buddies">
            {buddies.length > 0 && (
              <ul className="pf-buddy-list">
                {buddies.map((b, i) => (
                  <li key={`${b}-${i}`}>
                    <span>{b}</span>
                    <IconButton label={t('pf.create.removeBuddy', { name: b })} onClick={() => setBuddies((cur) => cur.filter((_, k) => k !== i))}>
                      <CloseIcon size={16} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
            <div className="pf-buddy-add">
              <Field
                label={t('pf.create.buddyName')}
                hideLabel
                value={buddy}
                maxLength={40}
                onChange={(e) => setBuddy(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBuddy(); } }}
              />
              <Button variant="secondary" iconStart={<PlusIcon size={16} />} onClick={addBuddy} disabled={!buddy.trim()}>{t('pf.create.addBuddy')}</Button>
            </div>
          </div>
        )}
      </div>

      <div className="pf-card pf-vis-card">
        <span className="pf-vis-head"><EyeIcon size={18} />{t('pf.create.visibility')}</span>
        <VisibilityChoice value={visibility} onChange={setVisibility} />
      </div>

      <div className="pf-foot">
        <Button variant="primary" block onClick={create}>{t('pf.create.go')}</Button>
      </div>
    </div>
  );
}

