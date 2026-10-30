/**
 * parseTrip.js, one sentence about a trip read into the planner's answers
 * (T857, plan flow v3 Batch B).
 *
 * The planner opens with one free field, Tell Carta. What the traveller types
 * there is read here, on the device, with no model and no network: the
 * places (countries and towns, from the app's own catalogue), the month or
 * the dates, the nights, who goes (adults, children, babies), what they like,
 * where they leave from, the budget (a person or for the group, for the trip
 * or a day), what is already booked, the stay type and the way of travel.
 *
 * It is built from the two readers the app had: Ask Carta's parseIntent
 * (lib/ask/intent.js: the catalogue vocabulary, money with its cues, head
 * counts, months and seasons) and the planner's word lists (flow/prefill.js,
 * T654, now a thin wrapper over this file). It reads only what is clearly
 * said; a field it is unsure about stays out, and the planner asks it.
 *
 * Every field keeps where its answer came from: `from: 'words'` and `said`,
 * the words of the sentence that gave it (row T856-c), so the planner can
 * tell an answer the words gave from one a screen gave and let words typed
 * again replace only their own.
 *
 *   parseTrip(text, { vocab, lang, today, destinations, origins })
 *     -> { text, fields: { places, when, nights, party, likes, from, budget,
 *                           booked, stay, way, priority, guide } }
 *        each field { value, from: 'words', said }
 *
 *   tripVocab({ destinations, lang, index, lexicon })   the vocabulary
 *   applyTrip(settings, parsed, { keep })                the settings it gives
 *
 * Plain JS with no React and no browser globals, so node tests can hold it.
 */
import { buildAskVocab, parseIntent } from '../ask/intent.js';
import { foldName } from '../searchIndex.js';

export const LANGS = ['en', 'nl', 'de', 'fr', 'es', 'it'];

// ---- Word lists (written plain, folded once below) --------------------------

const NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14,
  een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12, veertien: 14,
  ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, funf: 5, sechs: 6, sieben: 7, neun: 9, zehn: 10, zwolf: 12, vierzehn: 14,
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, huit: 8, neuf: 9, dix: 10, douze: 12, quinze: 15,
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, quince: 15,
  due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, dodici: 12, quindici: 15,
  a: 1, an: 1,
};
// "sept" (French seven) is also a month abbreviation elsewhere: only as a count.
NUM.sept = 7;

const NIGHT_WORDS = ['night', 'nights', 'nacht', 'nachten', 'nachte', 'nuit', 'nuits', 'noche', 'noches', 'notte', 'notti', 'overnachtingen'];
const DAY_WORDS = ['day', 'days', 'dag', 'dagen', 'tag', 'tage', 'tagen', 'jour', 'jours', 'journee', 'journees', 'dia', 'dias', 'giorno', 'giorni'];
const WEEK_WORDS = ['week', 'weeks', 'weken', 'woche', 'wochen', 'semaine', 'semaines', 'semana', 'semanas', 'settimana', 'settimane'];
const WEEKS_PHRASES = [
  [14, ['a fortnight', 'fortnight']],
  [3, ['long weekend', 'a long weekend', 'lang weekend', 'een lang weekend', 'langes wochenende', 'verlangertes wochenende',
    'long week end', 'puente', 'ponte']],
  [2, ['weekend', 'a weekend', 'een weekend', 'wochenende', 'week end', 'fin de semana', 'fine settimana', 'weekend lungo']],
];

const KIND = {
  solo: ['alone', 'solo', 'by myself', 'on my own', 'alleen', 'in mijn eentje', 'allein', 'seul', 'seule', 'da solo', 'da sola', 'sola', 'solo trip'],
  couple: ['couple', 'a couple', 'my wife', 'my husband', 'my partner', 'my girlfriend', 'my boyfriend', 'my fiance', 'my fiancee',
    'girlfriend', 'boyfriend', 'with my love', 'two of us', 'the two of us', 'koppel', 'stel', 'mijn vrouw', 'mijn man', 'mijn vriendin',
    'mijn vriend', 'mijn partner', 'met z n tweeen', 'met zijn tweeen', 'met ons tweeen', 'meine frau', 'mein mann', 'meine freundin',
    'mein freund', 'meinem partner', 'meiner partnerin', 'zu zweit', 'als paar', 'en couple', 'ma femme', 'mon mari', 'ma copine',
    'mon copain', 'mon compagnon', 'ma compagne', 'a deux', 'pareja', 'en pareja', 'mi mujer', 'mi marido', 'mi novia', 'mi novio',
    'mi pareja', 'in coppia', 'mia moglie', 'mio marito', 'la mia ragazza', 'il mio ragazzo', 'in due'],
  family: ['family', 'the family', 'my family', 'gezin', 'het gezin', 'ons gezin', 'familie', 'famille', 'en famille', 'familia',
    'en familia', 'famiglia', 'in famiglia'],
  friends: ['friends', 'mates', 'my friends', 'vrienden', 'vriendinnen', 'freunde', 'freundinnen', 'amis', 'amies', 'copains', 'amigos', 'amigas', 'amici', 'amiche'],
  group: ['group', 'a group', 'groep', 'gruppe', 'groupe', 'grupo', 'gruppo'],
};
const FRIEND_ONE = ['friend', 'a friend', 'my friend', 'een vriend', 'een vriendin', 'einem freund', 'einer freundin', 'un ami', 'une amie', 'un amigo', 'una amiga', 'un amico', 'un amica'];
const CHILD_WORDS = ['child', 'children', 'kids', 'kid', 'kind', 'kinderen', 'kinderen', 'kinder', 'kindern', 'enfant', 'enfants',
  'nino', 'ninos', 'nina', 'ninas', 'hijo', 'hijos', 'hija', 'hijas', 'bambino', 'bambini', 'bambina', 'bambine', 'figli', 'figlio', 'figlia',
  'son', 'sons', 'daughter', 'daughters', 'toddler', 'toddlers', 'peuter', 'peuters', 'kleuter', 'zoon', 'zonen', 'dochter', 'dochters', 'sohn', 'sohne', 'tochter', 'tochter', 'fils', 'fille', 'filles'];
const CHILD_ONE = ['son', 'daughter', 'toddler', 'peuter', 'kleuter', 'zoon', 'dochter', 'sohn', 'tochter', 'fils', 'fille', 'hijo', 'hija', 'figlio', 'figlia', 'kid', 'child', 'kind', 'enfant', 'bambino', 'bambina', 'nino', 'nina'];
const BABY_WORDS = ['baby', 'babies', 'babys', 'baby s', 'infant', 'infants', 'bebe', 'bebes', 'nourrisson', 'nourrissons', 'neonato', 'neonati', 'neonata', 'kleinkind'];
const PEOPLE_WORDS = ['people', 'persons', 'person', 'adults', 'adult', 'pax', 'mensen', 'personen', 'persoon', 'volwassenen', 'volwassene',
  'leute', 'erwachsene', 'erwachsenen', 'personnes', 'personne', 'adultes', 'adulte', 'personas', 'persona', 'adultos', 'adulto',
  'persone', 'adulti', 'adulto', 'travellers', 'travelers', 'of us'];
const DUTCH_GROUP = { tweeen: 2, drieen: 3, vieren: 4, vijven: 5, zessen: 6, zevenen: 7, achten: 8 };
const WE_ARE = ['we are', 'we re', 'there are', 'wij zijn', 'we zijn', 'wir sind', 'nous sommes', 'on est', 'somos', 'siamo'];
const PARTY_PREP = ['with', 'met', 'mit', 'avec', 'con', 'for', 'voor', 'fur', 'pour', 'para', 'per'];

