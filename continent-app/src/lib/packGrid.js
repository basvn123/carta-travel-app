/**
 * packGrid.js, the items behind the "What to pack" icon grid.
 *
 * A trip file carries packingNotes in one of two shapes: v2.0 sentences, or
 * v2.1 objects {icon, item, whyThisTrip} (the shape D1 backfills). Written
 * notes always come first in the grid.
 *
 * 153 of the 253 trip files have no notes yet, and the rest hold four to ten.
 * To keep the grid at 16 to 24 cells for every trip, the written notes are
 * topped up from a standard kit for the trip type. Those cells carry
 * derived: true, and their reason says so plainly. When D1 lands, written
 * notes fill the grid and the standard kit shrinks on its own.
 *
 * Two kinds of cell come out of packCells(trip), and the page resolves both
 * through resolvePackCell(cell, t, lang):
 *
 *   written  { icon, label, why, derived: false }
 *            label and why are the trip's own English words. Editorial prose
 *            stays in its authored language, the page's existing rule.
 *            A written cell whose short name is one of the fixed vocabulary
 *            items carries labelKey instead of label, so that name translates.
 *   derived  { icon, labelKey, whyKey, params, kitKey, derived: true }
 *            every string is an i18n key under journey.pack.*; params feeds
 *            the {var} slots. params.fromMonth and params.toMonth are month
 *            numbers (1 to 12) that the resolver names in the page language.
 *
 * packCells stays pure and node-safe: scripts/verify_pack_grid.mjs imports it
 * and resolves keys against PACK_EN, the English source of the catalogue rows.
 */

export const PACK_MIN = 16;
export const PACK_MAX = 24;

/** The English source for every journey.pack.* key. The six-language rows in
 *  the app catalogues are made from this map; the verify script reads it. */
