/**
 * strings.mjs, the page chrome of the language pages (T1212, ROADMAP I12).
 *
 * Headings, fact labels and link words of the three page kinds built in six
 * languages (prerenderShell.js LANG_PAGE_KINDS: destinations, trips and
 * journeys). The lead sentences come from derived.mjs and the six app
 * catalogues (T368); proper names stay as they are; months, country names,
 * numbers and lists come from Intl in the page's language.
 *
 * English is the source. The nl, de, fr, es and it strings were drafted in
 * the T1212 session, not by a native speaker: they ship, but the pages that
 * carry them stay noindex until langs.mjs REVIEWED names the language and
 * kind (owner step T1212-a). This file is the list to review.
 *
 * Kept out of src/i18n on purpose: the app never shows these strings, and the
 * prerender must not grow the app's catalogues.
 */

export const STRINGS = {
  en: {
    photo: 'Photo: {by}', cardAlt: 'A Carta receipt: the bed, the food and the total for one person for one day in a European town.',
    breadcrumb: 'Breadcrumb', pages: 'Pages', sources: 'Sources: {list}.',
    trips: 'Trips', aDay: '{eur} a day', kmAway: '{km} km away', nameKmAway: '{name}, {km} km away',
    days: '{n} days', night: '{n} night', nights: '{n} nights',
    rated: 'rated {score}', scoreOf: '{score} of 10', score: 'Carta score',
    dayOne: 'A day for one person', dayOneEst: 'A day for one person, estimated',
    bed: 'Bed, a night', food: 'Food, a day', visit: 'Time to see it', bestMonths: 'Best months',
    weekCostH: 'What a week in {name} costs', weekCostLink: 'A week in {name}, bed and food for one person',
    seeH: 'What to see', walksH: 'Walks near {name}', cyclingH: 'Cycling nearby',
    waterH: 'Beaches and lakes nearby', peaksH: 'Mountains nearby', dayTripsH: 'Day trips from {name}',
    nearH: 'Other places near {name}',
    tripH1: '{names}, {n} days', daysNights: '{days} days, {nights} nights', distance: 'Distance between stops',
    season: 'Season', span: '{a} to {b}', stayH: 'Where you stay', sightsH: 'What you see',
    moreTripsH: 'More trips in {country}',
    tripCoverage: 'Costs on this page are estimates: beds from the catalogue’s stay prices and the ground transport between the stops, with no flights.',
    tripCredit: 'Composed by Carta from its own destination catalogue',
    length: 'Length', range: '{low} to {high}', moreInH: 'More in {country}', walksIn: 'Walks in {country}',
    tripsIn: 'Trips in {country}', moreJourneysH: 'More journeys like this',
    checked: 'The prices and opening details on this page were last checked in {when}.',
    journeyCredit: 'Written and checked by Carta',
  },
  nl: {
    photo: 'Foto: {by}', cardAlt: 'Een Carta-bon: het bed, het eten en het totaal voor één persoon voor één dag in een Europese stad.',
    breadcrumb: 'Kruimelpad', pages: 'Pagina’s', sources: 'Bronnen: {list}.',
    trips: 'Reizen', aDay: '{eur} per dag', kmAway: '{km} km verderop', nameKmAway: '{name}, {km} km verderop',
    days: '{n} dagen', night: '{n} nacht', nights: '{n} nachten',
    rated: 'cijfer {score}', scoreOf: '{score} op 10', score: 'Carta-cijfer',
    dayOne: 'Een dag voor één persoon', dayOneEst: 'Een dag voor één persoon, geschat',
    bed: 'Bed, per nacht', food: 'Eten, per dag', visit: 'Tijd om het te zien', bestMonths: 'Beste maanden',
    weekCostH: 'Wat een week in {name} kost', weekCostLink: 'Een week in {name}, bed en eten voor één persoon',
    seeH: 'Wat je ziet', walksH: 'Wandelingen bij {name}', cyclingH: 'Fietsen in de buurt',
    waterH: 'Stranden en meren in de buurt', peaksH: 'Bergen in de buurt', dayTripsH: 'Dagtochten vanuit {name}',
    nearH: 'Andere plekken bij {name}',
    tripH1: '{names}, {n} dagen', daysNights: '{days} dagen, {nights} nachten', distance: 'Afstand tussen de stops',
    season: 'Seizoen', span: '{a} tot {b}', stayH: 'Waar je slaapt', sightsH: 'Wat je ziet',
    moreTripsH: 'Meer reizen in {country}',
    tripCoverage: 'De kosten op deze pagina zijn schattingen: bedden uit de verblijfsprijzen van de catalogus en het vervoer over land tussen de stops, zonder vluchten.',
    tripCredit: 'Samengesteld door Carta uit de eigen catalogus van bestemmingen',
    length: 'Duur', range: '{low} tot {high}', moreInH: 'Meer in {country}', walksIn: 'Wandelingen in {country}',
    tripsIn: 'Reizen in {country}', moreJourneysH: 'Meer reizen zoals deze',
    checked: 'De prijzen en openingstijden op deze pagina zijn het laatst gecontroleerd in {when}.',
    journeyCredit: 'Geschreven en gecontroleerd door Carta',
  },
  de: {
    photo: 'Foto: {by}', cardAlt: 'Ein Carta-Beleg: das Bett, das Essen und die Summe für eine Person für einen Tag in einer europäischen Stadt.',
    breadcrumb: 'Brotkrumen', pages: 'Seiten', sources: 'Quellen: {list}.',
    trips: 'Reisen', aDay: '{eur} pro Tag', kmAway: '{km} km entfernt', nameKmAway: '{name}, {km} km entfernt',
    days: '{n} Tage', night: '{n} Nacht', nights: '{n} Nächte',
    rated: 'Bewertung {score}', scoreOf: '{score} von 10', score: 'Carta-Bewertung',
    dayOne: 'Ein Tag für eine Person', dayOneEst: 'Ein Tag für eine Person, geschätzt',
    bed: 'Bett, pro Nacht', food: 'Essen, pro Tag', visit: 'Zeit für einen Besuch', bestMonths: 'Beste Monate',
    weekCostH: 'Was eine Woche in {name} kostet', weekCostLink: 'Eine Woche in {name}, Bett und Essen für eine Person',
    seeH: 'Sehenswertes', walksH: 'Wanderungen bei {name}', cyclingH: 'Radfahren in der Nähe',
    waterH: 'Strände und Seen in der Nähe', peaksH: 'Berge in der Nähe', dayTripsH: 'Tagesausflüge ab {name}',
    nearH: 'Weitere Orte bei {name}',
    tripH1: '{names}, {n} Tage', daysNights: '{days} Tage, {nights} Nächte', distance: 'Strecke zwischen den Stopps',
    season: 'Saison', span: '{a} bis {b}', stayH: 'Wo Sie übernachten', sightsH: 'Was Sie sehen',
    moreTripsH: 'Weitere Reisen in {country}',
    tripCoverage: 'Die Kosten auf dieser Seite sind Schätzungen: Betten aus den Unterkunftspreisen des Katalogs und die Fahrten zwischen den Stopps, ohne Flüge.',
    tripCredit: 'Von Carta aus dem eigenen Reisezielkatalog zusammengestellt',
    length: 'Dauer', range: '{low} bis {high}', moreInH: 'Mehr in {country}', walksIn: 'Wanderungen in {country}',
    tripsIn: 'Reisen in {country}', moreJourneysH: 'Ähnliche Reisen',
    checked: 'Stand der Preise und Öffnungszeiten auf dieser Seite: {when}.',
    journeyCredit: 'Von Carta geschrieben und geprüft',
  },
  fr: {
    photo: 'Photo : {by}', cardAlt: 'Un reçu Carta : le lit, les repas et le total pour une personne pour une journée dans une ville européenne.',
    breadcrumb: 'Fil d’Ariane', pages: 'Pages', sources: 'Sources : {list}.',
    trips: 'Voyages', aDay: '{eur} par jour', kmAway: 'à {km} km', nameKmAway: '{name}, à {km} km',
    days: '{n} jours', night: '{n} nuit', nights: '{n} nuits',
    rated: 'note {score}', scoreOf: '{score} sur 10', score: 'Note Carta',
    dayOne: 'Une journée pour une personne', dayOneEst: 'Une journée pour une personne, estimée',
    bed: 'Lit, une nuit', food: 'Repas, une journée', visit: 'Temps de visite', bestMonths: 'Meilleurs mois',
    weekCostH: 'Ce que coûte une semaine à {name}', weekCostLink: 'Une semaine à {name}, lit et repas pour une personne',
    seeH: 'À voir', walksH: 'Randonnées près de {name}', cyclingH: 'Vélo à proximité',
    waterH: 'Plages et lacs à proximité', peaksH: 'Montagnes à proximité', dayTripsH: 'Excursions depuis {name}',
    nearH: 'Autres lieux près de {name}',
    tripH1: '{names}, {n} jours', daysNights: '{days} jours, {nights} nuits', distance: 'Distance entre les étapes',
    season: 'Saison', span: '{a} à {b}', stayH: 'Où vous dormez', sightsH: 'Ce que vous voyez',
    moreTripsH: 'Plus de voyages : {country}',
    tripCoverage: 'Les coûts de cette page sont des estimations : les lits d’après les prix d’hébergement du catalogue et le transport terrestre entre les étapes, sans les vols.',
    tripCredit: 'Composé par Carta à partir de son propre catalogue de destinations',
    length: 'Durée', range: '{low} à {high}', moreInH: 'Plus sur {country}', walksIn: 'Randonnées : {country}',
    tripsIn: 'Voyages : {country}', moreJourneysH: 'Voyages du même genre',
    checked: 'Les prix et horaires de cette page ont été vérifiés pour la dernière fois en {when}.',
    journeyCredit: 'Écrit et vérifié par Carta',
  },
  es: {
    photo: 'Foto: {by}', cardAlt: 'Un recibo de Carta: la cama, la comida y el total para una persona durante un día en una ciudad europea.',
    breadcrumb: 'Ruta de navegación', pages: 'Páginas', sources: 'Fuentes: {list}.',
    trips: 'Viajes', aDay: '{eur} al día', kmAway: 'a {km} km', nameKmAway: '{name}, a {km} km',
    days: '{n} días', night: '{n} noche', nights: '{n} noches',
    rated: 'nota {score}', scoreOf: '{score} de 10', score: 'Nota Carta',
    dayOne: 'Un día para una persona', dayOneEst: 'Un día para una persona, estimado',
    bed: 'Cama, una noche', food: 'Comida, un día', visit: 'Tiempo para verlo', bestMonths: 'Mejores meses',
    weekCostH: 'Lo que cuesta una semana en {name}', weekCostLink: 'Una semana en {name}, cama y comida para una persona',
    seeH: 'Qué ver', walksH: 'Rutas a pie cerca de {name}', cyclingH: 'Bicicleta cerca',
    waterH: 'Playas y lagos cerca', peaksH: 'Montañas cerca', dayTripsH: 'Excursiones de un día desde {name}',
    nearH: 'Otros lugares cerca de {name}',
    tripH1: '{names}, {n} días', daysNights: '{days} días, {nights} noches', distance: 'Distancia entre paradas',
    season: 'Temporada', span: '{a} a {b}', stayH: 'Dónde duermes', sightsH: 'Qué ves',
    moreTripsH: 'Más viajes en {country}',
    tripCoverage: 'Los costes de esta página son estimaciones: camas según los precios de alojamiento del catálogo y el transporte terrestre entre paradas, sin vuelos.',
    tripCredit: 'Compuesto por Carta a partir de su propio catálogo de destinos',
    length: 'Duración', range: '{low} a {high}', moreInH: 'Más en {country}', walksIn: 'Rutas a pie en {country}',
    tripsIn: 'Viajes en {country}', moreJourneysH: 'Más viajes como este',
    checked: 'Los precios y horarios de esta página se comprobaron por última vez en {when}.',
    journeyCredit: 'Escrito y comprobado por Carta',
  },
  it: {
    photo: 'Foto: {by}', cardAlt: 'Una ricevuta Carta: il letto, il cibo e il totale per una persona per un giorno in una città europea.',
    breadcrumb: 'Percorso di navigazione', pages: 'Pagine', sources: 'Fonti: {list}.',
    trips: 'Viaggi', aDay: '{eur} al giorno', kmAway: 'a {km} km', nameKmAway: '{name}, a {km} km',
    days: '{n} giorni', night: '{n} notte', nights: '{n} notti',
    rated: 'voto {score}', scoreOf: '{score} su 10', score: 'Voto Carta',
    dayOne: 'Un giorno per una persona', dayOneEst: 'Un giorno per una persona, stimato',
    bed: 'Letto, una notte', food: 'Cibo, un giorno', visit: 'Tempo per vederlo', bestMonths: 'Mesi migliori',
    weekCostH: 'Quanto costa una settimana a {name}', weekCostLink: 'Una settimana a {name}, letto e cibo per una persona',
    seeH: 'Cosa vedere', walksH: 'Escursioni vicino a {name}', cyclingH: 'In bici nei dintorni',
    waterH: 'Spiagge e laghi nei dintorni', peaksH: 'Montagne nei dintorni', dayTripsH: 'Gite di un giorno da {name}',
    nearH: 'Altri luoghi vicino a {name}',
    tripH1: '{names}, {n} giorni', daysNights: '{days} giorni, {nights} notti', distance: 'Distanza tra le tappe',
    season: 'Stagione', span: 'da {a} a {b}', stayH: 'Dove dormi', sightsH: 'Cosa vedi',
    moreTripsH: 'Altri viaggi in {country}',
    tripCoverage: 'I costi di questa pagina sono stime: i letti dai prezzi di alloggio del catalogo e il trasporto via terra tra le tappe, senza voli.',
    tripCredit: 'Composto da Carta dal proprio catalogo di destinazioni',
    length: 'Durata', range: 'da {low} a {high}', moreInH: 'Altro in {country}', walksIn: 'Escursioni in {country}',
    tripsIn: 'Viaggi in {country}', moreJourneysH: 'Altri viaggi come questo',
    checked: 'I prezzi e gli orari di questa pagina sono stati controllati l’ultima volta nel {when}.',
    journeyCredit: 'Scritto e controllato da Carta',
  },
};

