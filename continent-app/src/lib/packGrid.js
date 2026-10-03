/**
 * packGrid.js, the items behind the "What to pack" icon grid.
 *
 * A trip file carries packingNotes in one of two shapes: v2.0 sentences, or
 * v2.1 objects {icon, item, whyThisTrip} (the shape D1 backfills). Both become
 * grid cells {icon, label, why, derived}. Written notes always come first.
 *
 * 153 of the 253 trip files have no notes yet, and the rest hold four to six.
 * To keep the grid at 16 to 24 cells for every trip, the written notes are
 * topped up from a standard kit for the trip type. Those cells carry
 * derived: true, and their "why" says so plainly. When D1 lands, written notes
 * fill the grid and the standard kit shrinks to nothing on its own.
 */

export const PACK_MIN = 16;
export const PACK_MAX = 24;

/** First match wins, so the specific items sit above the general ones. */
const RULES = [
  ['repair', 'Repair kit', /\b(tyre|tire|puncture|inner tube|spare tube|multi-?tool|pump|plugs?)\b/i],
  ['light', 'Front light', /\b(headlamp|head torch|front light|torch|bike light|lights?)\b/i],
  ['helmet', 'Helmet', /\bhelmet/i],
  ['shorts', 'Padded shorts', /\b(padded|chamois|saddle)\b/i],
  ['poles', 'Trekking poles', /\b(poles?|trekking sticks?)\b/i],
  ['goggles', 'Goggles', /\b(goggles|ski mask)\b/i],
  ['gloves', 'Gloves', /\b(gloves?|mittens?)\b/i],
  ['drybag', 'Dry bag', /\b(dry ?bag|waterproof (bag|sack|cover)|pack liner)\b/i],
  ['rain', 'Rain shell', /\b(rain|waterproof|shell|showerproof|poncho|wet[- ]weather)\b/i],
  ['adapter', 'Plug adapter', /\b(adapt[eo]r|plug|socket|type g)\b/i],
  ['lock', 'Padlock', /\b(lock|padlock|locker)\b/i],
  ['power', 'Power bank', /\b(power ?bank|charger|battery pack)\b/i],
  ['nav', 'Offline maps', /\b(offline map|gpx|gps|maps?|compass|navigation)\b/i],
  ['firstaid', 'First aid', /\b(first[- ]aid|blister|plasters?|medic|insect|repellent)\b/i],
  ['swim', 'Swimwear', /\b(swim|bathing|trunks|bikini|wetsuit|water shoes)\b/i],
  ['towel', 'Quick-dry towel', /\b(towel)\b/i],
  ['sun', 'Sun protection', /\b(sun ?hat|sun ?screen|sun protection|spf|sunglasses|sun)\b/i],
  ['bottle', 'Water bottle', /\b(bottles?|hydration|water reservoir|refill)\b/i],
  ['cash', 'Small cash', /\b(cash|coins|notes|euros?)\b/i],
  ['phrase', 'Phrasebook', /\b(phrasebook|translation|language)\b/i],
  ['bag', 'Folding bag', /\b(shopping bag|tote|cooler|carrier bag|bags?)\b/i],
  ['camera', 'Camera', /\b(camera|binocular|tripod)\b/i],
  ['snack', 'Snacks', /\b(snacks?|food|lunch|picnic|energy)\b/i],
  ['shirt', 'Smart outfit', /\b(outfit|dress code|smart|collar|shirt)\b/i],
  ['shoes', 'Shoes', /\b(shoes?|boots?|trainers?|sandals?|footwear|socks?|grip)\b/i],
  ['layer', 'Warm layer', /\b(layers?|fleece|mid-layer|jumper|sweater|down|thermal|warm|insulat)\b/i],
  ['daypack', 'Day pack', /\b(daypack|day pack|backpack|rucksack|pack)\b/i],
];

export function classifyPackItem(text) {
  for (const [icon, label, re] of RULES) if (re.test(text)) return { icon, label };
  return { icon: 'daypack', label: 'Day pack' };
}

const known = new Map(RULES.map(([icon, label]) => [icon, label]));
known.set('daypack', 'Day pack');

/** One packingNotes entry to a grid cell, or null when it is empty. */
export function noteToCell(note) {
  if (!note) return null;
  if (typeof note === 'string') {
    const why = note.trim();
    if (!why) return null;
    return { ...classifyPackItem(why), why, derived: false };
  }
  const item = String(note.item || '').trim();
  const why = String(note.whyThisTrip || '').trim();
  if (!item && !why) return null;
  const byKey = known.has(note.icon) ? { icon: note.icon, label: known.get(note.icon) } : null;
  const c = byKey || classifyPackItem(`${item} ${why}`);
  return { icon: c.icon, label: item || c.label, why: why || item, derived: false };
}

