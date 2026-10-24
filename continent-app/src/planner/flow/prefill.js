/**
 * prefill.js, what a sentence already answers (T654).
 *
 * The planner opens with one free field ("Where to, when, who?"). Whatever
 * the traveller types there fills the questions it answers, so the screens
 * after it arrive already ticked and the traveller only confirms. This is a
 * plain word match in the six app languages, not a model: it reads only what
 * is clearly said, and a question it is unsure about stays unanswered.
 *
 * prefillFromText(text, { countries, today }) -> { patch, answered, countries }
 *   patch      a partial settings object (booked, party, priority, when, guide)
 *   answered   the question ids the patch answers
 *   countries  catalogue country names named in the text
 */

const WORDS = {
  solo: ['alone', 'solo', 'by myself', 'on my own', 'alleen', 'allein', 'seul', 'seule', 'solo', 'da solo', 'sola', 'solo'],
  couple: ['couple', 'my wife', 'my husband', 'my partner', 'girlfriend', 'boyfriend', 'with my love', 'two of us', 'koppel', 'mijn vrouw', 'mijn man', 'mijn vriendin', 'mijn vriend', 'met z\'n tweeën', 'met zijn tweeën', 'meine frau', 'mein mann', 'meine freundin', 'zu zweit', 'en couple', 'ma femme', 'mon mari', 'ma copine', 'pareja', 'mi mujer', 'mi marido', 'in coppia', 'mia moglie', 'mio marito'],
  family: ['family', 'kids', 'children', 'my son', 'my daughter', 'gezin', 'familie', 'kinderen', 'kindern', 'kinder', 'famille', 'enfants', 'familia', 'niños', 'hijos', 'famiglia', 'bambini', 'figli'],
  friends: ['friends', 'mates', 'vrienden', 'freunde', 'freundinnen', 'amis', 'amies', 'amigos', 'amigas', 'amici'],
  group: ['group', 'groep', 'gruppe', 'groupe', 'grupo', 'gruppo'],
  price: ['cheap', 'budget', 'low cost', 'as little as possible', 'goedkoop', 'budget', 'günstig', 'billig', 'pas cher', 'bon marché', 'barato', 'económico', 'economico', 'low cost'],
  comfort: ['luxury', 'luxurious', 'comfort', 'five star', '5 star', 'treat ourselves', 'luxe', 'luxueus', 'luxus', 'komfort', 'luxe', 'confort', 'lujo', 'comodidad', 'lusso', 'comfort'],
  flights: ['booked flights', 'booked a flight', 'flights booked', 'flight booked', 'have flights', 'have a flight', 'tickets booked', 'vlucht geboekt', 'vluchten geboekt', 'flug gebucht', 'flüge gebucht', 'vol réservé', 'vols réservés', 'vuelo reservado', 'vuelos reservados', 'volo prenotato', 'voli prenotati'],
  stays: ['hotel booked', 'booked a hotel', 'booked an airbnb', 'airbnb booked', 'have a hotel', 'accommodation booked', 'hotel geboekt', 'verblijf geboekt', 'unterkunft gebucht', 'hotel gebucht', 'hôtel réservé', 'logement réservé', 'hotel reservado', 'alojamiento reservado', 'hotel prenotato', 'alloggio prenotato'],
  any: ['any time', 'anytime', 'whenever', 'cheapest time', 'maakt niet uit wanneer', 'egal wann', 'n\'importe quand', 'cuando sea', 'quando vuoi', 'in qualsiasi momento'],
  week: ['a week', 'one week', 'een week', 'eine woche', 'une semaine', 'una semana', 'una settimana'],
  weekend: ['weekend', 'wochenende', 'week-end', 'fin de semana', 'fine settimana'],
  roadtrip: ['road trip', 'roadtrip', 'rondreis', 'rundreise', 'circuit', 'ruta en coche', 'viaggio on the road'],
  overland: ['by train', 'train only', 'no flying', 'no flights', 'met de trein', 'mit dem zug', 'en train', 'en tren', 'in treno'],
};

