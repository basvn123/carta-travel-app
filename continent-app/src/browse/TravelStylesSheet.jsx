import React, { useId, useMemo, useState } from 'react';
import { SheetShell } from './SheetShell.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { Button, Chip, ChipGroup, Segmented } from '../components/ui/index.js';
import { PartyEditor } from '../planner/PartyEditor.jsx';
import {
  CheckIcon, ChevronRightIcon, CopyIcon, FamilyIcon, FriendsIcon, HeartIcon, PersonIcon, PlusIcon, SparkIcon, TrashIcon,
} from '../components/Icons.jsx';
import { partyText } from '../lib/party.js';
import { formatMoney } from '../lib/money.js';
import { styleDayEur } from '../lib/styleCost.js';
import { matchProfile, PROFILE_LABEL_KEYS } from './LifestylePanel.jsx';
import { QUESTIONS } from '../planner/flow/questions.js';
import { TRAVEL_MODES } from '../lib/travelWay.js';
import {
  AVOID, MAX_STYLES, PACE, QUIET, SIZES, MORNINGS, PERSONAS, SHAPES, TEMPLATE_IDS, TEMPLATES, LIKES, AROUND, PRIORITIES,
  summaryParts,
} from '../lib/travelStyles.js';
import '../styles/79-travel-styles.css';

/** The glyph of a style, from who comes: it is how travellers name them. */
const WHO_ICONS = { solo: PersonIcon, couple: HeartIcon, friends: FriendsIcon, family: FamilyIcon, group: FriendsIcon };
// eslint-disable-next-line react-refresh/only-export-components -- small helper shared with the header door
export const styleIcon = (style) => WHO_ICONS[style?.who?.kind] || SparkIcon;

/** A style's name: the one the traveller typed, else its template's. */
// eslint-disable-next-line react-refresh/only-export-components -- small helper shared with the header door
export function styleName(t, style) {
  if (!style) return '';
  return style.name || (style.nameKey ? t(style.nameKey) : t('styles.mine'));
}

/** A style's one line: the head count, the bed, the trip shape. */
// eslint-disable-next-line react-refresh/only-export-components -- small helper shared with the planner
export function styleSummary(t, style) {
  return summaryParts(style).map((p) => (p.party ? partyText(t, p.party) : t(p.key))).filter(Boolean).join(', ');
}

/** The label of a planner option, read from the question it answers, so a
 *  style says each thing in the planner's own words. */
function optLabel(t, qid, value) {
  const o = QUESTIONS[qid]?.options?.find((x) => x.value === value);
  return o?.labelKey ? t(o.labelKey) : '';
}

/**
 * One card per style, the active one ticked: a radio group, so arrows move
 * between styles and a tap switches every price at once.
 */
export function StylePicker({ list, activeId, onPick, label, extra = null, compact = false, figures = null }) {
  const { t } = useI18n();
  const onKeyDown = (e) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const i = list.findIndex((s) => s.id === activeId);
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const next = list[(i + dir + list.length) % list.length];
    // The group itself, read now: React clears currentTarget after the event.
    const root = e.currentTarget;
    if (next) {
      onPick(next.id);
      requestAnimationFrame(() => root.querySelector(`[data-sid="${next.id}"]`)?.focus());
    }
  };
  // With no card matching (a trip whose style was deleted) the first card
  // takes the tab stop, so the group is never out of the keyboard's reach.
  const anyOn = list.some((s) => s.id === activeId);
  return (
    <div className={`tstyle-cards${compact ? ' is-compact' : ''}`} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {list.map((s) => {
        const on = s.id === activeId;
        const Ico = styleIcon(s);
        return (
          <Button
            key={s.id}
            variant="quiet"
            role="radio"
            aria-checked={on}
            tabIndex={on || (!anyOn && s === list[0]) ? 0 : -1}
            data-sid={s.id}
            className={`tstyle-card tone-${s.tone}${on ? ' is-on' : ''}`}
            onClick={() => onPick(s.id)}
          >
            <span className="tstyle-disc" aria-hidden="true">{on ? <CheckIcon size={18} /> : <Ico size={20} />}</span>
            <span className="tstyle-card-text">
              <span className="tstyle-card-name">{styleName(t, s)}</span>
              {!compact && <span className="tstyle-card-sum">{styleSummary(t, s)}</span>}
              {!compact && figures?.get(s.id) != null && (
                <span className="tstyle-card-fig">{t('styles.dayFig', { price: formatMoney(figures.get(s.id), { precision: 'whole' }) })}</span>
              )}
            </span>
          </Button>
        );
      })}
      {extra}
    </div>
  );
}