const LIKE_WORDS = {
  beach: ['beach', 'beaches', 'the sea', 'seaside', 'by the sea', 'swim in the sea', 'strand', 'stranden', 'zee', 'aan zee', 'strande', 'am meer', 'meer und strand',
    'plage', 'plages', 'la mer', 'bord de mer', 'playa', 'playas', 'el mar', 'spiaggia', 'spiagge', 'mare', 'al mare'],
  hiking: ['hike', 'hiking', 'hikes', 'trekking', 'walking', 'walks', 'wandelen', 'wandeling', 'wandelingen', 'wandern', 'wanderung', 'wanderungen',
    'randonnee', 'randonnees', 'rando', 'senderismo', 'caminar', 'escursioni', 'escursione', 'camminare'],
  lakes: ['lake', 'lakes', 'meren', 'bergsee', 'seen', 'lac', 'lacs', 'lago', 'laghi'],
  culture: ['culture', 'museum', 'museums', 'history', 'art', 'cultuur', 'musea', 'geschiedenis', 'kunst', 'kultur', 'museen', 'geschichte',
    'musee', 'musees', 'histoire', 'cultura', 'museos', 'historia', 'arte', 'musei', 'storia'],
  city: ['city', 'cities', 'city trip', 'city break', 'stad', 'steden', 'stedentrip', 'stadt', 'stadte', 'stadtereise', 'ville', 'villes',
    'ciudad', 'ciudades', 'citta'],
  food: ['food', 'foodie', 'good food', 'wine', 'eating out', 'eten', 'lekker eten', 'wijn', 'essen', 'gutes essen', 'wein', 'gastronomie',
    'cuisine', 'bonne cuisine', 'vin', 'comida', 'buena comida', 'vino', 'tapas', 'cibo', 'buon cibo', 'gastronomia'],
  nightlife: ['party', 'parties', 'nightlife', 'clubbing', 'uitgaan', 'feesten', 'nachtleben', 'feiern', 'fete', 'faire la fete', 'vie nocturne',
    'fiesta', 'vida nocturna', 'vita notturna'],
  cycling: ['cycling', 'bike', 'biking', 'bikes', 'fietsen', 'fiets', 'radfahren', 'fahrrad', 'velo', 'a velo', 'bicicleta', 'bici', 'ciclismo', 'in bici'],
  ski: ['ski', 'skiing', 'snowboard', 'snowboarding', 'skien', 'skieen', 'skifahren', 'skiurlaub', 'esqui', 'sci', 'sciare'],
  wellness: ['spa', 'wellness', 'relax', 'relaxing', 'thermal', 'sauna', 'ontspannen', 'entspannen', 'detente', 'relajarse', 'relajante', 'rilassarsi'],
  islands: ['island', 'islands', 'eiland', 'eilanden', 'insel', 'inseln', 'ile', 'iles', 'isla', 'islas', 'isola', 'isole'],
  hidden: ['off the beaten track', 'off the beaten path', 'hidden gem', 'hidden gems', 'quiet', 'not touristy', 'rustig', 'ruhig', 'ruhige',
    'tranquille', 'tranquilo', 'tranquila', 'tranquillo', 'tranquilla'],
};

const PRIORITY = {
  price: ['cheap', 'cheaply', 'budget', 'low cost', 'as little as possible', 'not too expensive', 'goedkoop', 'goedkope', 'gunstig', 'billig',
    'pas cher', 'bon marche', 'petit budget', 'barato', 'barata', 'economico', 'economica', 'low cost'],
  comfort: ['luxury', 'luxurious', 'comfort', 'comfortable', 'five star', 'treat ourselves', 'treat myself', 'luxe', 'luxueus', 'luxus',
    'luxurios', 'komfort', 'confort', 'lujo', 'comodidad', 'lusso', 'comodita'],
};

const BOOK_VERB = ['booked', 'reserved', 'have', 'got', 'geboekt', 'gereserveerd', 'hebben', 'heb', 'gebucht', 'reserviert', 'haben',
  'reserve', 'reserves', 'reservee', 'reservees', 'reservado', 'reservados', 'reservada', 'reservadas', 'prenotato', 'prenotati', 'prenotata', 'prenotate'];
const BOOK_STRONG = ['booked', 'reserved', 'geboekt', 'gereserveerd', 'gebucht', 'reserviert', 'reserve', 'reserves', 'reservee', 'reservees',
  'reservado', 'reservados', 'reservada', 'reservadas', 'prenotato', 'prenotati', 'prenotata', 'prenotate'];
const BOOK_OBJECT = {
  flights: ['flight', 'flights', 'plane tickets', 'plane ticket', 'vlucht', 'vluchten', 'vliegtickets', 'flug', 'fluge', 'vol', 'vols', 'billets d avion',
    'vuelo', 'vuelos', 'volo', 'voli'],
  stays: ['hotel', 'hotels', 'airbnb', 'accommodation', 'stay', 'apartment', 'hostel', 'verblijf', 'onderdak', 'unterkunft', 'ferienwohnung',
    'hotel s', 'logement', 'hebergement', 'alojamiento', 'alloggio', 'albergo'],
  car: ['car', 'rental car', 'hire car', 'huurauto', 'auto', 'mietwagen', 'voiture', 'voiture de location', 'coche', 'coche de alquiler', 'macchina', 'auto a noleggio'],
};
const NOTHING_BOOKED = ['nothing booked', 'nothing is booked', 'not booked anything', 'haven t booked anything', 'nothing yet', 'niets geboekt',
  'nog niets geboekt', 'nichts gebucht', 'noch nichts gebucht', 'rien reserve', 'rien de reserve', 'nada reservado', 'nulla prenotato', 'niente prenotato'];

// T862: the words for the four stay types (lib/sleepGroups.js STAY_TYPES):
// a hostel (dorm, a hostel's private room), a room in a home, an apartment
// or holiday home (the entire place, 'home'), a hotel with its stars.
const STAY = [
  ['private', ['private room in a hostel', 'hostel private room', 'private room']],
  ['dorm', ['hostel', 'hostels', 'dorm', 'dorms', 'youth hostel', 'jeugdherberg', 'jugendherberge', 'auberge de jeunesse', 'auberges de jeunesse',
    'albergue', 'albergue juvenil', 'ostello', 'ostelli']],
  ['room', ['room in a home', 'a room in a home', 'b b', 'b and b', 'bed and breakfast', 'guesthouse', 'guest house', 'gastenkamer', 'gastenverblijf',
    'pension', 'gastezimmer', 'chambre d hote', 'chambres d hotes', 'chambre d hotes', 'casa de huespedes', 'habitacion en casa', 'affittacamere',
    'kamer in een woning', 'zimmer in einer wohnung', 'chambre chez l habitant', 'habitacion en una casa', 'camera in una casa']],
  ['home', ['apartment', 'apartments', 'airbnb', 'holiday home', 'holiday house', 'holiday let', 'cottage', 'villa', 'chalet',
    'appartement', 'vakantiehuis', 'vakantiewoning', 'huisje', 'ferienwohnung', 'ferienhaus', 'gite', 'maison de vacances', 'location de vacances',
    'apartamento', 'casa rural', 'casa de vacaciones', 'appartamento', 'casa vacanze', 'casa vacanza',
    'flat', 'entire place', 'whole place', 'entire home', 'hele woning', 'ganze unterkunft', 'logement entier', 'alojamiento entero', 'alloggio intero']],
  ['hotel', ['hotel', 'hotels', 'albergo', 'alberghi']],
];
const STARS = ['star', 'stars', 'ster', 'sterren', 'sterne', 'stern', 'etoile', 'etoiles', 'estrella', 'estrellas', 'stella', 'stelle'];

const WAY = {
  plane: ['by plane', 'by air', 'fly', 'flying', 'fly there', 'vliegen', 'met het vliegtuig', 'vliegtuig', 'fliegen', 'mit dem flugzeug',
    'en avion', 'avion', 'en avion', 'volar', 'en avion', 'in aereo', 'aereo'],
  train: ['by train', 'train', 'trains', 'rail', 'met de trein', 'trein', 'mit dem zug', 'mit der bahn', 'zug', 'bahn', 'en train', 'en tren',
    'tren', 'in treno', 'treno'],
  bus: ['by bus', 'by coach', 'coach', 'bus', 'met de bus', 'flixbus', 'mit dem bus', 'fernbus', 'en bus', 'en autocar', 'autocar', 'en autobus',
    'autobus', 'in autobus', 'pullman'],
  car: ['by car', 'drive', 'driving', 'road trip', 'roadtrip', 'met de auto', 'rijden', 'mit dem auto', 'auto fahren', 'en voiture',
    'en coche', 'conducir', 'in macchina', 'in auto'],
};
const NO_FLY = ['no flying', 'no flights', 'not fly', 'don t want to fly', 'without flying', 'niet vliegen', 'zonder vliegen', 'nicht fliegen',
  'ohne fliegen', 'sans avion', 'pas en avion', 'sin volar', 'sin avion', 'senza aereo', 'senza volare', 'train only', 'only by train'];
