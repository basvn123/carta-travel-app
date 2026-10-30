import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { offeredStayTiers } from '../../lib/runtime_pricing.js';
import { HOTEL_GRADES, offeredStayTypes, stayTypeOf, tierForType, typesForSpace } from '../../lib/sleepGroups.js';
import { typicalNight } from '../../lib/price/priceDay.js';
import { formatMoney } from '../../lib/money.js';
import { Segmented, Tile, TileGroup } from '../../components/ui/index.js';
import { BedIcon, BunkIcon, HomeIcon, HotelIcon } from '../../components/Icons.jsx';

const TYPE_ICONS = { apartment: HomeIcon, hotel: HotelIcon, room: BedIcon, hostel: BunkIcon };

/**
 * Where to sleep (T862, plan flow v3): the space first, as one Segmented
 * that fills its box (A whole place, A room, Either), then the stay types it
 * holds as tiles, each with a typical night for the party (the median over
 * the trip's named countries, else the catalogue, lib/sleepGroups.js
 * typicalNight), a person or for the group as the price view is. The stars
 * show only for Hotel. It writes the app's own choices.stay_tier, so every
 * price follows.
 *
 *   party      { adults, kids } (the trip's)
 *   countries  the named places' iso2 codes, or null
 *   nights     the trip's nights, for the typical night (a week by default)
 */
export function StayTypes({ party = null, countries = null, nights = 7 }) {
  const { t, lang } = useI18n();
  const ctx = useFirstRun();
  // The price view (T694), read from the choices: useDayView would split
  // into a chunk of its own and add a module preload (the rolldown gotcha).
  const groupView = ctx?.choices?.price_view === 'total';
  const meta = ctx?.data?.meta;
  const destinations = ctx?.data?.destinations;
  const setChoices = ctx?.setChoices;
  const stayTier = ctx?.choices?.stay_tier || 'home';
  const types = useMemo(() => offeredStayTypes(offeredStayTiers(meta)), [meta]);
  const active = stayTypeOf(stayTier);
  const [space, setSpace] = useState('either');
  const adults = party?.adults ?? 2;
  const children = party?.kids ?? 0;
  const heads = adults + children;
  const countryKey = Array.isArray(countries) ? countries.join('.') : '';
  const hotelTier = /^hotel[2-5]$/.test(stayTier) ? stayTier : null;
  const nights_ = Math.max(1, nights || 7);
  // The typical nights read the whole catalogue (about 50 ms a type): worked
  // out a frame after the step paints, the price lines holding their place.
  const [prices, setPrices] = useState(null);
  useEffect(() => {
    let live = true;
    const id = setTimeout(() => {
      const out = {};
      for (const ty of types) {
        const tier = ty.key === 'hotel' && hotelTier && ty.offered.includes(hotelTier) ? hotelTier : ty.offered[0];
        out[ty.key] = typicalNight(destinations, tier, { adults, children, nights: nights_, countries: countryKey ? countryKey.split('.') : null });
      }
      if (live) setPrices(out);
    }, 0);
    return () => { live = false; clearTimeout(id); };
  }, [types, destinations, adults, children, nights_, countryKey, hotelTier]);
  if (!setChoices || !types.length) return null;

  const shown = typesForSpace(types, space);
  const pick = (ty) => setChoices((prev) => ({ ...prev, stay_tier: tierForType(ty, prev.stay_tier || 'home') }));
  const pickSpace = (next) => {
    setSpace(next);
    // The type picked stays when the space still shows it; else the space's first.
    const list = typesForSpace(types, next);
    if (!list.some((ty) => ty.key === active) && list[0]) pick(list[0]);
  };
  const hotel = types.find((ty) => ty.key === 'hotel');
  const grades = hotel ? HOTEL_GRADES.filter((g) => hotel.offered.includes(g.tier)) : [];
  const priceText = (p) => {
    if (p === undefined) return '';
    if (!p) return t('pf.stay.noPrice');
    if (groupView) return t('pf.stay.nightGroup', { price: formatMoney(p.perNight, { locale: lang }), n: heads });
    return t('pf.stay.nightPp', { price: formatMoney(p.perPerson, { locale: lang }) });
  };

  return (
    <div className="pf-stay">
      <Segmented
        block
        label={t('pf.stay.space')}
        className="pf-fill-seg"
        value={space}
        onChange={pickSpace}
        options={[
          { value: 'whole', label: t('pf.stay.whole') },
          { value: 'room', label: t('pf.stay.room') },
          { value: 'either', label: t('pf.stay.either') },
        ]}
      />
      <TileGroup label={t('lifestyle.stay')} kind="choice" columns={2} className="pf-stay-tiles">
        {shown.map((ty) => {
          const Icon = TYPE_ICONS[ty.key];
          return (
            <Tile key={ty.key} kind="choice" selected={active === ty.key}
              icon={Icon ? <Icon size={20} /> : null} onClick={() => pick(ty)}>
              <span className="pf-stay-name">{t(ty.labelKey)}</span>
              <span className="pf-stay-price">{priceText(prices ? prices[ty.key] : undefined)}</span>
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