/** A chrome string in `lang` with {vars} filled in; English per key as the fallback. */
export function S(lang, key, vars = {}) {
  const raw = STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
  return raw.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])));
}

const BCP47 = { en: 'en-GB', nl: 'nl-NL', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT' };
/** The og:locale of a language (Open Graph wants ll_CC). */
export const ogLocale = (lang) => (BCP47[lang] || 'en-GB').replace('-', '_');

/** A whole number in the page's language (1,234 in English, 1.234 in Dutch). */
export const num0 = (lang, v) => new Intl.NumberFormat(BCP47[lang] || 'en-GB', { maximumFractionDigits: 0 }).format(v);
/** One decimal in the page's language. */
export const num1 = (lang, v) => new Intl.NumberFormat(BCP47[lang] || 'en-GB', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v);
/** Euros, whole, with the sign in front as the app prints them. */
export const eur = (lang, v) => `€${num0(lang, v)}`;

const regionNames = {};
/** A country's name in the page's language, from Intl (Spanje, Spanien, Espagne). */
export function countryIn(lang, cc) {
  try {
    regionNames[lang] ||= new Intl.DisplayNames([BCP47[lang] || 'en-GB'], { type: 'region' });
    return regionNames[lang].of(String(cc).toUpperCase()) || cc;
  } catch { return cc; }
}

/** A month (1 to 12) by name in the page's language, lower case where the language writes it so. */
export function monthIn(lang, m) {
  if (!(m >= 1 && m <= 12)) return null;
  try { return new Intl.DateTimeFormat(BCP47[lang] || 'en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, m - 1, 15))); } catch { return null; }
}

/** "A, B and C" in the page's language. */
export function listIn(lang, names) {
  try { return new Intl.ListFormat(BCP47[lang] || 'en-GB', { style: 'long', type: 'conjunction' }).format(names); } catch { return names.join(', '); }
}