/** The words for each TRIP_TYPES key the like question offers. */
const LIKE_WORDS = {
  beach: ['beach', 'beaches', 'sea', 'strand', 'zee', 'plage', 'mer', 'playa', 'spiaggia', 'mare'],
  hiking: ['hike', 'hiking', 'hikes', 'trekking', 'wandelen', 'wandern', 'randonnée', 'senderismo', 'escursioni'],
  lakes: ['lake', 'lakes', 'meren', 'bergsee', 'lac', 'lacs', 'lago', 'laghi'],
  culture: ['culture', 'museum', 'museums', 'history', 'cultuur', 'kultur', 'geschichte', 'cultura', 'historia', 'storia'],
  city: ['city', 'cities', 'city trip', 'stad', 'steden', 'stadt', 'städte', 'ville', 'villes', 'ciudad', 'ciudades', 'città'],
  food: ['food', 'foodie', 'wine', 'eten', 'wijn', 'essen', 'wein', 'gastronomie', 'cuisine', 'vin', 'comida', 'vino', 'cibo'],
  nightlife: ['party', 'nightlife', 'clubbing', 'uitgaan', 'feesten', 'nachtleben', 'feiern', 'fête', 'vie nocturne', 'fiesta', 'vida nocturna', 'vita notturna'],
  cycling: ['cycling', 'bike', 'biking', 'fietsen', 'radfahren', 'vélo', 'bicicleta', 'bici', 'ciclismo'],
  ski: ['ski', 'skiing', 'snowboard', 'skiën', 'skifahren', 'esquí', 'sci'],
  wellness: ['spa', 'wellness', 'relax', 'thermal', 'ontspannen', 'entspannen', 'détente', 'relajarse', 'relax'],
  islands: ['island', 'islands', 'eiland', 'eilanden', 'insel', 'inseln', 'île', 'îles', 'isla', 'islas', 'isola', 'isole'],
  hidden: ['off the beaten track', 'hidden gem', 'quiet', 'rustig', 'ruhig', 'tranquille', 'tranquilo', 'tranquillo'],
};

const MONTHS = [
  ['january', 'januari', 'januar', 'janvier', 'enero', 'gennaio', 'jan'],
  ['february', 'februari', 'februar', 'février', 'febrero', 'febbraio', 'feb'],
  ['march', 'maart', 'märz', 'mars', 'marzo'],
  ['april', 'april', 'avril', 'abril', 'aprile', 'apr'],
  ['may', 'mei', 'mai', 'mayo', 'maggio'],
  ['june', 'juni', 'juin', 'junio', 'giugno', 'jun'],
  ['july', 'juli', 'juillet', 'julio', 'luglio', 'jul'],
  ['august', 'augustus', 'august', 'août', 'agosto', 'aug'],
  ['september', 'september', 'septembre', 'septiembre', 'settembre', 'sep', 'sept'],
  ['october', 'oktober', 'octobre', 'octubre', 'ottobre', 'oct', 'okt'],
  ['november', 'november', 'novembre', 'noviembre', 'nov'],
  ['december', 'december', 'dezember', 'décembre', 'diciembre', 'dicembre', 'dec', 'dez'],
];

/** Lowercased, accents kept (the word lists carry them), spaces squeezed. */
const clean = (s) => ` ${String(s || '').toLowerCase().replace(/[.,;:!?()"]/g, ' ').replace(/\s+/g, ' ').trim()} `;
/** A whole word or phrase match, so "sea" does not fire inside "season". */
const has = (text, w) => text.includes(` ${w} `);
const any = (text, list) => list.some((w) => has(text, w));