const NO_CAR = ['no car', 'without a car', 'without car', 'car free', 'zonder auto', 'geen auto', 'ohne auto', 'kein auto', 'sans voiture',
  'pas de voiture', 'sin coche', 'sin auto', 'senza auto', 'senza macchina'];
// T863: the flight first, as the words say it ("just a cheap flight", "eerst de vlucht").
const FLIGHT_FIRST = ['flight first', 'the flight first', 'just a flight', 'just the flight', 'only a flight', 'only the flight', 'flight only',
  'cheap flight', 'cheap flights', 'a cheap flight', 'cheapest flight', 'cheapest flights', 'find me a flight', 'find a flight',
  'eerst de vlucht', 'alleen een vlucht', 'alleen de vlucht', 'alleen vlucht', 'goedkope vlucht', 'goedkope vluchten', 'goedkoopste vlucht',
  'nur einen flug', 'nur den flug', 'nur flug', 'billigflug', 'billigfluge', 'gunstiger flug', 'gunstige fluge', 'zuerst den flug',
  'juste un vol', 'juste le vol', 'seulement le vol', 'seulement un vol', 'vol pas cher', 'vols pas chers', 'd abord le vol',
  'solo el vuelo', 'solo un vuelo', 'vuelo barato', 'vuelos baratos', 'primero el vuelo',
  'solo il volo', 'solo un volo', 'volo economico', 'voli economici', 'prima il volo'];
const ROAD = ['road trip', 'roadtrip', 'rondreis', 'rundreise', 'road trip en voiture', 'circuit', 'ruta en coche', 'viaggio on the road'];

const ORIGIN = ['from', 'leaving from', 'starting from', 'starting in', 'departing from', 'flying from', 'flying out of', 'out of', 'we live in',
  'i live in', 'based in', 'vanuit', 'vertrek uit', 'vertrekken uit', 'vertrekkend uit', 'vertrek vanuit', 'wonen in', 'woon in', 'ab', 'aus',
  'von', 'abflug', 'abflug ab', 'wohnen in', 'depuis', 'au depart de', 'en partant de', 'de', 'habitons a', 'desde', 'saliendo de', 'salida desde',
  'vivimos en', 'partendo da', 'in partenza da', 'da', 'viviamo a'];
// "de", "da" and "von" are also "of": they count only before a known place
// with nothing else in between, and never after a number ("del 3 al 10 de julio").
const WEAK_ORIGIN = new Set(['de', 'da', 'von', 'out of']);

const ANY_TIME = ['any time', 'anytime', 'whenever', 'cheapest time', 'flexible dates', 'dates are flexible', 'maakt niet uit wanneer',
  'flexibel', 'egal wann', 'n importe quand', 'dates flexibles', 'cuando sea', 'fechas flexibles', 'quando vuoi', 'in qualsiasi momento', 'date flessibili'];
const RANGE_TO = ['to', 'till', 'until', 'through', 'and', 'tot', 'en', 'bis', 'au', 'a', 'al', 'hasta', 'fino al', 'et'];
const PER_PERSON = ['per person', 'a person', 'each', 'pp', 'p p', 'a head', 'per head', 'per persoon', 'p p', 'pro person', 'pro kopf',
  'je person', 'par personne', 'chacun', 'por persona', 'cada uno', 'a persona', 'per persona', 'ciascuno', 'a testa'];
const PER_GROUP = ['for all', 'for all of us', 'for us', 'for both', 'for the two of us', 'for the family', 'together', 'in total for',
  'all in', 'voor ons', 'voor allebei', 'samen', 'voor het gezin', 'fur uns', 'zusammen', 'fur alle', 'pour nous', 'pour tous', 'a deux',
  'para todos', 'para los dos', 'entre todos', 'per tutti', 'in due', 'per noi'];
const PER_DAY = ['a day', 'per day', 'each day', 'daily', 'a night', 'per night', 'per dag', 'een dag', 'pro tag', 'am tag', 'par jour',
  'por dia', 'al dia', 'al giorno', 'a notte', 'per notte'];
const NEXT_MONTH = ['next month', 'volgende maand', 'nachsten monat', 'le mois prochain', 'mois prochain', 'el proximo mes', 'proximo mes',
  'il mese prossimo', 'mese prossimo'];
const SEASONS = [
  [[6, 7, 8], ['this summer', 'in summer', 'summer', 'zomer', 'deze zomer', 'in de zomer', 'zomervakantie', 'sommer', 'im sommer', 'sommerferien',
    'ete', 'cet ete', 'en ete', 'verano', 'en verano', 'este verano', 'estate', 'in estate', 'questa estate']],
  [[12, 1, 2], ['this winter', 'in winter', 'winter', 'deze winter', 'in de winter', 'im winter', 'hiver', 'cet hiver', 'en hiver', 'invierno',
    'en invierno', 'inverno', 'in inverno', 'questo inverno']],
  [[3, 4, 5], ['this spring', 'in spring', 'spring', 'lente', 'voorjaar', 'in de lente', 'fruhling', 'fruhjahr', 'im fruhling', 'printemps',
    'au printemps', 'primavera', 'en primavera', 'in primavera']],
  [[9, 10, 11], ['this autumn', 'in autumn', 'autumn', 'this fall', 'in the fall', 'herfst', 'in de herfst', 'herbst', 'im herbst', 'automne',
    'en automne', 'otono', 'en otono', 'autunno', 'in autunno']],
];
// Month names in the six languages; short forms only where they are no
// other word ("mar" is the sea in Spanish, "set" and "ago" are English).
const MONTH_NAMES = [
  ['january', 'januari', 'januar', 'janvier', 'enero', 'gennaio', 'jan', 'janv'],
  ['february', 'februari', 'februar', 'fevrier', 'febrero', 'febbraio', 'feb', 'fevr'],
  ['march', 'maart', 'marz', 'mars', 'marzo', 'mrt'],
  ['april', 'avril', 'abril', 'aprile', 'apr'],
  ['may', 'mei', 'mai', 'mayo', 'maggio'],
  ['june', 'juni', 'juin', 'junio', 'giugno', 'jun'],
  ['july', 'juli', 'juillet', 'julio', 'luglio', 'jul'],
  ['august', 'augustus', 'aout', 'agosto', 'aug'],
  ['september', 'septembre', 'septiembre', 'settembre', 'sep'],
  ['october', 'oktober', 'octobre', 'octubre', 'ottobre', 'oct', 'okt'],
  ['november', 'novembre', 'noviembre', 'nov'],
  ['december', 'dezember', 'decembre', 'diciembre', 'dicembre', 'dec', 'dez'],
];
// "May" and "mars" are words too ("I may", "Mars bar"): they count as a month
// next to a cue word or a day number.
const SOFT_MONTHS = new Set(['may', 'mars', 'jan', 'sep', 'dec']);
const MONTH_CUES = new Set(['in', 'early', 'late', 'mid', 'end', 'of', 'from', 'to', 'until', 'till', 'through', 'and', 'or', 'next', 'this',
  'begin', 'eind', 'half', 'en', 'au', 'debut', 'fin', 'mi', 'im', 'anfang', 'ende', 'mitte', 'de', 'a', 'en', 'nel', 'di', 'fine', 'inizio', 'el', 'o', 'ou', 'oder', 'of', 'tot', 'bis']);

// Words that are also catalogue place names: a place only when typed with a
// capital (or the sentence has no capitals at all and the word is not here).
const COMMON = new Set(['nice', 'split', 'bath', 'reading', 'como', 'sale', 'mar', 'leer', 'best', 'gap', 'sete', 'sete', 'vik', 'luz', 'bus',
  'van', 'ede', 'oss', 'hum', 'zee', 'see', 'als', 'aus', 'bad', 'hall', 'lens', 'fly', 'nancy', 'tours', 'pau', 'ham']);