export const PACK_EN = {
  // Labels, one per icon.
  'journey.pack.label.repair': 'Repair kit',
  'journey.pack.label.light': 'Front light',
  'journey.pack.label.helmet': 'Helmet',
  'journey.pack.label.shorts': 'Padded shorts',
  'journey.pack.label.poles': 'Trekking poles',
  'journey.pack.label.goggles': 'Goggles',
  'journey.pack.label.gloves': 'Gloves',
  'journey.pack.label.drybag': 'Dry bag',
  'journey.pack.label.rain': 'Rain shell',
  'journey.pack.label.adapter': 'Plug adapter',
  'journey.pack.label.lock': 'Padlock',
  'journey.pack.label.power': 'Power bank',
  'journey.pack.label.nav': 'Offline maps',
  'journey.pack.label.firstaid': 'First aid',
  'journey.pack.label.swim': 'Swimwear',
  'journey.pack.label.towel': 'Quick-dry towel',
  'journey.pack.label.sun': 'Sun protection',
  'journey.pack.label.bottle': 'Water bottle',
  'journey.pack.label.cash': 'Small cash',
  'journey.pack.label.phrase': 'Phrasebook',
  'journey.pack.label.bag': 'Folding bag',
  'journey.pack.label.camera': 'Camera',
  'journey.pack.label.snack': 'Snacks',
  'journey.pack.label.shirt': 'Smart outfit',
  'journey.pack.label.shoes': 'Shoes',
  'journey.pack.label.layer': 'Warm layer',
  'journey.pack.label.daypack': 'Day pack',

  // The closing sentence on every derived reason, one per trip type.
  'journey.pack.kit.cycling': 'Standard kit for cycling trips, not yet written for this trip.',
  'journey.pack.kit.hiking': 'Standard kit for hiking trips, not yet written for this trip.',
  'journey.pack.kit.trailRunning': 'Standard kit for trail running trips, not yet written for this trip.',
  'journey.pack.kit.winterSports': 'Standard kit for winter sports trips, not yet written for this trip.',
  'journey.pack.kit.waterSports': 'Standard kit for water sports trips, not yet written for this trip.',
  'journey.pack.kit.roadTrip': 'Standard kit for road trips, not yet written for this trip.',
  'journey.pack.kit.city': 'Standard kit for city trips, not yet written for this trip.',
  'journey.pack.kit.cozyTowns': 'Standard kit for small town trips, not yet written for this trip.',
  'journey.pack.kit.culinary': 'Standard kit for food and wine trips, not yet written for this trip.',
  'journey.pack.kit.natureEscape': 'Standard kit for cabin and nature trips, not yet written for this trip.',
  'journey.pack.kit.other': 'Standard kit for this kind of trip, not yet written for this trip.',

  // Reasons any trip can draw on.
  'journey.pack.why.adapter': 'This country uses the UK three-pin plug (type G).',
  'journey.pack.why.common.rain': 'Showers can arrive in {from} to {to}, and a shell weighs little.',
  'journey.pack.why.common.rainSeason': 'Showers can arrive in any season, and a shell weighs little.',
  'journey.pack.why.common.sun': 'Plan for sun in {from} to {to}, whatever the temperature.',
  'journey.pack.why.common.sunSeason': 'Plan for sun in any season, whatever the temperature.',
  'journey.pack.why.common.bottle': 'Refill points are cheaper than bottled water over {days} days.',
  'journey.pack.why.common.cash': 'Small places in {country} may not take cards.',
  'journey.pack.why.common.cashRegion': 'Small places in the region may not take cards.',
  'journey.pack.why.common.power': 'Maps and photos drain a phone across {days} days.',
  'journey.pack.why.common.firstaid': 'Blisters and small cuts are the usual ones, and the nearest pharmacy can be a town away.',
  'journey.pack.why.common.lock': 'Locks a bag to a rack, or closes a dorm or hut locker.',
  'journey.pack.why.common.daypack': 'Carries the day: water, layers and the things above.',
  'journey.pack.why.common.shoes': 'Comfortable, grippy shoes matter more than any other single item.',
  'journey.pack.why.common.layer': 'Mornings and evenings are cooler than the middle of the day.',
  'journey.pack.why.common.camera': 'The views are a reason for the trip.',
  'journey.pack.why.common.phrase': 'A few words of the local language go a long way in {country}.',
  'journey.pack.why.common.phraseRegion': 'A few words of the local language go a long way in the region.',
  'journey.pack.why.common.nav': 'A saved map works where signal does not.',
  'journey.pack.why.common.snack': 'Shops can close early or sit far from the route.',
  'journey.pack.why.common.light': 'A small torch for dark stairwells, tunnels and late arrivals.',
  'journey.pack.why.common.bag': 'A folding bag doubles as a shop bag and a laundry bag.',
  'journey.pack.why.common.towel': 'A quick-dry towel for a swim or a room without one.',

  // Reasons per trip type.
  'journey.pack.why.cycling.repair': 'Spare tube, levers and a pump for {days} days where the next bike shop may be far.',
  'journey.pack.why.cycling.light': 'A front and rear light for tunnels and dusk, because a phone torch is not adequate.',
  'journey.pack.why.cycling.helmet': 'Required on some stretches, and the thing hire shops run short of.',
  'journey.pack.why.cycling.shorts': '{days} days on a saddle is hard on a single pair.',
  'journey.pack.why.cycling.gloves': 'Padded gloves cut hand numbness on long days.',
  'journey.pack.why.cycling.nav': 'A saved route works where signal does not.',
  'journey.pack.why.cycling.drybag': 'Keeps the bag contents dry when a shower catches the panniers.',
  'journey.pack.why.cycling.towel': 'A quick-dry towel for a swim stop between stages.',

  'journey.pack.why.hiking.poles': 'Poles take load off the knees on long descents.',
  'journey.pack.why.hiking.shoes': 'Boots or trail shoes with real grip for rock and loose ground.',
  'journey.pack.why.hiking.layer': 'It gets cooler with every few hundred metres of height.',
  'journey.pack.why.hiking.light': 'A headlamp covers a late finish or an early hut start.',
  'journey.pack.why.hiking.nav': 'Offline maps for the stretches without signal.',
  'journey.pack.why.hiking.drybag': 'Keeps the sleeping layer dry in a downpour.',
  'journey.pack.why.hiking.gloves': 'Cold hands on exposed ridges, even in summer.',
  'journey.pack.why.hiking.snack': 'Huts and shops can be a full day apart.',

  'journey.pack.why.trailRunning.poles': 'Folding poles help on the long climbs.',
  'journey.pack.why.trailRunning.shoes': 'Trail shoes with a lugged sole for mud and rock.',
  'journey.pack.why.trailRunning.light': 'A headlamp for early starts and slow days.',
  'journey.pack.why.trailRunning.layer': 'A thin layer for summits and after you stop.',
  'journey.pack.why.trailRunning.nav': 'The route on the watch or phone, saved offline.',
  'journey.pack.why.trailRunning.snack': 'Gels or bars for the long efforts between refills.',
  'journey.pack.why.trailRunning.gloves': 'Light gloves for cold starts.',
  'journey.pack.why.trailRunning.towel': 'A small towel for a post-run swim or wash.',

  'journey.pack.why.winterSports.goggles': 'Goggles for flat light and wind on the lifts.',
  'journey.pack.why.winterSports.gloves': 'Waterproof gloves, with a spare pair for a wet day.',
  'journey.pack.why.winterSports.layer': 'Thermal base layers under the shell.',
  'journey.pack.why.winterSports.helmet': 'Hire is common, but a fitted one is more comfortable.',
  'journey.pack.why.winterSports.sun': 'Snow reflects sun, so sunscreen and lip balm matter.',
  'journey.pack.why.winterSports.drybag': 'Keeps spare layers dry on the way up.',
  'journey.pack.why.winterSports.towel': 'For a spa or sauna evening after a day out.',
  'journey.pack.why.winterSports.shoes': 'Warm, waterproof boots for the walk to the lift.',

  'journey.pack.why.waterSports.swim': 'Swimwear that stays on during the activity.',
  'journey.pack.why.waterSports.towel': 'A quick-dry towel between sessions.',
  'journey.pack.why.waterSports.drybag': 'Keeps phone, keys and cards dry on the water.',
  'journey.pack.why.waterSports.sun': 'Reflected sun doubles the exposure on the water.',
  'journey.pack.why.waterSports.shoes': 'Water shoes for stony or sharp entry points.',
  'journey.pack.why.waterSports.layer': 'A warm layer for after the session, when the wind picks up.',
  'journey.pack.why.waterSports.camera': 'A waterproof case or action camera.',
  'journey.pack.why.waterSports.shirt': 'A rash vest or long-sleeve top for sun and chafing.',

  'journey.pack.why.roadTrip.nav': 'Offline maps for the stretches without signal.',
  'journey.pack.why.roadTrip.power': 'A car charger keeps the phone alive between stops.',
  'journey.pack.why.roadTrip.snack': 'Long stretches between services.',
  'journey.pack.why.roadTrip.phrase': 'Road signs and fuel stations switch languages at borders.',
  'journey.pack.why.roadTrip.camera': 'The viewpoints are the reason for the drive.',
  'journey.pack.why.roadTrip.shoes': 'Comfortable shoes for the short walks from the car park.',
  'journey.pack.why.roadTrip.layer': 'Passes and coast stops are cooler than the valley.',
  'journey.pack.why.roadTrip.bag': 'A soft bag packs into a small boot.',

  'journey.pack.why.city.shoes': 'Cobbles and long walking days wear out the wrong shoes.',
  'journey.pack.why.city.layer': 'Museums and churches run cool.',
  'journey.pack.why.city.bag': 'A folding bag for market shopping.',
  'journey.pack.why.city.phrase': 'A few phrases go a long way outside the centre.',
  'journey.pack.why.city.shirt': 'One smart outfit covers opera, restaurants and churches.',
  'journey.pack.why.city.camera': 'Light is best early, before the crowds.',
  'journey.pack.why.city.nav': 'Saved maps save data and roaming fees.',
  'journey.pack.why.city.snack': 'Something small for the gap between lunch and a late dinner.',

  'journey.pack.why.cozyTowns.shoes': 'Cobbled lanes are slippery when wet.',
  'journey.pack.why.cozyTowns.layer': 'Evenings in small towns cool quickly.',
  'journey.pack.why.cozyTowns.bag': 'A folding bag for market and bakery finds.',
  'journey.pack.why.cozyTowns.phrase': 'English is less common in smaller towns.',
  'journey.pack.why.cozyTowns.camera': 'The lanes are the point.',
  'journey.pack.why.cozyTowns.swim': 'A swim at a lake or pool is often a short walk away.',
  'journey.pack.why.cozyTowns.towel': 'A quick-dry towel for the swim.',
  'journey.pack.why.cozyTowns.nav': 'Saved maps for the villages between towns.',

  'journey.pack.why.culinary.bag': 'A soft cooler bag for bottles and cheese between stops.',
  'journey.pack.why.culinary.shoes': 'Comfortable shoes for cellar floors and vineyard paths.',
  'journey.pack.why.culinary.sun': 'Terraces and vineyards have little shade.',
  'journey.pack.why.culinary.layer': 'Cellars and cool mornings.',
  'journey.pack.why.culinary.phrase': 'Small producers may not speak English.',
  'journey.pack.why.culinary.shirt': 'One smart outfit for a table that asks for it.',
  'journey.pack.why.culinary.nav': 'Saved maps for the producers off the main road.',
  'journey.pack.why.culinary.camera': 'The harvest and the tables are worth the photo.',

  'journey.pack.why.natureEscape.light': 'A headlamp for cabin evenings and a dark walk back.',
  'journey.pack.why.natureEscape.shoes': 'Boots for wet ground and trails around the cabin.',
  'journey.pack.why.natureEscape.layer': 'Cabins are cold until the stove is lit.',
  'journey.pack.why.natureEscape.nav': 'Offline maps for trails with no signal.',
  'journey.pack.why.natureEscape.snack': 'The nearest shop can be far from the cabin.',
  'journey.pack.why.natureEscape.swim': 'A lake or sauna swim is often part of the stay.',
  'journey.pack.why.natureEscape.towel': 'A quick-dry towel for the swim.',
  'journey.pack.why.natureEscape.camera': 'Wildlife and light at dawn.',
  // T431: the five new styles.
  'journey.pack.kit.hostel': 'Standard kit for hostel weeks, not yet written for this trip.',
  'journey.pack.kit.beachWeek': 'Standard kit for beach weeks, not yet written for this trip.',
  'journey.pack.kit.rail': 'Standard kit for rail journeys, not yet written for this trip.',
  'journey.pack.kit.pilgrim': 'Standard kit for pilgrim routes, not yet written for this trip.',
  'journey.pack.kit.islandHopping': 'Standard kit for island hopping, not yet written for this trip.',
  'journey.pack.why.hostel.lock': 'Most dorms have lockers but no lock.',
  'journey.pack.why.hostel.towel': 'Many hostels charge for towels.',
  'journey.pack.why.hostel.power': 'Dorms have few sockets, and the bus days are long.',
  'journey.pack.why.hostel.daypack': 'The big bag stays in the locker on walking days.',
  'journey.pack.why.hostel.shoes': 'Flip-flops for the shared showers.',
  'journey.pack.why.hostel.nav': 'Bus stations and hostels saved offline before you leave.',
  'journey.pack.why.hostel.phrase': 'Bus drivers rarely speak English.',
  'journey.pack.why.hostel.bottle': 'Refill it at the hostel instead of buying water.',
  'journey.pack.why.beachWeek.swim': 'Two sets each, so one is always dry.',
  'journey.pack.why.beachWeek.towel': 'Quick-dry towels fold small and dry by lunch.',
  'journey.pack.why.beachWeek.sun': 'Reapply after every swim.',
  'journey.pack.why.beachWeek.shoes': 'Water shoes for pebbles and sea urchins.',
  'journey.pack.why.beachWeek.shirt': 'A UV shirt for children who swim all day.',
  'journey.pack.why.beachWeek.bag': 'A bag that takes wet things home.',
  'journey.pack.why.beachWeek.snack': 'Beach bars cost more than the supermarket.',
  'journey.pack.why.beachWeek.camera': 'A waterproof pouch for the phone.',
  'journey.pack.why.rail.nav': 'Tickets and seat numbers saved offline for each train.',
  'journey.pack.why.rail.power': 'Not every carriage has a socket.',
  'journey.pack.why.rail.snack': 'Food on board costs more than at the station.',
  'journey.pack.why.rail.bottle': 'Fill it at the station before a long ride.',
  'journey.pack.why.rail.daypack': 'A small bag at your seat, the big one on the rack.',
  'journey.pack.why.rail.shoes': 'Station to old town is usually a walk on cobbles.',
  'journey.pack.why.rail.layer': 'Air-conditioned carriages run cold.',
  'journey.pack.why.rail.phrase': 'Four countries, four languages: hello and thank you in each.',
  'journey.pack.why.pilgrim.shoes': 'Shoes worn in before you go; new ones blister by day two.',
  'journey.pack.why.pilgrim.firstaid': "Blister plasters, the walker's first aid.",
  'journey.pack.why.pilgrim.layer': 'Mornings start early and cool, even in summer.',
  'journey.pack.why.pilgrim.towel': 'Pilgrim hostels rarely give towels.',
  'journey.pack.why.pilgrim.drybag': 'Rain can soak a pack in an hour.',
  'journey.pack.why.pilgrim.bottle': 'Refill it at village fountains and bars.',
  'journey.pack.why.pilgrim.sun': 'Long stretches of lane with little shade.',
  'journey.pack.why.pilgrim.lock': 'A small lock for the pack in a shared dorm.',
  'journey.pack.why.islandHopping.drybag': 'Spray on deck and wet boat trips.',
  'journey.pack.why.islandHopping.swim': 'Every island day ends at a beach.',
  'journey.pack.why.islandHopping.towel': 'A quick-dry towel packs small between ferries.',
  'journey.pack.why.islandHopping.sun': 'There is little shade on the islands.',
  'journey.pack.why.islandHopping.shoes': 'Sandals that grip on harbour steps and paths.',
  'journey.pack.why.islandHopping.power': 'Ferries run late; keep the tickets on your phone alive.',
  'journey.pack.why.islandHopping.daypack': 'Leave the big bag at the room and take a small one to the beach.',
  'journey.pack.why.islandHopping.layer': 'The summer wind makes evenings on deck cool.',
};