/** "5 days", "10 nachten", "2 weeks" -> nights. */
function readNights(text) {
  const m = text.match(/ (\d{1,2}) (days?|dagen|dag|tage?n?|jours?|días?|dias?|giorni|giorno) /);
  if (m) return Math.max(1, Number(m[1]) - 1) || 1;
  const n = text.match(/ (\d{1,2}) (nights?|nachten|nacht|nächte|nuits?|noches?|notti|notte) /);
  if (n) return Number(n[1]);
  const w = text.match(/ (\d) (weeks?|weken|wochen|semaines?|semanas?|settimane) /);
  if (w) return Number(w[1]) * 7;
  if (any(text, WORDS.week)) return 7;
  if (any(text, WORDS.weekend)) return 2;
  return 0;
}

/** "with 4", "4 of us", "we are 5" -> the head count, else 0. */
function readCount(text) {
  const m = text.match(/ (?:with|met|mit|avec|con) (\d{1,2}) /) || text.match(/ (\d{1,2}) (?:of us|people|persons|personen|personnes|personas|persone) /)
    || text.match(/ (?:we are|we're|wij zijn|we zijn|wir sind|nous sommes|somos|siamo) (\d{1,2}) /);
  return m ? Number(m[1]) : 0;
}

export function prefillFromText(text, { countries = [] } = {}) {
  const tx = clean(text);
  const patch = {};
  const answered = [];
  if (tx.trim() === '') return { patch, answered, countries: [] };

  // Who.
  const count = readCount(tx);
  let kind = '';
  if (any(tx, WORDS.family)) kind = 'family';
  else if (any(tx, WORDS.solo)) kind = 'solo';
  else if (any(tx, WORDS.couple)) kind = 'couple';
  else if (any(tx, WORDS.friends)) kind = 'friends';
  else if (any(tx, WORDS.group)) kind = 'group';
  if (kind || count) {
    const k = kind || (count === 1 ? 'solo' : count === 2 ? 'couple' : count <= 5 ? 'friends' : 'group');
    const adults = kind === 'family' ? 2 : (count || { solo: 1, couple: 2, friends: 4, group: 6 }[k]);
    const kids = kind === 'family' ? Math.max(1, count ? count - 2 : 2) : 0;
    patch.party = { kind: k, adults, kids, kidAges: [], babies: 0, slowWalkers: false };
    answered.push('who');
  }

  // What matters most.
  if (any(tx, WORDS.comfort)) { patch.priority = 'comfort'; answered.push('priority'); }
  else if (any(tx, WORDS.price)) { patch.priority = 'price'; answered.push('priority'); }

  // What is booked.
  const flights = any(tx, WORDS.flights);
  const stays = any(tx, WORDS.stays);
  if (flights || stays) {
    patch.booked = { flights, stays, car: false, tickets: false };
    answered.push('booked');
  }

  // When.
  const months = MONTHS.map((names, i) => (names.some((n) => has(tx, n)) ? i + 1 : 0)).filter(Boolean);
  const nights = readNights(tx);
  if (months.length) {
    patch.when = { mode: 'months', start: '', end: '', months, nights: nights || 7 };
    answered.push('when');
  } else if (any(tx, WORDS.any)) {
    patch.when = { mode: 'any', start: '', end: '', months: [], nights: nights || 7 };
    answered.push('when');
  } else if (nights) {
    patch.when = { mode: 'any', start: '', end: '', months: [], nights };
  }

  // Help me choose.
  const likes = Object.entries(LIKE_WORDS).filter(([, ws]) => any(tx, ws)).map(([k]) => k).slice(0, 3);
  const guide = {};
  if (likes.length) guide.likes = likes;
  if (any(tx, WORDS.roadtrip)) guide.shape = 'road';
  if (any(tx, WORDS.overland)) guide.reach = 'overland';
  if (Object.keys(guide).length) patch.guide = guide;

  const named = countries.filter((c) => c && has(tx, String(c).toLowerCase()));
  return { patch, answered, countries: named };
}
