import React, { useMemo } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { offeredStayTiers } from '../../lib/runtime_pricing.js';
import { HOTEL_GRADES, offeredStayTypes, stayTypeOf, tierForType } from '../../lib/sleepGroups.js';
import { Segmented, Tile, TileGroup } from '../../components/ui/index.js';
import { BunkIcon, HomeIcon, HotelIcon } from '../../components/Icons.jsx';

const TYPE_ICONS = { apartment: HomeIcon, hotel: HotelIcon, hostel: BunkIcon };

// The planner asks three types (owner, plan flow walk 2026-10-30): a room in
// a home stays a Lifestyle panel choice, and no price shows here because a
// night's price depends on the destination.
const PLAN_TYPES = new Set(['apartment', 'hotel', 'hostel']);

/**
 * Where to sleep (T862, plan flow v3; trimmed on the owner's walk): three
 * clean tiles, an apartment or holiday home, a hotel, a hostel, with the
 * stars only for Hotel. It writes the app's own choices.stay_tier, so every
 * price follows.
 */
export function StayTypes() {
  const { t } = useI18n();
  const ctx = useFirstRun();
  const meta = ctx?.data?.meta;
  const setChoices = ctx?.setChoices;
  const stayTier = ctx?.choices?.stay_tier || 'home';
  const types = useMemo(() => offeredStayTypes(offeredStayTiers(meta)).filter((ty) => PLAN_TYPES.has(ty.key)), [meta]);
  const active = stayTypeOf(stayTier);
  const hotelTier = /^hotel[2-5]$/.test(stayTier) ? stayTier : null;
  if (!setChoices || !types.length) return null;

  const pick = (ty) => setChoices((prev) => ({ ...prev, stay_tier: tierForType(ty, prev.stay_tier || 'home') }));
  const hotel = types.find((ty) => ty.key === 'hotel');
  const grades = hotel ? HOTEL_GRADES.filter((g) => hotel.offered.includes(g.tier)) : [];

  return (
    <div className="pf-stay">
      <TileGroup label={t('lifestyle.stay')} kind="choice" columns={3} className="pf-stay-tiles">
        {types.map((ty) => {
          const Icon = TYPE_ICONS[ty.key];
          return (
            <Tile key={ty.key} kind="choice" selected={active === ty.key}
              icon={Icon ? <Icon size={20} /> : null} onClick={() => pick(ty)}>
              <span className="pf-stay-name">{t(ty.labelKey)}</span>
            </Tile>
          );
        })}
      </TileGroup>
      {active === 'hotel' && grades.length > 1 && (
        <Segmented
          block
          size="sm"
          label={t('lifestyle.hotelGrade')}
          className="pf-fill-seg pf-stay-stars"
          value={hotelTier || 'hotel3'}
          onChange={(tier) => setChoices((prev) => ({ ...prev, stay_tier: tier }))}
          options={grades.map((g) => ({ value: g.tier, label: t(g.labelKey) }))}
        />
      )}
    </div>
  );
}