/** First match wins, so the specific items sit above the general ones.
 *  The light rule names lamps only: "light" alone is the adjective in "a light
 *  rain shell" and "light crampons", which used to read as "Front light". */
const RULES = [
  ['repair', /\b(tyre|tire|puncture|inner tube|spare tube|multi-?tool|pump|plugs?)\b/i],
  ['light', /\b(headlamp|head ?torch|front light|rear light|torch|bike lights?|lights)\b/i],
  ['helmet', /\bhelmet/i],
  ['shorts', /\b(padded|chamois|saddle)\b/i],
  ['poles', /\b(poles?|trekking sticks?)\b/i],
  ['goggles', /\b(goggles|ski mask)\b/i],
  ['gloves', /\b(gloves?|mittens?)\b/i],
  ['drybag', /\b(dry ?bag|waterproof (bag|sack|cover)|pack liner)\b/i],
  ['rain', /\b(rain|waterproof|shell|showerproof|poncho|wet[- ]weather)\b/i],
  ['adapter', /\b(adapt[eo]r|plug|socket|type g)\b/i],
  ['lock', /\b(lock|padlock|locker)\b/i],
  ['power', /\b(power ?bank|charger|battery pack)\b/i],
  ['nav', /\b(offline map|gpx|gps|maps?|compass|navigation)\b/i],
  ['firstaid', /\b(first[- ]aid|blister|plasters?|medic|insect|repellent)\b/i],
  ['swim', /\b(swim|bathing|trunks|bikini|wetsuit|water shoes)\b/i],
  ['towel', /\b(towel)\b/i],
  ['sun', /\b(sun ?hat|sun ?screen|sun protection|spf|sunglasses|sun)\b/i],
  ['bottle', /\b(bottles?|hydration|water reservoir|refill)\b/i],
  ['cash', /\b(cash|coins|notes|euros?)\b/i],
  ['phrase', /\b(phrasebook|translation|language)\b/i],
  ['bag', /\b(shopping bag|tote|cooler|carrier bag|bags?)\b/i],
  ['camera', /\b(camera|binocular|tripod)\b/i],
  ['snack', /\b(snacks?|food|lunch|picnic|energy)\b/i],
  ['shirt', /\b(outfit|dress code|smart|collar|shirt)\b/i],
  ['shoes', /\b(shoes?|boots?|trainers?|sandals?|footwear|socks?|grip)\b/i],
  ['layer', /\b(layers?|fleece|mid-layer|jumper|sweater|down|thermal|warm|insulat)\b/i],
  ['daypack', /\b(daypack|day pack|backpack|rucksack|pack)\b/i],
];

