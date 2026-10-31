import React, { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { DEFAULT_LIFESTYLE } from '../../lib/runtime_pricing.js';
import { StayTypes } from './StayTypes.jsx';
import {
  PROFILES, PROFILE_ICONS, PROFILE_LABEL_KEYS, matchProfile,
  PERIOD_FIELDS, COFFEE_MAX, toCadence,
} from '../../browse/LifestylePanel.jsx';
import { Stepper } from '../../components/FilterControls.jsx';
import { Button, Segmented, Tile, TileGroup } from '../../components/ui/index.js';
import { ChevronDownIcon, SettingsIcon } from '../../components/Icons.jsx';
import { TasteRow } from '../../browse/TasteDoor.jsx';

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
 * Lifestyle panel holds, in the order it holds it. Where you sleep (three
 * stay types, the stars for a hotel; StayTypes.jsx), how you spend, and the
 * seven counts behind the spend behind one Fine tune button at the right of
 * the spend heading. Getting there is its own question since T860 (the
 * way screen). Not a second setting: it reads and writes the same
 * choices.stay_tier and choices.lifestyle the panel does, so every price in
 * the app moves with it. One quiet line says it can all be changed later.
 */
export function LifestyleStep() {
  const { t } = useI18n();
  const ctx = useFirstRun();
  const choices = ctx?.choices || {};
  const setChoices = ctx?.setChoices;
  const [tuning, setTuning] = useState(false);
  if (!setChoices) return null;

  const ls = choices.lifestyle || DEFAULT_LIFESTYLE;
  const cadence = ls.cadence || 'week';
  const activeProfile = matchProfile(ls);

  const set = (patch) => setChoices((prev) => ({ ...prev, ...patch(prev) }));
  const pickProfile = (name) => set(() => ({ lifestyle: { ...PROFILES[name] } }));
  const setCadence = (c) => set((p) => ({ lifestyle: toCadence(p.lifestyle || DEFAULT_LIFESTYLE, c) }));
  const setCount = (key, v) => set((p) => ({ lifestyle: { ...(p.lifestyle || DEFAULT_LIFESTYLE), [key]: v } }));
  const maxFor = (key) => (key === 'coffees_per_day' ? COFFEE_MAX : PERIOD_FIELDS.find((f) => f.key === key).max[cadence]);

  return (
    <div className="pf-ls">
      <section className="pf-ls-q" aria-labelledby="pf-ls-sleep">
        <h3 className="pf-ls-h" id="pf-ls-sleep">{t('lifestyle.stay')}</h3>
        <StayTypes />
      </section>

      <section className="pf-ls-q" aria-labelledby="pf-ls-spend">
        <div className="pf-ls-hrow">
          <h3 className="pf-ls-h" id="pf-ls-spend">{t('journey.spendLabel')}</h3>
          <Button variant="ghost" size="sm" className={`pf-ls-tune${tuning ? ' is-open' : ''}`} aria-expanded={tuning}
            aria-controls="pf-ls-counts" iconEnd={<ChevronDownIcon size={16} className="pf-ls-chev" />}
            onClick={() => setTuning(!tuning)}>
            {t('lifestyle.fineTune')}
          </Button>
        </div>
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

      {/* T947: the taste profile, the same door as Account and Explore. */}
      <TasteRow className="pf-ls-taste" />

      <p className="pf-ls-later">
        <SettingsIcon size={16} />
        <span>{t('pf.sleep.later')}</span>
      </p>
    </div>
  );
}