/** A group of choice chips for one answer (single or several). */
function ChoiceChips({ label, values, picked, onChange, multi = false, max = 99, labelOf }) {
  const set = new Set(picked);
  return (
    <ChipGroup label={label} className="tstyle-chips">
      {values.map((v) => {
        const on = set.has(v);
        const full = multi && !on && set.size >= max;
        return (
          <Chip
            key={v}
            selected={on}
            disabled={full}
            onClick={() => {
              if (!multi) { onChange(on ? [] : [v]); return; }
              onChange(on ? picked.filter((x) => x !== v) : [...picked, v]);
            }}
          >
            {labelOf(v)}
          </Chip>
        );
      })}
    </ChipGroup>
  );
}

function Field({ title, note = '', children }) {
  const id = useId();
  return (
    <section className="tstyle-field" aria-labelledby={id}>
      <h4 className="tstyle-field-title" id={id}>{title}</h4>
      {note && <p className="tstyle-field-note">{note}</p>}
      {children}
    </section>
  );
}

/**
 * Travel styles (owner, 2026-11-12): the traveller's named ways of
 * travelling, each one "how you stay" (every price follows it) and "how you
 * explore" (new trips start from it, the trips Carta suggests follow it).
 * Opened from the header on every tab. The bed and the table stay in the
 * one Lifestyle panel (carta-design "Lifestyle control: there is one"); this
 * sheet opens it rather than drawing a second one.
 */