const ICONS = new Set([...RULES.map(([icon]) => icon)]);
const labelKey = (icon) => `journey.pack.label.${icon}`;

/** The icon for a piece of text; the day pack when nothing matches. */
export function classifyPackItem(text) {
  for (const [icon, re] of RULES) if (re.test(text)) return icon;
  return 'daypack';
}

/* The vocabulary name is used for a written note only when that name is what
   the note is about: the rule must match the note's own short name, not a
   word further on ("coins for lido lockers" is cash, not a padlock). The day
   pack name additionally needs the note to say day pack, because the bare
   word "pack" also turns up in "over-pack" and "a 30-40 L pack". Two more
   names are narrower than their icons: "Front light" is not a headtorch, and
   "Offline maps" is not a paper map, so those notes keep their own words. */
const VOCAB_ONLY_IF = {
  daypack: (p) => /\b(day ?pack)\b/i.test(p),
  light: (p) => /\b((front|rear|bike) lights?|lights)\b/i.test(p),
  nav: (p) => !/\b(paper|printed)\b/i.test(p),
};
function vocabFor(phrase) {
  for (const [icon, re] of RULES) {
    if (!re.test(phrase)) continue;
    const only = VOCAB_ONLY_IF[icon];
    return !only || only(phrase) ? icon : null;
  }
  return null;
}

