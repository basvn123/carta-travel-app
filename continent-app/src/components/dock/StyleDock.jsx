import React, { useEffect, useId, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Segmented } from '../ui/index.js';
import { HouseIcon } from '../HouseIcons.jsx';
import { useSettings } from '../SettingsLine.jsx';
import { PartyEditor } from '../../planner/PartyEditor.jsx';
import {
  ChoiceChips, optLabel, StyleExploreFields, StylePicker, styleIcon, styleName,
} from '../../browse/TravelStylesSheet.jsx';
import { matchProfile, PROFILE_LABEL_KEYS, PROFILES } from '../../browse/styles/spendBits.jsx';
import { offeredStayTiers } from '../../lib/runtime_pricing.js';
import { styleDayEur } from '../../lib/price/styleDay.js';
import { TRAVEL_MODES } from '../../lib/travelWay.js';
import { MAX_STYLES, PRIORITIES, TEMPLATE_IDS, TEMPLATES } from '../../lib/travelStyles.js';
import { Dock, DockRowField } from './Dock.jsx';
import { closeDock } from './dockStore.js';

/**
 * The Style dock (G12, explore polish; decision.md change 1): the travel
 * style in the bottom-left corner, in place of the header's style door.
 * Top to bottom: the styles as a radiogroup with each one's day figure, the
 * two halves (How you stay: Who, Where you sleep, How you eat and drink,
 * Getting there, What matters most; How you explore: the sheet's own
 * fields), then a foot with "Open all settings" and a more menu (Duplicate,
 * Delete). The full Travel styles sheet stays mounted for every other door.
 *
 * Every edit is the active style's own (ts.update), then the style is put
 * back on (ts.switchTo), so prices follow at once. While a trip holds the
 * style (ts.held / ts.changed) that switch would throw the trip's changes
 * away, so the bed and the table wait, as in the sheet (styles.bedHeld).
 *
 * Hidden where the corner is taken: on Plan (its bar owns the bottom), on
 * the full pages, under the phone keyboard and while another dialog is
 * open (the last two in 89-dock.css).
 */
export function StyleDock({ hidden = false }) {
  const { t } = useI18n();
  const app = useSettings();
  const ts = app?.travelStyles;
  // The style door left the header, so with no Style dock on screen the
  // corner disc is the only way in; the sheet keeps its other doors.
  if (!ts) return null;
  const s = ts.active;
  const Ico = s ? styleIcon(s) : HouseIcon.pack;
  const name = s ? styleName(t, s) : t('styles.choose');
  const changed = Boolean(s && (ts.changed || ts.held));
  return (
    <Dock
      id="style"
      anchor="corner"
      hidden={hidden}
      className={`style-dock${s ? ` tone-${s.tone}` : ' is-empty'}`}
      glyph={<span key={s?.id || 'none'} className="dock-glyph-in"><Ico size={26} /></span>}
      label={s ? t(changed ? 'styles.doorAriaChanged' : 'styles.doorAria', { name }) : name}
      title={name}
      changed={changed}
      heading={t('styles.kicker')}
      headingHidden
    >
      <StyleRows ts={ts} app={app} />
    </Dock>
  );
}

