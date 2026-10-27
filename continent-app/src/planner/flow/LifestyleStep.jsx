import React, { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { offeredStayTiers, DEFAULT_LIFESTYLE } from '../../lib/runtime_pricing.js';
import { offeredSleepGroups, optionsFor, sleepGroupOf, tierForGroup } from '../../lib/sleepGroups.js';
import { TRAVEL_MODES } from '../../lib/travelWay.js';
import {
  PROFILES, PROFILE_ICONS, PROFILE_LABEL_KEYS, SLEEP_ICONS, matchProfile,
  PERIOD_FIELDS, COFFEE_MAX, toCadence,
} from '../../browse/LifestylePanel.jsx';
import { WAY_ICONS } from '../../components/SettingsLine.jsx';
import { Stepper } from '../../components/FilterControls.jsx';
import { Button, Chip, ChipGroup, Segmented, Tile, TileGroup } from '../../components/ui/index.js';
import { ChevronDownIcon, SettingsIcon } from '../../components/Icons.jsx';

// The seven counts in the order the Lifestyle panel shows them; coffee is a
// day count whatever the cadence.
const COUNTS = [
  ['dinners_per_week', 'lifestyle.dinnersOut'],
  ['lunches_per_week', 'lifestyle.casualMeals'],
  ['fastfood_per_week', 'lifestyle.fastFood'],
  ['self_catered_days_per_week', 'lifestyle.cookAtHome'],
  ['drinks_per_week', 'lifestyle.drinksAtBars'],
  ['coffees_per_day', 'lifestyle.coffeesPerDay'],
  ['club_nights_per_week', 'lifestyle.clubNights'],
];

/**
 * The planner's "How do you like to travel?" step (T750): everything the
 * Lifestyle panel holds, in the order it holds it. Where you sleep (and
 * which kind), how you spend, getting there, and the seven counts behind
 * the spend behind one Fine tune button. Not a second setting: it reads and
 * writes the same choices.stay_tier, choices.lifestyle and
 * choices.transport_mode the panel does, so every price in the app moves
 * with it. One quiet line says it can all be changed later.
 */
export function LifestyleStep() {
  const { t } = useI18n();
  const ctx = useFirstRun();
  const choices = ctx?.choices || {};
  const setChoices = ctx?.setChoices;
  const tiers = useMemo(() => offeredStayTiers(ctx?.data?.meta), [ctx?.data?.meta]);
  const groups = useMemo(() => offeredSleepGroups(tiers), [tiers]);
  const [tuning, setTuning] = useState(false);
  if (!setChoices) return null;

  const stayTier = choices.stay_tier || 'home';
  const activeGroup = sleepGroupOf(stayTier);
  const activeKind = groups.find((g) => g.key === activeGroup) || null;
  const kindOptions = activeKind ? optionsFor(activeKind) : [];
  const ls = choices.lifestyle || DEFAULT_LIFESTYLE;
  const cadence = ls.cadence || 'week';
  const activeProfile = matchProfile(ls);
  const way = TRAVEL_MODES.includes(choices.transport_mode) ? choices.transport_mode : 'any';

  const set = (patch) => setChoices((prev) => ({ ...prev, ...patch(prev) }));
  const pickGroup = (g) => set((p) => ({ stay_tier: tierForGroup(g, p.stay_tier || 'home') }));
  const pickTier = (tier) => set(() => ({ stay_tier: tier }));
  const pickProfile = (name) => set(() => ({ lifestyle: { ...PROFILES[name] } }));
  const pickWay = (m) => set(() => ({ transport_mode: m }));
  const setCadence = (c) => set((p) => ({ lifestyle: toCadence(p.lifestyle || DEFAULT_LIFESTYLE, c) }));
  const setCount = (key, v) => set((p) => ({ lifestyle: { ...(p.lifestyle || DEFAULT_LIFESTYLE), [key]: v } }));
  const maxFor = (key) => (key === 'coffees_per_day' ? COFFEE_MAX : PERIOD_FIELDS.find((f) => f.key === key).max[cadence]);

  return (
    <div className="pf-ls">
      {groups.length > 1 && (
        <section className="pf-ls-q" aria-labelledby="pf-ls-sleep">
          <h3 className="pf-ls-h" id="pf-ls-sleep">{t('lifestyle.stay')}</h3>
          <TileGroup label={t('lifestyle.stay')} kind="choice" columns={3} className="pf-ls-tiles is-three">
            {groups.map((g) => {
              const Icon = SLEEP_ICONS[g.key];
              return (
                <Tile key={g.key} kind="choice" selected={activeGroup === g.key}
                  icon={Icon ? <Icon size={20} /> : null} onClick={() => pickGroup(g)}>
                  {t(g.labelKey)}
                </Tile>
              );
            })}
          </TileGroup>
          {kindOptions.length > 1 && (
            <Segmented
              label={t(activeKind.askKey)}
              size="sm"
              block
              className="pf-ls-kind"
              value={stayTier === 'hotel' ? 'hotel3' : stayTier}
              onChange={pickTier}
              options={kindOptions.map((o) => ({ value: o.tier, label: t(o.labelKey) }))}
            />
          )}
        </section>
      )}

      <section className="pf-ls-q" aria-labelledby="pf-ls-spend">
        <h3 className="pf-ls-h" id="pf-ls-spend">{t('journey.spendLabel')}</h3>
        <TileGroup label={t('journey.spendLabel')} kind="choice" columns={3} className="pf-ls-tiles is-spend">
          {Object.keys(PROFILES).map((name) => {
            const Icon = PROFILE_ICONS[name];
            return (
              <Tile key={name} kind="choice" selected={activeProfile === name}
                icon={Icon ? <Icon size={20} /> : null} onClick={() => pickProfile(name)}>
                {t(PROFILE_LABEL_KEYS[name])}
              </Tile>
            );
          })}
        </TileGroup>
        {!activeProfile && <p className="pf-ls-note">{t('lifestyle.customNote')}</p>}
      </section>

      <section className="pf-ls-q" aria-labelledby="pf-ls-way">
        <h3 className="pf-ls-h" id="pf-ls-way">{t('way.label')}</h3>
        <ChipGroup label={t('way.label')} className="pf-ls-way">
          {TRAVEL_MODES.map((m) => {
            const Icon = WAY_ICONS[m];
            return (
              <Chip key={m} kind="choice" selected={way === m} icon={Icon ? <Icon size={16} /> : null}
                onClick={() => pickWay(m)}>
                {t(`way.${m}`)}
              </Chip>
            );
          })}
        </ChipGroup>
      </section>

      <section className="pf-ls-q">
        <Button variant="secondary" size="sm" className={`pf-ls-tune${tuning ? ' is-open' : ''}`} aria-expanded={tuning}
          aria-controls="pf-ls-counts" iconEnd={<ChevronDownIcon size={16} className="pf-ls-chev" />}
          onClick={() => setTuning(!tuning)}>
          {t('lifestyle.fineTune')}
        </Button>
        {tuning && (
          <div className="pf-ls-counts" id="pf-ls-counts">
            <Segmented
              label={t('lifestyle.fineTune')}
              size="sm"
              block
              value={cadence}
              onChange={setCadence}
              options={[{ value: 'week', label: t('lifestyle.perWeek') }, { value: 'day', label: t('lifestyle.perDay') }]}
            />
            {COUNTS.map(([key, labelKey]) => {
              const label = t(labelKey);
              const value = ls[key] ?? 0;
              const max = maxFor(key);
              // A count can be fractional right after a week to day switch
              // (0.4 dinners a day); a step lands on the next whole number.
              const step = (next) => setCount(key, next > value
                ? Math.min(max, Math.floor(value) + 1)
                : Math.max(0, Math.ceil(value) - 1));
              return (
                <div key={key} className="pf-ls-count">
                  <span className="pf-ls-count-label">{label}</span>
                  <Stepper value={value} min={0} max={max} onChange={step} ariaLabel={label}
                    decLabel={t('lifestyle.decrease', { label })} incLabel={t('lifestyle.increase', { label })} />
                </div>
              );
            })}
          </div>
        )}
      </section>

      <p className="pf-ls-later">
        <SettingsIcon size={16} />
        <span>{t('pf.sleep.later')}</span>
      </p>
    </div>
  );
}