const TYPE_G = new Set(['GB', 'IE', 'MT', 'CY']);

const months = (t) => {
  const n = t?.bestPeriod?.monthNames;
  return Array.isArray(n) && n.length ? `${n[0]} to ${n[n.length - 1]}` : 'the season';
};

/* [icon, why(trip)]. Every why names a fact of the trip file or of the trip
   type, never an invented condition. */
const COMMON = [
  ['rain', (t) => `Showers can arrive in ${months(t)}, and a shell weighs little.`],
  ['sun', (t) => `Plan for sun in ${months(t)}, whatever the temperature.`],
  ['bottle', (t) => `Refill points are cheaper than bottled water over ${t.durationDays || 7} days.`],
  ['cash', (t) => `Small places in ${t.country || 'the region'} may not take cards.`],
  ['power', (t) => `Maps and photos drain a phone across ${t.durationDays || 7} days.`],
  ['firstaid', () => 'Blisters and small cuts are the usual ones, and the nearest pharmacy can be a town away.'],
  ['lock', () => 'Locks a bag to a rack, or closes a dorm or hut locker.'],
  ['daypack', () => 'Carries the day: water, layers and the things above.'],
  ['shoes', () => 'Comfortable, grippy shoes matter more than any other single item.'],
  ['layer', () => 'Mornings and evenings are cooler than the middle of the day.'],
  ['camera', () => 'The views are a reason for the trip.'],
  ['phrase', (t) => `A few words of the local language go a long way in ${t.country || 'the region'}.`],
  ['nav', () => 'A saved map works where signal does not.'],
  ['snack', () => 'Shops can close early or sit far from the route.'],
  ['light', () => 'A small torch for dark stairwells, tunnels and late arrivals.'],
  ['bag', () => 'A folding bag doubles as a shop bag and a laundry bag.'],
  ['towel', () => 'A quick-dry towel for a swim or a room without one.'],
];