export function TravelStylesSheet({ onClose, openLifestyle, initialHalf = 'stay' }) {
  const { t } = useI18n();
  const app = useSettings();
  const ts = app?.travelStyles;
  const [half, setHalf] = useState(initialHalf === 'explore' ? 'explore' : 'stay');
  const [adding, setAdding] = useState(!ts?.list?.length);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // What each style costs: a person's bed and food for a day at the middle
  // place (lib/styleCost.js), so a switch is made knowing its price. Keyed on
  // what prices a style, so editing a name or a like does not reprice.
  const destinations = app?.data?.destinations || null;
  const priceKey = (ts?.list || []).map((x) => JSON.stringify([x.id, x.who, x.stay, x.lifestyle])).join('|');
  const figures = useMemo(() => {
    const m = new Map();
    for (const x of ts?.list || []) m.set(x.id, styleDayEur(x, destinations));
    return m;
  }, [priceKey, destinations]); // eslint-disable-line react-hooks/exhaustive-deps -- priceKey stands for the list's priced parts
  if (!ts) return null;
  const s = ts.active;
  const full = ts.list.length >= MAX_STYLES;
  const anyFigure = [...figures.values()].some((v) => v != null);
  // With no styles left (the last one deleted) the templates show again.
  const showTemplates = adding || !ts.list.length;

  const newCard = !showTemplates && !full ? (
    <Button variant="quiet" className="tstyle-card is-new" onClick={() => setAdding(true)}>
      <span className="tstyle-disc" aria-hidden="true"><PlusIcon size={20} /></span>
      <span className="tstyle-card-text"><span className="tstyle-card-name">{t('styles.new')}</span></span>
    </Button>
  ) : null;

  const templates = (
    <div className="tstyle-new">
      <h3 className="tstyle-label">{ts.list.length ? t('styles.startFrom') : t('styles.firstTitle')}</h3>
      {!ts.list.length && <p className="tstyle-lead">{t('styles.firstLead')}</p>}
      <div className="tstyle-templates">
        {TEMPLATE_IDS.map((id) => {
          const tp = TEMPLATES[id];
          const Ico = WHO_ICONS[tp.who.kind] || SparkIcon;
          return (
            <Button key={id} variant="quiet" className={`tstyle-tpl tone-${tp.tone}`} onClick={() => { ts.create(id); setAdding(false); setHalf('stay'); }}>
              <span className="tstyle-disc" aria-hidden="true"><Ico size={18} /></span>
              <span>{t(tp.nameKey)}</span>
            </Button>
          );
        })}
        <Button variant="quiet" className="tstyle-tpl tone-mist" onClick={() => { ts.create(''); setAdding(false); }}>
          <span className="tstyle-disc" aria-hidden="true"><SparkIcon size={18} /></span>
          <span>{t('styles.fromNow')}</span>
        </Button>
      </div>
      {ts.list.length > 0 && (
        <Button variant="quiet" size="sm" onClick={() => setAdding(false)}>{t('styles.cancel')}</Button>
      )}
    </div>
  );

  const ex = s?.explore;
  const setExplore = (patch) => ts.update(s.id, { explore: { ...s.explore, ...patch } });
  const setDays = (patch) => ts.update(s.id, { days: { ...s.days, ...patch } });
  const profile = s ? matchProfile(s.lifestyle) : null;
  const one = (list) => list[0] || '';

  const editor = s && (
    <div className="tstyle-editor">
      <div className="tstyle-namerow">
        <label className="tstyle-label" htmlFor="tstyle-name">{t('styles.name')}</label>
        <input
          id="tstyle-name"
          className="pf-input tstyle-name"
          value={s.name}
          placeholder={styleName(t, { ...s, name: '' })}
          maxLength={40}
          onChange={(e) => ts.update(s.id, { name: e.target.value })}
        />
      </div>
      <Segmented
        label={t('styles.halves')}
        block
        value={half}
        onChange={setHalf}
        options={[
          { value: 'stay', label: t('styles.stayHalf') },
          { value: 'explore', label: t('styles.exploreHalf') },
        ]}
      />
      {half === 'stay' ? (
        <div className="tstyle-half">
          <p className="tstyle-note">{t('styles.stayNote')}</p>
          <Field title={t('styles.who')}>
            <ChoiceChips
              label={t('styles.who')}
              values={['solo', 'couple', 'friends', 'family', 'group']}
              picked={[s.who.kind]}
              labelOf={(v) => t(`pf.who.${v}`)}
              onChange={([k]) => {
                if (!k) return;
                const base = TEMPLATES[k]?.who || s.who;
                ts.update(s.id, { who: { ...s.who, kind: k, adults: base.adults, kids: base.kids } });
                app.setPartyParts?.({ adults: base.adults, children: base.kids, babies: s.who.babies });
              }}
            />
            <PartyEditor
              compact
              value={{ adults: s.who.adults, children: s.who.kids, babies: s.who.babies }}
              onChange={(v) => app.setPartyParts?.(v)}
            />
          </Field>
          <Field title={t('styles.bedTable')}>
            <Button
              variant="secondary"
              block
              className="tstyle-row"
              iconEnd={<ChevronRightIcon size={16} />}
              // One dialog at a time: the Lifestyle panel replaces this sheet.
              onClick={() => { onClose(); openLifestyle?.(); }}
            >
              <span className="tstyle-row-text">
                <span>{t(`stay.${s.stay}`)}</span>
                <span className="tstyle-row-sub">{profile ? t(PROFILE_LABEL_KEYS[profile]) : t('lifestyle.custom')}</span>
              </span>
            </Button>
          </Field>
          <Field title={t('styles.way')}>
            <ChoiceChips
              label={t('styles.way')}
              values={TRAVEL_MODES}
              picked={[s.way]}
              labelOf={(v) => t(`way.${v}`)}
              onChange={([v]) => app.setTransportMode?.(v || 'any')}
            />
          </Field>
          <Field title={t('styles.priority')} note={t('styles.priorityNote')}>
            <ChoiceChips
              label={t('styles.priority')}
              values={PRIORITIES}
              picked={[s.priority]}
              labelOf={(v) => optLabel(t, 'priority', v)}
              onChange={([v]) => v && ts.update(s.id, { priority: v })}
            />
          </Field>
        </div>
      ) : (
        <div className="tstyle-half">
          <p className="tstyle-note">{t('styles.exploreNote')}</p>
          <Field title={t('styles.shape')}>
            <ChoiceChips
              multi
              label={t('styles.shape')}
              values={SHAPES}
              picked={ex.shapes}
              labelOf={(v) => optLabel(t, 'g:shape', v)}
              onChange={(v) => setExplore({ shapes: v })}
            />
          </Field>
          <Field title={t('styles.persona')}>
            <ChoiceChips
              multi
              max={3}
              label={t('styles.persona')}
              values={PERSONAS}
              picked={ex.personas}
              labelOf={(v) => t(`pf.persona.${v}`)}
              onChange={(v) => setExplore({ personas: v.includes('mix') && v.length > 1 ? v.filter((x) => x !== 'mix') : v })}
            />
          </Field>
          <Field title={t('styles.likes')}>
            <ChoiceChips
              multi
              max={3}
              label={t('styles.likes')}
              values={LIKES}
              picked={ex.likes}
              labelOf={(v) => t(`pf.like.${v}`)}
              onChange={(v) => setExplore({ likes: v })}
            />
          </Field>
          <Field title={t('styles.avoid')}>
            <ChoiceChips
              multi
              label={t('styles.avoid')}
              values={AVOID}
              picked={ex.avoid}
              labelOf={(v) => optLabel(t, 'g:avoid', v)}
              onChange={(v) => setExplore({ avoid: v })}
            />
          </Field>
          <Field title={t('taste.q.size')}>
            <ChoiceChips
              label={t('taste.q.size')}
              values={SIZES}
              picked={ex.size ? [ex.size] : []}
              labelOf={(v) => t(`taste.opt.${v}`)}
              onChange={(v) => setExplore({ size: one(v) })}
            />
          </Field>
          <Field title={t('taste.q.quiet')}>
            <ChoiceChips
              label={t('taste.q.quiet')}
              values={QUIET}
              picked={ex.quiet ? [ex.quiet] : []}
              labelOf={(v) => t(`taste.opt.${v}`)}
              onChange={(v) => setExplore({ quiet: one(v) })}
            />
          </Field>
          <Field title={t('styles.around')}>
            <ChoiceChips
              label={t('styles.around')}
              values={AROUND}
              picked={ex.around ? [ex.around] : []}
              labelOf={(v) => optLabel(t, 'g:around', v)}
              onChange={(v) => setExplore({ around: one(v) })}
            />
          </Field>
          <Field title={t('styles.mornings')}>
            <ChoiceChips
              label={t('styles.mornings')}
              values={MORNINGS}
              picked={s.days.mornings ? [s.days.mornings] : []}
              labelOf={(v) => optLabel(t, 'r:mornings', v)}
              onChange={(v) => setDays({ mornings: one(v) })}
            />
          </Field>
          <Field title={t('styles.pace')}>
            <ChoiceChips
              label={t('styles.pace')}
              values={PACE}
              picked={s.days.pace ? [s.days.pace] : []}
              labelOf={(v) => optLabel(t, 'r:pace', v)}
              onChange={(v) => setDays({ pace: one(v) })}
            />
          </Field>
        </div>
      )}
    </div>
  );

  return (
    <SheetShell title={t('styles.title')} onClose={onClose} width={640} className="tstyle-sheet" labelId="tstyle-title">
      <div className="tstyle">
        {ts.list.length > 0 && (
          <div className="tstyle-band">
            <h3 className="tstyle-label">{t('styles.as')}</h3>
            <StylePicker
              list={ts.list}
              activeId={ts.activeId}
              onPick={(id) => { ts.switchTo(id); setAdding(false); setConfirmDelete(false); }}
              label={t('styles.as')}
              extra={newCard}
              figures={figures}
            />
            {anyFigure && <p className="tstyle-note">{t('styles.dayFigNote')}</p>}
            {!ts.activeId && <p className="tstyle-note">{t('styles.noneActive')}</p>}
            {full && <p className="tstyle-note">{t('styles.max', { n: MAX_STYLES })}</p>}
          </div>
        )}
        {showTemplates ? templates : editor}
        <div className="tstyle-foot">
          {s && !showTemplates && (
            <div className="tstyle-foot-actions">
              {!full && (
                <Button variant="quiet" size="sm" iconStart={<CopyIcon size={16} />} onClick={() => ts.duplicate(s.id, t('styles.copyOf', { name: styleName(t, s) }).slice(0, 40))}>
                  {t('styles.duplicate')}
                </Button>
              )}
              {confirmDelete ? (
                <Button variant="quiet" size="sm" className="tstyle-danger" iconStart={<TrashIcon size={16} />} onClick={() => { ts.remove(s.id); setConfirmDelete(false); }}>
                  {t('styles.deleteSure', { name: styleName(t, s) })}
                </Button>
              ) : (
                <Button variant="quiet" size="sm" iconStart={<TrashIcon size={16} />} onClick={() => setConfirmDelete(true)}>
                  {t('styles.delete')}
                </Button>
              )}
            </div>
          )}
          <Button variant="primary" onClick={onClose}>{t('styles.done')}</Button>
        </div>
      </div>
    </SheetShell>
  );
}