const LEAD = new Set(['a', 'an', 'the', 'some', 'your', 'any', 'proper', 'genuinely', 'really', 'good', 'decent']);
const STOP = new Set([
  'for', 'with', 'if', 'that', 'which', 'when', 'to', 'in', 'on', 'at', 'from', 'as', 'because', 'since',
  'even', 'so', 'is', 'are', 'was', 'be', 'you', 'before', 'after', 'during', 'unless', 'than', 'per', 'not',
  'plus', 'including', 'and', 'or', 'but', 'rather', 'rented', 'kept', 'here', 'there', 'where', 'while',
  'until', 'may', 'must', 'can', 'will', 'should', 'rated', 'required', 'needed', 'enough',
]);
const TAIL = new Set(['of', 'and', 'or', 'a', 'an', 'the', 'for', 'with', 'to', 'in', 'on', 'at', 'both']);
/* Describing words that open a note and are followed by a comma ("Flat,
   grippy shoes"): the name runs on past the comma to reach the thing. */
const ADJ = new Set(['flat', 'comfortable', 'wide', 'sturdy', 'modest', 'light', 'lightweight', 'warm', 'small',
  'compact', 'waterproof', 'windproof', 'grippy', 'thin', 'thick', 'spare', 'cheap', 'soft']);

const sentenceCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A short name taken from a written note, built only from the note's own
 * words: an English gloss in brackets right after the first word wins
 * ("Hüttenschlafsack (hut sleeping liner)"), otherwise the first noun phrase,
 * cut at the first clause break or linking word, at most `max` words. With
 * `loose`, linking words no longer cut, which is how a name is widened when
 * the short one is already taken in the grid.
 */