function StyleRows({ ts, app }) {
  const { t } = useI18n();
  const baseId = useId();
  const [half, setHalf] = useState('stay');
  const [more, setMore] = useState(false);
  const [sure, setSure] = useState(false);
  const s = ts.active;
  const destinations = app?.data?.destinations || null;
  const priceKey = ts.list.map((x) => JSON.stringify([x.id, x.who, x.stay, x.lifestyle])).join('|');
  const figures = useMemo(() => {
    const m = new Map();
    for (const x of ts.list) m.set(x.id, styleDayEur(x, destinations));
    return m;
  }, [priceKey, destinations]); // eslint-disable-line react-hooks/exhaustive-deps -- priceKey stands for the list's priced parts
  const tiers = useMemo(() => offeredStayTiers(app?.data?.meta), [app?.data?.meta]);
  // A different style closes the menu and its delete question.
  useEffect(() => { setMore(false); setSure(false); }, [s?.id]);

  // First run: who comes, as five templates and "how I travel now".
  if (!ts.list.length) {
    return (
      <div className="style-dock-first">
        <p className="style-dock-first-title">{t('styles.firstTitle')}</p>
        <div className="style-dock-templates">
          {TEMPLATE_IDS.map((id) => {
            const tp = TEMPLATES[id];
            const TIco = styleIcon(tp);
            return (
              <Button key={id} variant="quiet" className={`tstyle-tpl tone-${tp.tone}`} onClick={() => ts.create(id)}>
                <span className="tstyle-disc" aria-hidden="true"><TIco size={18} /></span>
                <span>{t(tp.nameKey)}</span>
              </Button>
            );
          })}
          <Button variant="quiet" className="tstyle-tpl tone-mist" onClick={() => ts.create('')}>
            <span className="tstyle-disc" aria-hidden="true"><HouseIcon.pack size={18} /></span>
            <span>{t('styles.fromNow')}</span>
          </Button>
        </div>
      </div>
    );
  }

  const held = Boolean(s && (ts.changed || ts.held));
  const nm = s ? styleName(t, s) : '';
  // The style's own edit, then the style put back on so every price follows.
  const apply = (patch) => {
    ts.update(s.id, patch);
    ts.switchTo(s.id);
  };
  const profile = s ? matchProfile(s.lifestyle) : null;
  const full = ts.list.length >= MAX_STYLES;
  const editAll = () => { closeDock('style'); ts.setOpen(half); };

  return (
    <div className="style-dock-body">
      <StylePicker
        line
        list={ts.list}
        activeId={ts.activeId}
        onPick={(id) => ts.switchTo(id)}
        label={t('styles.kicker')}
        figures={figures}
      />
      {!ts.activeId && <p className="style-dock-note">{t('styles.noneActive')}</p>}
      {held && (
        <div className="style-dock-held" role="status">
          <span className="trip-dock-changed">{t('styles.kickerChanged')}</span>
          <div className="style-dock-held-actions">
            <Button variant="secondary" size="sm" onClick={ts.keep}>{t('styles.keepStay', { name: nm })}</Button>
            <Button variant="quiet" size="sm" onClick={ts.revert}>{t('styles.back', { name: nm })}</Button>
          </div>
        </div>
      )}
      {s && (
        <>
          <div className="style-dock-halves">
            <Segmented
              label={t('styles.halves')}
              block
              size="sm"
              value={half}
              onChange={setHalf}
              options={[
                { value: 'stay', label: t('styles.stayHalf') },
                { value: 'explore', label: t('styles.exploreHalf') },
              ]}
            />
          </div>
          {half === 'stay' ? (
            <div className="style-dock-half">
              <DockRowField index={0} rowKey="who" label={t('styles.who')} className="dock-row--stack">
                {/* The steppers say who comes; the who chips stay in Open all
                    settings, so the dock never says it twice (owner: cut what
                    adds nothing). */}
                <PartyEditor
                  compact
                  value={{ adults: s.who.adults, children: s.who.kids, babies: s.who.babies }}
                  onChange={(v) => {
                    ts.update(s.id, { who: { ...s.who, adults: v.adults, kids: v.children, babies: v.babies } });
                    app.setPartyParts?.(v);
                  }}
                />
              </DockRowField>
              <DockRowField index={1} rowKey="stay" label={t('lifestyle.stay')} className="dock-row--stack">
                {held && <p className="style-dock-note">{t('styles.bedHeld', { name: nm })}</p>}
                <fieldset className="style-dock-set" disabled={held}>
                  <ChoiceChips
                    label={t('lifestyle.stay')}
                    values={tiers}
                    picked={[s.stay]}
                    labelOf={(v) => t(`stay.${v}`)}
                    onChange={([v]) => v && apply({ stay: v })}
                  />
                </fieldset>
              </DockRowField>
              <DockRowField index={2} rowKey="food" label={t('lifestyle.profile')} className="dock-row--stack">
                <fieldset className="style-dock-set" disabled={held}>
                  <ChoiceChips
                    label={t('lifestyle.profile')}
                    values={Object.keys(PROFILES)}
                    picked={profile ? [profile] : []}
                    labelOf={(v) => t(PROFILE_LABEL_KEYS[v])}
                    onChange={([v]) => v && apply({ lifestyle: { ...PROFILES[v] } })}
                  />
                </fieldset>
              </DockRowField>
              <DockRowField index={3} rowKey="way" label={t('styles.way')} className="dock-row--stack">
                <ChoiceChips
                  label={t('styles.way')}
                  values={TRAVEL_MODES}
                  picked={[s.way]}
                  labelOf={(v) => t(`way.${v}`)}
                  onChange={([v]) => { ts.update(s.id, { way: v || 'any' }); app.setTransportMode?.(v || 'any'); }}
                />
              </DockRowField>
              <DockRowField index={4} rowKey="priority" label={t('styles.priority')} className="dock-row--stack">
                <ChoiceChips
                  label={t('styles.priority')}
                  values={PRIORITIES}
                  picked={[s.priority]}
                  labelOf={(v) => optLabel(t, 'priority', v)}
                  onChange={([v]) => v && ts.update(s.id, { priority: v })}
                />
              </DockRowField>
            </div>
          ) : (
            <div className="style-dock-half style-dock-explore">
              <StyleExploreFields s={s} ts={ts} />
            </div>
          )}
        </>
      )}
      <div className="style-dock-foot">
        <Button variant="secondary" size="sm" onClick={editAll}>{t('styles.editAll')}</Button>
        {s && (
          <Button
            variant="quiet"
            size="sm"
            className="style-dock-more"
            aria-label={t('styles.more', { name: nm })}
            aria-expanded={more}
            aria-controls={`${baseId}-more`}
            onClick={() => { setMore((v) => !v); setSure(false); }}
          >
            <HouseIcon.more size={20} />
          </Button>
        )}
      </div>
      {s && more && (
        <div className="style-dock-menu" id={`${baseId}-more`}>
          {!full && (
            <Button variant="quiet" size="sm"
              onClick={() => { ts.duplicate(s.id, t('styles.copyOf', { name: nm }).slice(0, 40)); setMore(false); }}>
              {t('styles.duplicate')}
            </Button>
          )}
          {sure ? (
            <Button variant="quiet" size="sm" className="tstyle-danger" onClick={() => { ts.remove(s.id); setMore(false); }}>
              {t('styles.deleteSure', { name: nm })}
            </Button>
          ) : (
            <Button variant="quiet" size="sm" onClick={() => setSure(true)}>{t('styles.delete')}</Button>
          )}
          {full && <p className="style-dock-note">{t('styles.max', { n: MAX_STYLES })}</p>}
        </div>
      )}
    </div>
  );
}