const BY_TYPE = {
  cycling: [
    ['repair', (t) => `Spare tube, levers and a pump for ${t.durationDays || 7} days where the next bike shop may be far.`],
    ['light', () => 'A front and rear light for tunnels and dusk, because a phone torch is not adequate.'],
    ['helmet', () => 'Required on some stretches, and the thing hire shops run short of.'],
    ['shorts', (t) => `${t.durationDays || 7} days on a saddle is hard on a single pair.`],
    ['gloves', () => 'Padded gloves cut hand numbness on long days.'],
    ['nav', () => 'A saved route works where signal does not.'],
    ['drybag', () => 'Keeps the bag contents dry when a shower catches the panniers.'],
    ['towel', () => 'A quick-dry towel for a swim stop between stages.'],
  ],
  hiking: [
    ['poles', () => 'Poles take load off the knees on long descents.'],
    ['shoes', () => 'Boots or trail shoes with real grip for rock and loose ground.'],
    ['layer', () => 'It gets cooler with every few hundred metres of height.'],
    ['light', () => 'A headlamp covers a late finish or an early hut start.'],
    ['nav', () => 'Offline maps for the stretches without signal.'],
    ['drybag', () => 'Keeps the sleeping layer dry in a downpour.'],
    ['gloves', () => 'Cold hands on exposed ridges, even in summer.'],
    ['snack', () => 'Huts and shops can be a full day apart.'],
  ],
  'trail-running': [
    ['poles', () => 'Folding poles help on the long climbs.'],
    ['shoes', () => 'Trail shoes with a lugged sole for mud and rock.'],
    ['light', () => 'A headlamp for early starts and slow days.'],
    ['layer', () => 'A thin layer for summits and after you stop.'],
    ['nav', () => 'The route on the watch or phone, saved offline.'],
    ['snack', () => 'Gels or bars for the long efforts between refills.'],
    ['gloves', () => 'Light gloves for cold starts.'],
    ['towel', () => 'A small towel for a post-run swim or wash.'],
  ],
  'winter-sports': [
    ['goggles', () => 'Goggles for flat light and wind on the lifts.'],
    ['gloves', () => 'Waterproof gloves, with a spare pair for a wet day.'],
    ['layer', () => 'Thermal base layers under the shell.'],
    ['helmet', () => 'Hire is common, but a fitted one is more comfortable.'],
    ['sun', () => 'Snow reflects sun, so sunscreen and lip balm matter.'],
    ['drybag', () => 'Keeps spare layers dry on the way up.'],
    ['towel', () => 'For a spa or sauna evening after a day out.'],
    ['shoes', () => 'Warm, waterproof boots for the walk to the lift.'],
  ],
  'water-sports': [
    ['swim', () => 'Swimwear that stays on during the activity.'],
    ['towel', () => 'A quick-dry towel between sessions.'],
    ['drybag', () => 'Keeps phone, keys and cards dry on the water.'],
    ['sun', () => 'Reflected sun doubles the exposure on the water.'],
    ['shoes', () => 'Water shoes for stony or sharp entry points.'],
    ['layer', () => 'A warm layer for after the session, when the wind picks up.'],
    ['camera', () => 'A waterproof case or action camera.'],
    ['shirt', () => 'A rash vest or long-sleeve top for sun and chafing.'],
  ],
  'road-trip': [
    ['nav', () => 'Offline maps for the stretches without signal.'],
    ['power', () => 'A car charger keeps the phone alive between stops.'],
    ['snack', () => 'Long stretches between services.'],
    ['phrase', () => 'Road signs and fuel stations switch languages at borders.'],
    ['camera', () => 'The viewpoints are the reason for the drive.'],
    ['shoes', () => 'Comfortable shoes for the short walks from the car park.'],
    ['layer', () => 'Passes and coast stops are cooler than the valley.'],
    ['bag', () => 'A soft bag packs into a small boot.'],
  ],
  city: [
    ['shoes', () => 'Cobbles and long walking days wear out the wrong shoes.'],
    ['layer', () => 'Museums and churches run cool.'],
    ['bag', () => 'A folding bag for market shopping.'],
    ['phrase', () => 'A few phrases go a long way outside the centre.'],
    ['shirt', () => 'One smart outfit covers opera, restaurants and churches.'],
    ['camera', () => 'Light is best early, before the crowds.'],
    ['nav', () => 'Saved maps save data and roaming fees.'],
    ['snack', () => 'Something small for the gap between lunch and a late dinner.'],
  ],
  'cozy-towns': [
    ['shoes', () => 'Cobbled lanes are slippery when wet.'],
    ['layer', () => 'Evenings in small towns cool quickly.'],
    ['bag', () => 'A folding bag for market and bakery finds.'],
    ['phrase', () => 'English is less common in smaller towns.'],
    ['camera', () => 'The lanes are the point.'],
    ['swim', () => 'A swim at a lake or pool is often a short walk away.'],
    ['towel', () => 'A quick-dry towel for the swim.'],
    ['nav', () => 'Saved maps for the villages between towns.'],
  ],
  culinary: [
    ['bag', () => 'A soft cooler bag for bottles and cheese between stops.'],
    ['shoes', () => 'Comfortable shoes for cellar floors and vineyard paths.'],
    ['sun', () => 'Terraces and vineyards have little shade.'],
    ['layer', () => 'Cellars and cool mornings.'],
    ['phrase', () => 'Small producers may not speak English.'],
    ['shirt', () => 'One smart outfit for a table that asks for it.'],
    ['nav', () => 'Saved maps for the producers off the main road.'],
    ['camera', () => 'The harvest and the tables are worth the photo.'],
  ],
  'nature-escape': [
    ['light', () => 'A headlamp for cabin evenings and a dark walk back.'],
    ['shoes', () => 'Boots for wet ground and trails around the cabin.'],
    ['layer', () => 'Cabins are cold until the stove is lit.'],
    ['nav', () => 'Offline maps for trails with no signal.'],
    ['snack', () => 'The nearest shop can be far from the cabin.'],
    ['swim', () => 'A lake or sauna swim is often part of the stay.'],
    ['towel', () => 'A quick-dry towel for the swim.'],
    ['camera', () => 'Wildlife and light at dawn.'],
  ],
};

/**
 * The cells for a trip, 16 to 24 of them. Written notes lead; the type's
 * standard kit tops up with icons the written notes have not used.
 */
export function packCells(trip) {
  const written = (trip?.packingNotes || []).map(noteToCell).filter(Boolean);
  const cells = written.slice(0, PACK_MAX);
  const used = new Set(cells.map((c) => c.icon));
  const type = trip?.tripTypeSlug || '';
  const pool = [...(BY_TYPE[type] || []), ...COMMON];
  if (TYPE_G.has(trip?.countryCode)) {
    pool.unshift(['adapter', () => 'This country uses the UK three-pin plug (type G).']);
  }
  const kind = trip?.tripType ? trip.tripType.toLowerCase() : 'this kind of trip';
  for (const [icon, why] of pool) {
    if (cells.length >= PACK_MIN) break;
    if (used.has(icon)) continue;
    used.add(icon);
    cells.push({
      icon,
      label: known.get(icon) || 'Day pack',
      why: `${why(trip || {})} Standard kit for ${kind}, not yet written for this trip.`,
      derived: true,
    });
  }
  return cells;
}
