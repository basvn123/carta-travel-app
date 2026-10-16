import React, { useMemo } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useFirstRun } from '../lib/firstRunContext.js';
import { offeredStayTiers, DEFAULT_LIFESTYLE } from '../lib/runtime_pricing.js';
import { offeredSleepGroups, sleepGroupOf, tierForGroup } from '../lib/sleepGroups.js';
import { PROFILES, PROFILE_ICONS, PROFILE_LABEL_KEYS, SLEEP_ICONS, matchProfile } from '../browse/LifestylePanel.jsx';
import { Tile, TileGroup } from '../components/ui/index.js';

/**
 * The Lifestyle panel's two answers, embedded in the trip planner's Who step
 * (T432): where you sleep, and how you spend a day. Not a second setting: the
 * tiles read and write the same choices.stay_tier and choices.lifestyle the
 * panel does, so the planner, the panel, Explore and every price in the app
 * move together (carta-design, "Lifestyle control"). The panel itself stays
 * one tap away on the price card for the hotel grade and the six habits.
 */
export function LifestyleChoices() {
  const { t } = useI18n();
  const ctx = useFirstRun();
  const choices = ctx?.choices || {};
  const setChoices = ctx?.setChoices;
  const tiers = useMemo(() => offeredStayTiers(ctx?.data?.meta), [ctx?.data?.meta]);
  const groups = useMemo(() => offeredSleepGroups(tiers), [tiers]);
  const stayTier = choices.stay_tier || 'home';
  const activeGroup = sleepGroupOf(stayTier);
  const activeProfile = matchProfile(choices.lifestyle || DEFAULT_LIFESTYLE);
  if (!setChoices) return null;

  const pickGroup = (g) => setChoices((prev) => ({ ...prev, stay_tier: tierForGroup(g, prev.stay_tier || 'home') }));
  const pickProfile = (name) => setChoices((prev) => ({ ...prev, lifestyle: { ...PROFILES[name] } }));

  return (
    <div className="wlife">
      {groups.length > 1 && (
        <div className="wlife-q">
          <h2 className="wlife-h" id="wlife-sleep">{t('lifestyle.stay')}</h2>
          <TileGroup label={t('lifestyle.stay')} kind="choice" columns={4} className="wlife-tiles" aria-labelledby="wlife-sleep">
            {groups.map((g) => {
              const Icon = SLEEP_ICONS[g.key];
              return (
                <Tile
                  key={g.key}
                  kind="choice"
                  selected={activeGroup === g.key}
                  icon={Icon ? <Icon size={24} /> : null}
                  onClick={() => pickGroup(g)}
                >
                  {t(g.labelKey)}
                </Tile>
              );
            })}
          </TileGroup>
        </div>
      )}
      <div className="wlife-q">
        <h2 className="wlife-h" id="wlife-spend">{t('journey.spendLabel')}</h2>
        <TileGroup label={t('journey.spendLabel')} kind="choice" columns={3} className="wlife-tiles" aria-labelledby="wlife-spend">
          {Object.keys(PROFILES).map((name) => {
            const Icon = PROFILE_ICONS[name];
            return (
              <Tile
                key={name}
                kind="choice"
                selected={activeProfile === name}
                icon={Icon ? <Icon size={24} /> : null}
                onClick={() => pickProfile(name)}
              >
                {t(PROFILE_LABEL_KEYS[name])}
              </Tile>
            );
          })}
        </TileGroup>
      </div>
    </div>
  );
}