const STOPW = new Set('the and or de la le el il lo van von der den das des du los las een het und et y e o of to in on at for with by my our we us me are is be was'.split(' '));
const BUDGET_CUE = ['budget', 'total', 'in total', 'spend', 'max', 'maximum', 'up to', 'under', 'around', 'about', 'roughly', 'tops', 'totaal',
  'uitgeven', 'maximaal', 'rond de', 'gesamt', 'ausgeben', 'maximal', 'etwa', 'depenser', 'environ', 'jusqu a', 'gastar', 'presupuesto', 'hasta',
  'unos', 'spendere', 'circa', 'fino a', 'massimo'];

// ---- Folding -----------------------------------------------------------------

const f = (s) => foldName(s).split(/[\s,;/.!?()"“”:+&]+/).filter(Boolean).join(' ');
const fold = (list) => [...new Set(list.map(f).filter(Boolean))].sort((a, b) => b.split(' ').length - a.split(' ').length);
const L = {
  night: new Set(NIGHT_WORDS.map(f)), day: new Set(DAY_WORDS.map(f)), week: new Set(WEEK_WORDS.map(f)),
  weeks: WEEKS_PHRASES.map(([n, v]) => [n, fold(v)]),
  kind: Object.entries(KIND).map(([k, v]) => [k, fold(v)]), friendOne: fold(FRIEND_ONE),
  child: new Set(CHILD_WORDS.map(f)), childOne: new Set(CHILD_ONE.map(f)), baby: fold(BABY_WORDS), people: fold(PEOPLE_WORDS),
  weAre: fold(WE_ARE), prep: new Set(PARTY_PREP.map(f)),
  likes: Object.entries(LIKE_WORDS).map(([k, v]) => [k, fold(v)]),
  priority: Object.entries(PRIORITY).map(([k, v]) => [k, fold(v)]),
  bookVerb: new Set(BOOK_VERB.map(f)), bookStrong: new Set(BOOK_STRONG.map(f)),
  bookObj: Object.entries(BOOK_OBJECT).map(([k, v]) => [k, fold(v)]), nothingBooked: fold(NOTHING_BOOKED),
  stay: STAY.map(([k, v]) => [k, fold(v)]), stars: new Set(STARS.map(f)),
  way: Object.entries(WAY).map(([k, v]) => [k, fold(v)]), noFly: fold(NO_FLY), noCar: fold(NO_CAR), road: fold(ROAD), flightFirst: fold(FLIGHT_FIRST),
  budgetCue: fold(BUDGET_CUE), origin: fold(ORIGIN), anyTime: fold(ANY_TIME), rangeTo: fold(RANGE_TO),
  perPerson: fold(PER_PERSON), perGroup: fold(PER_GROUP), perDay: fold(PER_DAY), nextMonth: fold(NEXT_MONTH),
  seasons: SEASONS.map(([m, v]) => [m, fold(v)]),
};
const MONTH_OF = new Map();
MONTH_NAMES.forEach((names, i) => names.forEach((n) => MONTH_OF.set(f(n), i + 1)));
for (const lang of LANGS) {
  let fmt = null;
  try { fmt = new Intl.DateTimeFormat(lang, { month: 'long' }); } catch { /* old engine */ }
  if (!fmt) continue;
  for (let m = 1; m <= 12; m++) {
    const k = f(fmt.format(new Date(2026, m - 1, 15)));
    if (k && !k.includes(' ') && !MONTH_OF.has(k)) MONTH_OF.set(k, m);
  }
}

// ---- The token stream --------------------------------------------------------

const SIGN = String.fromCharCode(0x20ac);
const DASH = /(\d)\s*[-\u2013\u2014]\s*(\d)/g;

/** Raw and folded tokens of one sentence, the same length, so a match can be
 *  told back in the traveller's own words. */
export function tokens(text) {
  const pre = String(text || '').slice(0, 600)
    .replace(/(\d{4})-(\d{2})-(\d{2})/g, ' $1d$2d$3 ')
    .replace(DASH, '$1 to $2')
    .replace(/(\d)[,.](\d{3})(?!\d)/g, '$1$2')
    .replace(/(\d)\s*k\b/gi, '$1000')
    .replace(new RegExp(`${SIGN}\\s*`, 'g'), ' eur ')
    .replace(/(\d)\s*(eur|euro|euros)\b/gi, '$1 eur')
    .replace(/(\d)(st|nd|rd|th|er|eme|e|de|ste|o|a)\b/gi, '$1');
  // A word and whether a comma or a full stop ends it (a clause boundary).
  const parts = [...pre.replace(/['’`]/g, ' ').replace(/-/g, ' ').matchAll(/([^\s,;/.!?()"“”:+&]+)( *[,;.!?]?)/g)];
  const out = { raw: [], toks: [], stop: [] };
  for (const [, w, tail] of parts) {
    const k = f(w);
    if (!k) continue;
    const bits = k.split(' ');
    bits.forEach((part, j) => {
      out.raw.push(w);
      out.toks.push(part);
      out.stop.push(j === bits.length - 1 && /[,;.!?]/.test(tail));
    });
  }
  return out;
}

function matchAt(toks, i, phrases, used) {
  for (const ph of phrases) {
    const w = ph.split(' ');
    if (i + w.length > toks.length) continue;
    let ok = true;
    for (let j = 0; j < w.length; j++) {
      if ((used && used[i + j]) || toks[i + j] !== w[j]) { ok = false; break; }
    }
    if (ok) return w.length;
  }
  return 0;
}
const numOf = (tok) => {
  if (/^\d{1,5}$/.test(tok || '')) return Number(tok);
  return Object.prototype.hasOwnProperty.call(NUM, tok) ? NUM[tok] : null;
};
const isDigits = (tok) => /^\d{1,2}$/.test(tok || '');

// ---- The vocabulary ----------------------------------------------------------

const BARE = new Map();
/** The vocabulary without a catalogue: months, and no places. */
function bareVocab(lang) {
  if (!BARE.has(lang)) BARE.set(lang, buildAskVocab({ t: (k) => k, lang, guided: null, rows: [], countries: [], index: null, lexicon: null }));
  return BARE.get(lang);
}

/**
 * Ask Carta's vocabulary over the planner's catalogue: every town (not a
 * gateway row) by name, the search index's aliases ("Roma"), every country
 * in the six languages, and the reviewed lexicon's exonyms when loaded.
 */
export function tripVocab({ destinations, lang = 'en', index = null, lexicon = null }) {
  const all = Object.values(destinations || {}).filter((d) => d && d.city && !d.gateway_of);
  const countries = [...new Map(all.filter((d) => d.iso2).map((d) => [d.iso2, d.country])).entries()];
  return buildAskVocab({ t: (k) => k, lang, guided: null, rows: all, countries, index, lexicon });
}

// ---- Reading ------------------------------------------------------------------

const DAY_MS = 86400000;
/** "Paris (CDG)" is Paris: the airport in brackets is the row's, not the town's. */
const cityName = (c) => String(c || '').replace(/\s*\([^)]*\)\s*$/, '');
const isoOf = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const todayIso = (today) => (typeof today === 'string' ? today.slice(0, 10)
  : (today instanceof Date ? isoOf(today.getFullYear(), today.getMonth() + 1, today.getDate()) : isoOf(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate())));
const utc = (s) => Date.parse(`${s}T00:00:00Z`);
const validDay = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
/** The next time day d of month m comes round on or after today (or in `year`). */
function nextDate(d, m, today, year = null) {
  const t = todayIso(today);
  const y0 = Number(t.slice(0, 4));
  for (const y of year ? [year] : [y0, y0 + 1]) {
    if (!validDay(y, m, d)) continue;
    const s = isoOf(y, m, d);
    if (year || s >= t) return s;
  }
  return null;
}

/**
 * One sentence as the planner's answers.
 *
 *   ctx: { vocab (tripVocab), lang, today (Date or YYYY-MM-DD),
 *          destinations (id -> row, for a town's country and an origin's
 *          coordinates), origins (meta.origins, the airport towns) }
 */
export function parseTrip(text, ctx = {}) {
  const lang = LANGS.includes(ctx.lang) ? ctx.lang : 'en';
  const vocab = ctx.vocab || bareVocab(lang);
  const destinations = ctx.destinations || {};
  const today = ctx.today || new Date();
  const fields = {};
  const src = String(text || '').trim();
  if (!src) return { text: '', fields };
  const { raw, toks, stop } = tokens(src);
  const used = toks.map(() => false);
  const take = (i, n) => { for (let j = 0; j < n; j++) used[i + j] = true; };
  const said = (spans) => spans.filter(Boolean).map(([i, n]) => [Math.max(0, i), n]).sort((a, b) => a[0] - b[0])
    .map(([i, n]) => raw.slice(i, i + n).filter((w, k, a) => k === 0 || a[k - 1] !== w).join(' ')).join(', ');
  const set = (key, value, spans) => { fields[key] = { value, from: 'words', said: said(spans) }; };
  const hasCaps = /[A-ZÀ-Ý]/.test(src) && src !== src.toUpperCase();
  // A town in the traveller's own spelling ("Gent", "Lisbonne"), capitalised,
  // unless it is the catalogue's own name with another case.
  const spoken = (i, n, name) => {
    const w = raw.slice(i, i + n).filter((x, k, a) => k === 0 || a[k - 1] !== x).join(' ');
    if (!w || f(w) === f(name)) return name;
    return w.charAt(0).toUpperCase() + w.slice(1);
  };
  const intent = parseIntent(src, { vocab, lang, now: new Date(`${todayIso(today)}T12:00:00`) });

  // -- Leaving from: an origin word, then a known town (catalogue or airport town).
  const originTowns = new Map();
  for (const o of Object.values(ctx.origins || {})) {
    const k = f(o?.city || o?.name || '');
    if (k && !originTowns.has(k)) originTowns.set(k, o);
  }
  const placeAt = (i, { origin = false } = {}) => {
    for (let n = Math.min(4, toks.length - i); n >= 1; n--) {
      if (used.slice(i, i + n).some(Boolean)) continue;
      const key = toks.slice(i, i + n).join(' ');
      const list = vocab.byKey.get(key) || [];
      const town = list.filter((e) => e.kind === 'place').sort((a, b) => (b.weight || 0) - (a.weight || 0))[0];
      const country = list.find((e) => e.kind === 'country');
      if (n === 1 && (key.length <= 2 || STOPW.has(key))) continue;
      const capital = /^[A-ZÀ-Ý]/.test(raw[i] || '');
      const plain = n === 1 && (COMMON.has(key) || list.some((e) => e.kind !== 'place' && e.kind !== 'country'));
      if (n === 1 && plain && !(hasCaps && capital)) continue;
      if (n === 1 && hasCaps && !capital && (town || country) && key.length <= 4) continue;
      // All in lower case: a short single word is a word ("are", "bus") unless it is a country.
      if (n === 1 && !hasCaps && !country && key.length <= 4) continue;
      if (country && !origin) return { i, n, kind: 'country', entry: country };
      if (town) return { i, n, kind: 'place', entry: town };
      if (origin && originTowns.has(key)) return { i, n, kind: 'origin', origin: originTowns.get(key) };
      if (country) return { i, n, kind: 'country', entry: country };
    }
    return null;
  };
  for (let i = 0; i < toks.length && !fields.from; i++) {
    const n = matchAt(toks, i, L.origin, used);
    if (!n) continue;
    const word = toks.slice(i, i + n).join(' ');
    if (WEAK_ORIGIN.has(word) && (isDigits(toks[i - 1]) || isDigits(toks[i + 1]) || (word !== 'out of' && !['fr', 'es', 'it', 'de'].includes(lang))
      || (word === 'von' && lang !== 'de') || ((word === 'de' || word === 'da') && lang === 'de'))) continue;
    const hit = placeAt(i + n, { origin: true });
    if (!hit || hit.kind === 'country') continue;
    let from = null;
    if (hit.kind === 'place') {
      const d = destinations[hit.entry.value];
      const lat = Number(d?.city_lat ?? d?.lat); const lng = Number(d?.city_lon ?? d?.lon);
      if (d && Number.isFinite(lat)) from = { name: spoken(hit.i, hit.n, cityName(d.city)), lat, lng, countryCode: d.iso2 || '', id: d.id || hit.entry.value };
      else if (originTowns.has(hit.entry.keys?.[0])) {
        const o = originTowns.get(hit.entry.keys[0]);
        from = { name: o.city || o.name, lat: o.lat, lng: o.lon, countryCode: '' };
      }
    } else {
      const o = hit.origin;
      if (Number.isFinite(Number(o.lat))) from = { name: o.city || o.name, lat: Number(o.lat), lng: Number(o.lon), countryCode: '' };
    }
    if (!from) continue;
    take(i, n + hit.n);
    set('from', from, [[i, n + hit.n]]);
  }

  // -- Booked, before the stay and way words read "hotel" or "flight" as a wish.
  const booked = { flights: false, stays: false, car: false, tickets: false };
  const bookSpans = [];
  for (let i = 0; i < toks.length; i++) {
    const n = matchAt(toks, i, L.nothingBooked, used);
    if (n) { bookSpans.push([i, n]); take(i, n); }
  }
  for (let i = 0; i < toks.length; i++) {
    if (!L.bookVerb.has(toks[i]) || used[i]) continue;
    // "Flights booked", "we booked the hotel": an object either side. "We
    // have a hotel": only after the verb, close by.
    const strong = L.bookStrong.has(toks[i]);
    let lo = i + 1;
    if (strong) { lo = i; while (lo > 0 && lo > i - 3 && !stop[lo - 1]) lo -= 1; }
    let hi = i;
    while (hi < toks.length - 1 && hi < i + (strong ? 4 : 3) && !stop[hi]) hi += 1;
    for (let j = lo; j <= hi; j++) {
      if (used[j]) continue;
      for (const [k, list] of L.bookObj) {
        const n = matchAt(toks, j, list, used);
        if (!n) continue;
        booked[k] = true;
        bookSpans.push([j, n], [i, 1]);
        take(j, n);
        used[i] = true;
      }
    }
  }
  if (bookSpans.length) set('booked', booked, bookSpans);

  // -- T863: the flight first ("just a cheap flight", "solo el vuelo"), read
  // after what is booked (a booked flight is not the door) and before who
  // goes and the way, so "solo" is not a party and "flight" not a way.
  for (let i = 0; i < toks.length; i++) {
    const n = matchAt(toks, i, L.flightFirst, used);
    if (n) { set('door', 'flight', [[i, n]]); take(i, n); break; }
  }

  // -- Dates: "3 to 10 July", "July 3 to 10", "du 3 au 10 juillet", "3 July to 2 August", an ISO day.
  const monthAt = (i) => {
    const m = MONTH_OF.get(toks[i]);
    if (!m || used[i]) return 0;
    if (SOFT_MONTHS.has(toks[i]) && !(MONTH_CUES.has(toks[i - 1]) || isDigits(toks[i - 1]) || isDigits(toks[i + 1]) || /^\d{4}$/.test(toks[i + 1] || '') || (hasCaps && /^[A-Z]/.test(raw[i])))) return 0;
    return m;
  };
  const yearAt = (i) => (/^20\d\d$/.test(toks[i] || '') ? Number(toks[i]) : null);
  const dayAt = (i) => (isDigits(toks[i]) && Number(toks[i]) >= 1 && Number(toks[i]) <= 31 && !used[i] ? Number(toks[i]) : 0);
  const toAt = (i) => matchAt(toks, i, L.rangeTo, used);
  // A number before one of these counts something; it is no day of the month.
  const countWord = (w) => L.night.has(w) || L.day.has(w) || L.week.has(w) || L.stars.has(w) || L.child.has(w)
    || L.people.some((p) => p.split(' ')[0] === w) || w === 'eur' || w === 'x';
  let dates = null;
  for (let i = 0; i < toks.length && !dates; i++) {
    const iso = (toks[i] || '').match(/^(\d{4})d(\d{2})d(\d{2})$/);
    if (iso) {
      const start = isoOf(Number(iso[1]), Number(iso[2]), Number(iso[3]));
      let end = null; let n = 1;
      const t = toAt(i + 1);
      const iso2 = t ? (toks[i + 1 + t] || '').match(/^(\d{4})d(\d{2})d(\d{2})$/) : null;
      if (iso2) { end = isoOf(Number(iso2[1]), Number(iso2[2]), Number(iso2[3])); n = 2 + t; }
      dates = { start, end, span: [i, n] };
      break;
    }
    const d1 = countWord(toks[i + 1]) ? 0 : dayAt(i);
    if (!d1) {
      // "July 3 to 10", "July 3"
      const m = monthAt(i);
      const d = m && !stop[i] && !countWord(toks[i + 2]) ? dayAt(i + 1) : 0;
      if (m && d) {
        const t = toAt(i + 2);
        const d2 = t ? dayAt(i + 2 + t) : 0;
        const n = d2 ? 3 + t : 2;
        const y = yearAt(i + n);
        const start = nextDate(d, m, today, y);
        const end = d2 && d2 > d ? (y ? isoOf(y, m, d2) : start && validDay(Number(start.slice(0, 4)), m, d2) ? isoOf(Number(start.slice(0, 4)), m, d2) : null) : null;
        if (start) dates = { start, end, span: [i, n + (y ? 1 : 0)], month: m };
      }
      continue;
    }
    // A day, "de", then the month (Spanish and French "3 de julio").
    const gap = (k) => (toks[k] === 'de' || toks[k] === 'di' || toks[k] === 'of' ? 1 : 0);
    let m1 = monthAt(i + 1 + gap(i + 1));
    const m1n = m1 ? 1 + gap(i + 1) : 0;
    const t = toAt(i + 1 + m1n);
    const d2 = t ? dayAt(i + 1 + m1n + t) : 0;
    if (!m1 && !d2) continue;
    let k = i + 1 + m1n + (d2 ? t + 1 : 0);
    let m2 = 0;
    if (d2) { m2 = monthAt(k + gap(k)); if (m2) k += 1 + gap(k); }
    if (!m1) m1 = m2;
    if (!m1) continue;
    if (!m2) m2 = m1;
    const y = yearAt(k);
    if (y) k += 1;
    const start = nextDate(d1, m1, today, y);
    if (!start) continue;
    let end = null;
    if (d2) {
      const y1 = Number(start.slice(0, 4));
      const y2 = m2 < m1 ? y1 + 1 : y1;
      if (validDay(y2, m2, d2)) end = isoOf(y2, m2, d2);
      if (end && end <= start) end = null;
    }
    // "3 July" with a cue word before it: "from 3 July", "on 3 July", "vanaf".
    dates = { start, end, span: [i, k - i], month: m1 };
  }
  if (dates) {
    take(...dates.span);
    if (toks[dates.span[0] - 1] === 'from' || toks[dates.span[0] - 1] === 'on' || toks[dates.span[0] - 1] === 'du'
      || toks[dates.span[0] - 1] === 'van' || toks[dates.span[0] - 1] === 'vanaf' || toks[dates.span[0] - 1] === 'vom' || toks[dates.span[0] - 1] === 'del'
      || toks[dates.span[0] - 1] === 'dal' || toks[dates.span[0] - 1] === 'le' || toks[dates.span[0] - 1] === 'am' || toks[dates.span[0] - 1] === 'el'
      || toks[dates.span[0] - 1] === 'il') {
      dates.span = [dates.span[0] - 1, dates.span[1] + 1];
      used[dates.span[0]] = true;
    }
  }

  // -- Nights: "10 nights", "5 days", "two weeks", "a week", "a long weekend".
  let nights = 0; let nightSpan = null;
  for (let i = 0; i < toks.length && !nights; i++) {
    if (used[i]) continue;
    for (const [n, list] of L.weeks) {
      const k = matchAt(toks, i, list, used);
      if (k) { nights = n; nightSpan = [i, k]; break; }
    }
    if (nights) break;
    const k = numOf(toks[i]);
    const unit = toks[i + 1];
    // "A day" and "a night" follow a price ("150 a day"); a length says a number.
    const counted = k != null && (k > 1 || /^\d+$/.test(toks[i]) || toks[i] === 'one') && !/^\d+$/.test(toks[i - 1] || '');
    if (k != null && k > 0 && k <= 60 && !used[i + 1]) {
      if (L.night.has(unit) && counted) { nights = k; nightSpan = [i, 2]; }
      else if (L.day.has(unit) && counted) { nights = Math.max(1, k - 1); nightSpan = [i, 2]; }
      else if (L.week.has(unit) && k <= 8) { nights = k * 7; nightSpan = [i, 2]; }
    }
    if (!nights && L.week.has(toks[i]) && !(numOf(toks[i - 1]) > 1)) { nights = 7; nightSpan = [i, 1]; }
  }
  if (nightSpan) take(...nightSpan);
  if (dates?.start && dates?.end) nights = Math.round((utc(dates.end) - utc(dates.start)) / DAY_MS);

  // -- Months and seasons, when no dates were given.
  const months = []; const monthSpans = [];
  let anyTime = null;
  if (!dates) {
    for (let i = 0; i < toks.length; i++) {
      if (used[i]) continue;
      const nm = matchAt(toks, i, L.nextMonth, used);
      if (nm) {
        const now = Number(todayIso(today).slice(5, 7));
        months.push((now % 12) + 1); monthSpans.push([i, nm]); take(i, nm); continue;
      }
      let hit = false;
      for (const [ms, list] of L.seasons) {
        const n = matchAt(toks, i, list, used);
        if (n) { months.push(...ms); monthSpans.push([i, n]); take(i, n); hit = true; break; }
      }
      if (hit) continue;
      const m = monthAt(i);
      if (m) { months.push(m); monthSpans.push([i, 1]); used[i] = true; }
    }
    for (let i = 0; i < toks.length && !anyTime; i++) {
      const n = matchAt(toks, i, L.anyTime, used);
      if (n) { anyTime = [i, n]; take(i, n); }
    }
  }
  if (dates?.start) {
    const end = dates.end || (nights ? new Date(utc(dates.start) + nights * DAY_MS).toISOString().slice(0, 10) : '');
    const n = end ? Math.round((utc(end) - utc(dates.start)) / DAY_MS) : (nights || 7);
    set('when', { mode: 'exact', start: dates.start, end, months: [], nights: n }, [dates.span, nightSpan]);
  } else if (months.length) {
    set('when', { mode: 'months', start: '', end: '', months: [...new Set(months)].sort((a, b) => a - b), nights: nights || 7 }, [...monthSpans, nightSpan]);
  } else if (anyTime) {
    set('when', { mode: 'any', start: '', end: '', months: [], nights: nights || 7 }, [anyTime, nightSpan]);
  }
  if (nights) set('nights', nights, [nightSpan || dates?.span]);

  // -- Who goes.
  let kind = ''; const kindSpans = [];
  let adults = 0; let kids = 0; let babies = 0; let kidsSaid = false;
  for (let i = 0; i < toks.length; i++) {
    if (used[i]) continue;
    const b = matchAt(toks, i, L.baby, used);
    if (b) {
      const k = numOf(toks[i - 1]);
      babies += k != null && k <= 6 ? k : 1;
      kindSpans.push(k != null ? [i - 1, b + 1] : [i, b]); take(i, b); if (k != null) used[i - 1] = true;
      continue;
    }
    if (L.child.has(toks[i])) {
      const k = numOf(toks[i - 1]);
      const n = k != null && k <= 10 ? k : (L.childOne.has(toks[i]) ? 1 : 2);
      // "a son and a daughter" adds up; "kids" alone is two.
      kids = kidsSaid ? kids + n : n;
      kidsSaid = true;
      kindSpans.push(k != null ? [i - 1, 2] : [i, 1]); used[i] = true; if (k != null) used[i - 1] = true;
      continue;
    }
    const fam = toks[i] === 'family' || toks[i] === 'gezin' || toks[i] === 'famille' || toks[i] === 'familie' || toks[i] === 'familia' || toks[i] === 'famiglia';
    if (fam && (toks[i + 1] === 'of' || toks[i + 1] === 'van' || toks[i + 1] === 'de' || toks[i + 1] === 'di' || toks[i + 1] === 'mit' || toks[i + 1] === 'met')) {
      const k = numOf(toks[i + 2]);
      if (k != null && k >= 2 && k <= 12) {
        kind = 'family'; adults = adults || 2; if (!kidsSaid) { kids = Math.max(0, k - 2); kidsSaid = true; }
        kindSpans.push([i, 3]); take(i, 3); continue;
      }
    }
    // "Met z'n vieren": Dutch counts the party in one word.
    if (toks[i] === 'z' && toks[i + 1] === 'n' && DUTCH_GROUP[toks[i + 2]]) {
      adults = DUTCH_GROUP[toks[i + 2]]; kindSpans.push([i - 1, 4]); take(i, 3); continue;
    }
    const fo = matchAt(toks, i, L.friendOne, used);
    if (fo) { kind = kind || 'friends'; adults = Math.max(adults, 2); kindSpans.push([i, fo]); take(i, fo); continue; }
    let hit = false;
    for (const [k, list] of L.kind) {
      const n = matchAt(toks, i, list, used);
      if (!n) continue;
      const count = numOf(toks[i - 1]);
      const weAre = ['are', 'zijn', 'sind', 'sommes', 'somos', 'siamo', 're'].includes(toks[i - 2]);
      if (k === 'friends' && count != null && count <= 20 && i > 0) { adults = Math.max(adults, weAre ? count : count + 1); used[i - 1] = true; kindSpans.push([i - 1, n + 1]); }
      else kindSpans.push([i, n]);
      if (!kind || k === 'family') kind = k;
      take(i, n); hit = true; break;
    }
    if (hit) continue;
    const k = numOf(toks[i]);
    if (k == null || k > 20 || k < 1) continue;
    const p = matchAt(toks, i + 1, L.people, used);
    if (p) { adults = k; kindSpans.push([i, 1 + p]); take(i, 1 + p); continue; }
    const we = i > 0 && L.weAre.some((ph) => { const w = ph.split(' '); return w.every((x, j) => toks[i - w.length + j] === x); });
    if (we) { adults = k; kindSpans.push([i - 2, 3]); used[i] = true; continue; }
    if (L.prep.has(toks[i - 1]) && /^\d+$|^(two|three|four|five|six|twee|drie|vier|vijf|zwei|drei|deux|trois|quatre|dos|tres|cuatro|due|tre|quattro)$/.test(toks[i])
      && !countWord(toks[i + 1]) && !matchAt(toks, i + 1, L.baby, null) && !L.kind.some(([, list]) => matchAt(toks, i + 1, list, null))
      && k <= 12 && k >= 2) {
      adults = k; kindSpans.push([i - 1, 2]); used[i] = true;
    }
  }
  // Ask's own counts where these lists said nothing ("4 adults", "for two").
  if (!adults && intent.budget.adults && !kind) adults = intent.budget.adults;
  if (!kidsSaid && intent.budget.children) { kids = intent.budget.children; kidsSaid = true; }
  if (kind || adults || kidsSaid || babies) {
    if (!kind) kind = kidsSaid || babies ? 'family' : adults === 1 ? 'solo' : adults === 2 ? 'couple' : adults <= 5 ? 'friends' : 'group';
    if (kind === 'family' && !kidsSaid && !babies) kids = 2;
    if (!adults) adults = kind === 'solo' ? 1 : kind === 'friends' ? 4 : kind === 'group' ? 6 : 2;
    // "With my wife and two kids": the couple is the family's two adults.
    if ((kidsSaid || babies) && (kind === 'couple' || kind === 'solo')) { if (kind === 'couple') adults = Math.max(adults, 2); kind = 'family'; }
    if (kind === 'couple') adults = 2;
    set('party', { kind, adults, kids, babies }, kindSpans);
  }

  // -- Budget: Ask's money reader, then a person or the group.
  const moneyAt = toks.findIndex((x, i) => /^\d{2,6}$/.test(x) && !used[i] && (toks[i + 1] === 'eur' || toks[i - 1] === 'eur'));
  const asked = intent.budget.total || intent.budget.perDay || 0;
  const askedAt = asked ? toks.findIndex((x, i) => x === String(asked) && !used[i]) : -1;
  const cueNear = (i) => {
    for (let j = Math.max(0, i - 4); j < i; j++) if (matchAt(toks, j, L.budgetCue, null)) return true;
    return false;
  };
  const cueAfter = (i) => [L.perDay, L.perPerson].some((list) => [1, 2].some((d) => matchAt(toks, i + d, list, null)));
  const at = moneyAt >= 0 ? moneyAt : (askedAt >= 0 && (cueNear(askedAt) || cueAfter(askedAt)) ? askedAt : -1);
  const money = at >= 0 ? Number(toks[at]) : 0;
  if (money >= 20) {
    const near = (list) => {
      for (let i = Math.max(0, at - 4); i <= Math.min(toks.length - 1, at + 6); i++) {
        const n = matchAt(toks, i, list, null);
        if (n) return [i, n];
      }
      return null;
    };
    const day = near(L.perDay);
    const person = near(L.perPerson);
    const group = near(L.perGroup);
    const cue = near(L.budgetCue);
    const unit = day || (moneyAt < 0 && intent.budget.perDay && !intent.budget.total) ? 'day' : 'trip';
    const per = person ? 'person' : group ? 'group' : (unit === 'day' ? 'person' : 'group');
    const spans = [[Math.max(0, at - (toks[at - 1] === 'eur' ? 1 : 0)), toks[at + 1] === 'eur' ? 2 : 1], day, person, group, cue];
    for (const s of spans) if (s) take(...s);
    set('budget', { eur: money, per, unit }, spans);
  }

  // -- Stay type.
  for (let i = 0; i < toks.length && !fields.stay; i++) {
    if (used[i]) continue;
    for (const [k, list] of L.stay) {
      const n = matchAt(toks, i, list, used);
      if (!n) continue;
      let tier = k === 'hotel' ? 'hotel3' : k;
      const spans = [[i, n]];
      if (k === 'hotel') {
        for (let j = Math.max(0, i - 3); j <= Math.min(toks.length - 2, i + 3); j++) {
          const s = numOf(toks[j]);
          if (s >= 2 && s <= 5 && L.stars.has(toks[j + 1])) { tier = `hotel${s}`; spans.push([j, 2]); used[j] = true; used[j + 1] = true; }
        }
      }
      take(i, n);
      set('stay', tier, spans);
      break;
    }
  }

  // -- Way of travel and the reach it implies.
  const guide = {}; const guideSpans = [];
  for (let i = 0; i < toks.length; i++) {
    const n = matchAt(toks, i, L.noFly, used);
    if (n) { guide.reach = 'overland'; guideSpans.push([i, n]); take(i, n); }
    const c = matchAt(toks, i, L.noCar, used);
    if (c) { guide.avoid = ['car']; guideSpans.push([i, c]); take(i, c); }
  }
  for (let i = 0; i < toks.length; i++) {
    const n = matchAt(toks, i, L.road, used);
    if (n) { guide.shape = 'road'; guideSpans.push([i, n]); }
  }
  // The way said outright ("by train") beats the car a road trip implies.
  const ways = [];
  for (let i = 0; i < toks.length; i++) {
    if (used[i]) continue;
    for (const [k, list] of L.way) {
      const n = matchAt(toks, i, list, used);
      if (!n) continue;
      if (k === 'plane' && guide.reach === 'overland') continue;
      if (k === 'car' && guide.avoid) continue;
      ways.push({ k, i, n, road: Boolean(matchAt(toks, i, L.road, null)) });
      i += n - 1;
      break;
    }
  }
  const way = ways.find((w) => !w.road) || ways[0];
  if (way) { take(way.i, way.n); set('way', way.k, [[way.i, way.n]]); }
  if (!fields.way && guide.shape === 'road' && !guide.avoid) set('way', 'car', [guideSpans.find(Boolean)]);
  if (Object.keys(guide).length) set('guide', guide, guideSpans);
  // Ask's warm words ("somewhere warm", "sun"), and snow in the six languages.
  if (intent.facets.warm) set('weather', 'warm', []);
  else if (toks.includes('snow') || toks.includes('sneeuw') || toks.includes('schnee') || toks.includes('neige') || toks.includes('nieve') || toks.includes('neve')) set('weather', 'snow', []);

  // -- What matters most.
  for (let i = 0; i < toks.length && !fields.priority; i++) {
    if (used[i]) continue;
    for (const [k, list] of L.priority) {
      const n = matchAt(toks, i, list, used);
      if (n) { set('priority', k, [[i, n]]); take(i, n); break; }
    }
  }

  // -- Likes, at most three.
  const likes = []; const likeSpans = [];
  for (let i = 0; i < toks.length; i++) {
    if (used[i]) continue;
    for (const [k, list] of L.likes) {
      const n = matchAt(toks, i, list, used);
      if (!n) continue;
      // "Spa" with a capital is the Belgian town, not a wish.
      if (n === 1 && hasCaps && i > 0 && !stop[i - 1] && /^[A-ZÀ-Ý]/.test(raw[i] || '') && (vocab.byKey.get(toks[i]) || []).some((e) => e.kind === 'place')) continue;
      if (!likes.includes(k)) { likes.push(k); likeSpans.push([i, n]); }
      take(i, n);
      break;
    }
  }

  // -- Places: every country and town left, longest name first.
  const places = []; const placeSpans = [];
  for (let i = 0; i < toks.length; i++) {
    if (used[i]) continue;
    const hit = placeAt(i);
    if (!hit) continue;
    const id = hit.entry.value;
    if (fields.from?.value?.id === id) { take(hit.i, hit.n); continue; }
    if (hit.kind === 'country') {
      const sample = Object.values(destinations).find((d) => d?.iso2 === id);
      places.push({ kind: 'country', id, name: hit.entry.label, country: sample?.country || hit.entry.label });
    } else {
      const d = destinations[id];
      places.push({ kind: 'place', id, name: spoken(hit.i, hit.n, cityName(d?.city || hit.entry.label)), iso2: d?.iso2 || '', country: d?.country || hit.entry.sub || '' });
    }
    placeSpans.push([hit.i, hit.n]);
    take(hit.i, hit.n);
    i = hit.i + hit.n - 1;
  }
  // A country named beside a town of its own ("Lisbon, Portugal") is the town.
  const towns = new Set(places.filter((p) => p.kind === 'place').map((p) => p.iso2));
  const kept = places.filter((p, k, a) => !(p.kind === 'country' && towns.has(p.id))
    && a.findIndex((x) => x.kind === p.kind && x.id === p.id) === k).slice(0, 6);
  if (kept.length) set('places', kept, placeSpans);
  // "Beaches in Spain": a like word left after the places.
  if (likes.length) set('likes', likes.slice(0, 3), likeSpans);

  return { text: src, fields };
}

// ---- Into the settings -----------------------------------------------------

/** The question each field answers (the screen it lets the planner skip). */
export const FIELD_SCREEN = {
  places: 'places', when: 'when', party: 'who', from: 'from', booked: 'booked', priority: 'priority',
  likes: 'g:likes', budget: 'g:budget', stay: 'sleep', weather: 'g:weather', way: 'way',
};

/** T860: the way-there question's answer for a way the words said (a coach is the train's row). */
const WAY_ANSWER = { plane: 'plane', train: 'train', bus: 'train', car: 'car' };

/** The screen ids a parse answers. */
export function answeredBy(parsed) {
  const out = [];
  for (const [k, id] of Object.entries(FIELD_SCREEN)) if (parsed?.fields?.[k]) out.push(id);
  return out;
}

/**
 * The settings the words give, over `s`: every field the words answered,
 * except the screens in `keep` (answers a screen gave). Returns the patch as
 * plain values plus the answered screen ids and the app-wide choices (stay
 * tier, way of travel) for the caller to write. Pure: no store, no React.
 *
 *   -> { patch, answered, choices: { stay_tier?, transport_mode? }, places }
 */
export function applyTrip(s, parsed, { keep = [] } = {}) {
  const F = parsed?.fields || {};
  const patch = {};
  const answered = [];
  const choices = {};
  const keepSet = new Set(keep);
  const free = (id) => !keepSet.has(id);
  const guide = { ...(s?.guide || {}) };
  let guideTouched = false;

  if (F.party && free('who')) {
    const p = F.party.value;
    patch.party = { ...(s?.party || {}), kind: p.kind, adults: p.adults, kids: p.kids, babies: p.babies,
      kidAges: (s?.party?.kidAges || []).slice(0, p.kids) };
    answered.push('who');
  }
  const party = patch.party || s?.party || { adults: 2, kids: 0 };
  if (F.when && free('when')) { patch.when = F.when.value; answered.push('when'); }
  else if (F.nights && free('when') && !F.when) {
    patch.when = { ...(s?.when || { mode: 'any', start: '', end: '', months: [] }), nights: F.nights.value };
    if (patch.when.mode === 'exact' && !(patch.when.start && patch.when.end)) patch.when = { ...patch.when, mode: 'any' };
  }
  if (F.from && free('from')) {
    const { name, lat, lng, countryCode } = F.from.value;
    patch.from = { name, lat, lng, countryCode };
    answered.push('from');
  }
  if (F.booked && free('booked')) { patch.booked = F.booked.value; answered.push('booked'); }
  if (F.priority && free('priority')) { patch.priority = F.priority.value; answered.push('priority'); }
  if (F.likes && free('g:likes')) { guide.likes = F.likes.value; guideTouched = true; answered.push('g:likes'); }
  if (F.budget && free('g:budget')) {
    const b = F.budget.value;
    const people = Math.max(1, (party.adults || 1) + (party.kids || 0));
    const eur = b.per === 'group' ? Math.round(b.eur / people) : b.eur;
    // A group's whole-trip figure keeps its total (tripSettings budgetOfRaw).
    guide.budget = b.per === 'group' && b.unit !== 'day'
      ? { kind: 'total', per: 'group', groupEur: b.eur, eur }
      : { kind: b.unit === 'day' ? 'day' : 'total', per: 'person', eur };
    guideTouched = true;
    answered.push('g:budget');
  }
  if (F.weather && free('g:weather')) { guide.weather = F.weather.value; guideTouched = true; answered.push('g:weather'); }
  if (F.guide) {
    const g = F.guide.value;
    if (g.reach) guide.reach = g.reach;
    if (g.avoid) guide.avoid = [...new Set([...(guide.avoid || []), ...g.avoid])];
    if (g.shape) { guide.shape = g.shape; guide.shapes = [g.shape]; }
    guideTouched = true;
  }
  // By train or coach is a trip without flying, as "no flying" is.
  if (F.way && (F.way.value === 'train' || F.way.value === 'bus') && !guide.reach) { guide.reach = 'overland'; guideTouched = true; }
  if (guideTouched) patch.guide = guide;
  if (F.places && free('places')) { patch.places = F.places.value.map(({ kind, id, name, iso2, country }) => ({ kind, id, name, iso2: iso2 || (kind === 'country' ? id : ''), country })); answered.push('places'); }
  if (F.stay && free('sleep')) { choices.stay_tier = F.stay.value; answered.push('sleep'); }
  // T860: the way there is its own question now (way); the app's choice follows it.
  if (F.way && free('way')) { choices.transport_mode = F.way.value; patch.way = WAY_ANSWER[F.way.value] || 'any'; answered.push('way'); }
  // T863: the words may choose the door ("just a cheap flight").
  if (F.door && free('doors')) { patch.door = F.door.value; answered.push('doors'); }
  return { patch, answered, choices };
}

/** The catalogue country names of the named places (the Where step's picks). */
export function placeCountries(places) {
  return [...new Set((places || []).map((p) => p.country).filter(Boolean))];
}