export function noteLabel(note, max = 4, loose = false) {
  const s = String(note || '').trim().replace(/^what people (over|under)-pack:\s*/i, '');
  const gloss = s.match(/^[^\s(,;:]+\s*\(([^)]{3,40})\)/);
  if (gloss && gloss[1].trim().split(/\s+/).length <= 4) return sentenceCase(gloss[1].trim());
  // A comma or colon inside a number ("1:25,000") is not a clause break.
  const clauses = s.split(/(?=[;()!?]|[,:](?!\d))|\.(?=\s|$)|\s-\s/);
  const head = (clauses[0] || '').trim().split(/\s+/).filter(Boolean);
  while (head.length > 1 && LEAD.has(head[0].toLowerCase())) head.shift();
  let words = head;
  if (head.length === 1 && ADJ.has(head[0].toLowerCase()) && /^,/.test(clauses[1] || '')) {
    words = [`${head[0]},`, ...clauses[1].slice(1).trim().split(/\s+/).filter(Boolean)];
  }
  const out = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const lw = w.toLowerCase();
    // "Front and rear lights", "Printed or saved copy": a linking word right
    // after the first word joins two describing words rather than ending the name.
    const joins = out.length === 1 && (lw === 'and' || lw === 'or') && !LEAD.has((words[i + 1] || '').toLowerCase());
    if (!loose && out.length && STOP.has(lw) && !joins) break;
    out.push(w);
    if (out.length >= max) break;
  }
  while (out.length > 1 && TAIL.has(out[out.length - 1].toLowerCase())) out.pop();
  return sentenceCase(out.join(' ').replace(/[.,'"]+$/, ''));
}

/** One packingNotes entry to a written grid cell, or null when it is empty.
 *  `taken` holds the lowercased names already in the grid, so a second note
 *  about the same kind of thing is named from its own words instead. */
export function noteToCell(note, taken = new Set()) {
  if (!note) return null;
  let item = '';
  let why = '';
  let icon = null;
  if (typeof note === 'string') {
    why = note.trim();
  } else {
    item = String(note.item || '').trim();
    why = String(note.whyThisTrip || '').trim();
    if (ICONS.has(note.icon)) icon = note.icon;
  }
  if (!item && !why) return null;
  why = why || item;
  icon = icon || classifyPackItem(`${item} ${why}`);
  const free = (name) => name && name.length > 1 && !taken.has(name.toLowerCase());

  // An authored item name always leads; it is the writer's own label.
  if (item && free(item)) return { icon, label: item, why, derived: false };

  const phrase = noteLabel(item || why);
  const vocab = vocabFor(phrase);
  if (vocab && free(PACK_EN[labelKey(vocab)])) {
    return { icon, labelKey: labelKey(vocab), why, derived: false, name: PACK_EN[labelKey(vocab)] };
  }
  // The note's own words, widened one step at a time until the name is free.
  for (const [max, loose] of [[4, false], [6, true], [8, true], [12, true]]) {
    const name = noteLabel(item || why, max, loose);
    if (free(name)) return { icon, label: name, why, derived: false };
  }
  // Two notes that open with the same twelve words: keep the first, drop the
  // repeat, since a second cell with the same name would say nothing new.
  return null;
}

const TYPE_G = new Set(['GB', 'IE', 'MT', 'CY']);

const TYPE_KEY = {
  cycling: 'cycling',
  hiking: 'hiking',
  'trail-running': 'trailRunning',
  'winter-sports': 'winterSports',
  'water-sports': 'waterSports',
  'road-trip': 'roadTrip',
  city: 'city',
  'cozy-towns': 'cozyTowns',
  culinary: 'culinary',
  'nature-escape': 'natureEscape',
  hostel: 'hostel',
  'beach-week': 'beachWeek',
  rail: 'rail',
  pilgrim: 'pilgrim',
  'island-hopping': 'islandHopping',
};

/* The order each type's standard kit is drawn in. Every reason names a fact
   of the trip file or of the trip type, never an invented condition. */
const BY_TYPE = {
  cycling: ['repair', 'light', 'helmet', 'shorts', 'gloves', 'nav', 'drybag', 'towel'],
  hiking: ['poles', 'shoes', 'layer', 'light', 'nav', 'drybag', 'gloves', 'snack'],
  trailRunning: ['poles', 'shoes', 'light', 'layer', 'nav', 'snack', 'gloves', 'towel'],
  winterSports: ['goggles', 'gloves', 'layer', 'helmet', 'sun', 'drybag', 'towel', 'shoes'],
  waterSports: ['swim', 'towel', 'drybag', 'sun', 'shoes', 'layer', 'camera', 'shirt'],
  roadTrip: ['nav', 'power', 'snack', 'phrase', 'camera', 'shoes', 'layer', 'bag'],
  city: ['shoes', 'layer', 'bag', 'phrase', 'shirt', 'camera', 'nav', 'snack'],
  cozyTowns: ['shoes', 'layer', 'bag', 'phrase', 'camera', 'swim', 'towel', 'nav'],
  culinary: ['bag', 'shoes', 'sun', 'layer', 'phrase', 'shirt', 'nav', 'camera'],
  natureEscape: ['light', 'shoes', 'layer', 'nav', 'snack', 'swim', 'towel', 'camera'],
  // T431: the five styles the owner added on 2026-10-15.
  hostel: ['lock', 'towel', 'power', 'daypack', 'shoes', 'nav', 'phrase', 'bottle'],
  beachWeek: ['swim', 'towel', 'sun', 'shoes', 'shirt', 'bag', 'snack', 'camera'],
  rail: ['nav', 'power', 'snack', 'bottle', 'daypack', 'shoes', 'layer', 'phrase'],
  pilgrim: ['shoes', 'firstaid', 'layer', 'towel', 'drybag', 'bottle', 'sun', 'lock'],
  islandHopping: ['drybag', 'swim', 'towel', 'sun', 'shoes', 'power', 'daypack', 'layer'],
};
const COMMON = ['rain', 'sun', 'bottle', 'cash', 'power', 'firstaid', 'lock', 'daypack', 'shoes', 'layer',
  'camera', 'phrase', 'nav', 'snack', 'light', 'bag', 'towel'];

/** The key and params for a common reason, picking the variant the trip file
 *  can fill: the months when it names them, the country when it has one. */
function commonWhy(icon, trip) {
  const m = trip?.bestPeriod?.months;
  const days = trip?.durationDays || 7;
  const country = trip?.country;
  const base = `journey.pack.why.common.${icon}`;
  if (icon === 'rain' || icon === 'sun') {
    return Array.isArray(m) && m.length
      ? { whyKey: base, params: { fromMonth: m[0], toMonth: m[m.length - 1] } }
      : { whyKey: `${base}Season`, params: {} };
  }
  if (icon === 'cash' || icon === 'phrase') {
    return country ? { whyKey: base, params: { country } } : { whyKey: `${base}Region`, params: {} };
  }
  return { whyKey: base, params: { days } };
}

/**
 * The cells for a trip, 16 to 24 of them. Written notes lead, each under a
 * name no other cell of the trip carries; the type's standard kit tops up
 * with icons and names the written notes have not used.
 */
export function packCells(trip) {
  const taken = new Set();
  const cells = [];
  for (const note of trip?.packingNotes || []) {
    if (cells.length >= PACK_MAX) break;
    const c = noteToCell(note, taken);
    if (!c) continue;
    taken.add((c.label || c.name).toLowerCase());
    delete c.name;
    cells.push(c);
  }
  const written = cells.length;

  /* Derived cells are capped so a trip that wrote eight or more items shows
     at least as many written cells as derived ones. The cap and PACK_MIN can
     conflict (fewer than PACK_MIN / 2 written but eight or more is impossible
     at PACK_MIN 16, but a higher minimum would make it real); when they do,
     the minimum wins, because verify_pack_grid holds every grid to 16 to 24. */
  const cap = written >= 8 ? Math.max(written, PACK_MIN - written) : PACK_MAX;
  const target = Math.min(PACK_MIN, written + cap);

  const usedIcons = new Set(cells.map((c) => c.icon));
  const type = TYPE_KEY[trip?.tripTypeSlug] || null;
  const kitKey = `journey.pack.kit.${type || 'other'}`;
  const pool = [];
  if (TYPE_G.has(trip?.countryCode)) pool.push({ icon: 'adapter', whyKey: 'journey.pack.why.adapter', params: {} });
  for (const icon of (type && BY_TYPE[type]) || []) {
    pool.push({ icon, whyKey: `journey.pack.why.${type}.${icon}`, params: { days: trip?.durationDays || 7 } });
  }
  for (const icon of COMMON) pool.push({ icon, ...commonWhy(icon, trip) });

  for (const p of pool) {
    if (cells.length >= target) break;
    if (usedIcons.has(p.icon)) continue;
    const key = labelKey(p.icon);
    if (taken.has(PACK_EN[key].toLowerCase())) continue;
    usedIcons.add(p.icon);
    taken.add(PACK_EN[key].toLowerCase());
    cells.push({ icon: p.icon, labelKey: key, whyKey: p.whyKey, params: p.params, kitKey, derived: true });
  }
  return cells;
}

/** Month number (1 to 12) to its name in `lang`, English when Intl cannot. */
function monthName(n, lang) {
  try {
    return new Intl.DateTimeFormat(lang || 'en', { month: 'long', timeZone: 'UTC' })
      .format(new Date(Date.UTC(2024, n - 1, 15)));
  } catch {
    return String(n);
  }
}

/**
 * A cell to the two strings the page shows: { label, why }. `t(key, vars)` is
 * the app's translator (useI18n) or any function with the same shape; a key
 * it does not know comes back as itself, so PACK_EN covers the gap until the
 * catalogue rows land.
 */
export function resolvePackCell(cell, t, lang = 'en') {
  const tr = (key, vars) => {
    const out = t ? t(key, vars) : key;
    if (out && out !== key) return out;
    const en = PACK_EN[key] || key;
    return en.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
  };
  const label = cell.labelKey ? tr(cell.labelKey) : cell.label;
  if (!cell.derived) return { label, why: cell.why };
  const p = { ...(cell.params || {}) };
  if (p.fromMonth) p.from = monthName(p.fromMonth, lang);
  if (p.toMonth) p.to = monthName(p.toMonth, lang);
  return { label, why: `${tr(cell.whyKey, p)} ${tr(cell.kitKey)}` };
}
