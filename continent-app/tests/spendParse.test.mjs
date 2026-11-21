// G15 Uitgaven: the local speech and receipt readers in lib/spend/parse.js.
// Six languages, euros and cents in words and digits, the "which amount"
// pairs, category, who it was for, who paid and the currency.
// Run: npm test (continent-app/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSpeech, parseReceipt } from '../src/lib/spend/parse.js';

const PEOPLE = [
  { id: 'me', name: '', me: true },
  { id: 'p0', name: 'Sam', me: false },
  { id: 'p1', name: 'Jo', me: false },
  { id: 'p2', name: 'Lien', me: false },
];
const say = (text, lang) => parseSpeech(text, lang, PEOPLE);

test('Dutch: words with cents, a name, the category', () => {
  const d = say('twaalf euro vijftig lunch met Sam', 'nl');
  assert.equal(d.amount, 12.5);
  assert.equal(d.which, null);
  assert.equal(d.cat, 'food');
  assert.equal(d.mode, 'each');
  assert.deepEqual(d.sharers, ['me', 'p0']);
  assert.equal(d.currency, 'EUR');
  assert.equal(d.desc, 'Lunch');
  assert.equal(say('vijfentwintig euro taxi', 'nl').amount, 25);
  assert.equal(say('tweehonderdvijftig hotel', 'nl').amount, 250);
  assert.equal(say('een lunch van twaalf euro', 'nl').amount, 12);
});

test('Dutch: vijftien or vijftig is asked, not guessed', () => {
  const d = say('vijftien euro lunch met Sam', 'nl');
  assert.deepEqual(d.which, [15, 50]);
  assert.deepEqual(say('vijftig euro diner', 'nl').which, [15, 50]);
  assert.deepEqual(say('15 euro koffie', 'nl').which, [15, 50]);
  assert.equal(say('12,50 koffie', 'nl').which, null);
});

test('English: digits, words, fifteen or fifty, only me', () => {
  assert.equal(say('12.50 lunch with Sam', 'en').amount, 12.5);
  const d = say('twelve fifty coffee', 'en');
  assert.equal(d.amount, 12.5);
  assert.equal(d.cat, 'food');
  assert.equal(say('twenty five pounds taxi', 'en').currency, 'GBP');
  assert.equal(say('twenty five pounds taxi', 'en').amount, 25);
  assert.equal(say('twenty five pounds taxi', 'en').cat, 'transport');
  assert.deepEqual(say('fifteen euro museum', 'en').which, [15, 50]);
  assert.equal(say('fifteen euro museum', 'en').cat, 'activities');
  assert.equal(say('eight fifty sunscreen just me', 'en').mode, 'me');
  assert.equal(say('two hundred fifty for everyone', 'en').amount, 250);
  assert.equal(say('two hundred fifty for everyone', 'en').mode, 'all');
});

test('German: compounds and who paid', () => {
  const d = say('Jo hat bezahlt fünfundzwanzig Euro Abendessen', 'de');
  assert.equal(d.amount, 25);
  assert.equal(d.payer, 'p1');
  assert.equal(d.cat, 'food');
  assert.deepEqual(say('dreizehn Euro Bahn', 'de').which, [13, 30]);
  assert.equal(say('zwölf Euro fünfzig Kaffee', 'de').amount, 12.5);
  assert.equal(say('ein Kaffee für zwei Euro', 'de').amount, 2);
  assert.equal(say('nur für mich acht Euro', 'de').mode, 'me');
});

test('French: vingt-cinq, quatre-vingt-dix, the cent is a number', () => {
  assert.equal(say('vingt-cinq euros déjeuner avec Lien', 'fr').amount, 25);
  assert.deepEqual(say('vingt-cinq euros déjeuner avec Lien', 'fr').sharers, ['me', 'p2']);
  assert.equal(say('quatre-vingt-dix euros hôtel', 'fr').amount, 90);
  assert.equal(say('soixante-dix euros', 'fr').amount, 70);
  assert.equal(say('cent vingt euros train', 'fr').amount, 120);
  assert.equal(say('cent vingt euros train', 'fr').cat, 'transport');
  assert.equal(say('douze euros cinquante café pour moi', 'fr').amount, 12.5);
  assert.equal(say('douze euros cinquante café pour moi', 'fr').mode, 'me');
});

test('Spanish: veinticinco, treinta y cinco, Sam pagó', () => {
  assert.equal(say('veinticinco euros cena', 'es').amount, 25);
  assert.equal(say('treinta y cinco euros tapas para todos', 'es').amount, 35);
  assert.equal(say('treinta y cinco euros tapas para todos', 'es').mode, 'all');
  const d = say('Sam pagó doce euros taxi', 'es');
  assert.equal(d.payer, 'p0');
  assert.equal(d.amount, 12);
  assert.equal(d.cat, 'transport');
  assert.equal(say('cinco euros helado solo para mí', 'es').mode, 'me');
});

test('Italian: ventotto, trentacinque, duecento', () => {
  assert.equal(say('ventotto euro pranzo con Jo', 'it').amount, 28);
  assert.deepEqual(say('ventotto euro pranzo con Jo', 'it').sharers, ['me', 'p1']);
  assert.equal(say('trentacinque euro biglietti', 'it').amount, 35);
  assert.equal(say('trentacinque euro biglietti', 'it').cat, 'activities');
  assert.equal(say('duecento euro hotel', 'it').amount, 200);
  assert.equal(say('dodici euro e cinquanta gelato', 'it').amount, 12.5);
});

test('Nothing heard: no amount, never a guess', () => {
  const d = say('lunch', 'en');
  assert.equal(d.amount, null);
  assert.equal(d.which, null);
});

test('parseReceipt: the total line, the place, the date, the currency', () => {
  const r = parseReceipt([
    'Pastéis de Belém',
    'Rua de Belém 84, Lisboa',
    '21/11/2026 10:14',
    '2x Pastel de nata    4,80',
    'Bica                 1,60',
    'Sumo laranja         3,20',
    'IVA 6%               0,54',
    'TOTAL EUR            9,60',
    'Multibanco           9,60',
  ].join('\n'));
  assert.equal(r.place, 'Pastéis de Belém');
  assert.equal(r.date, '2026-11-21');
  assert.equal(r.currency, 'EUR');
  assert.equal(r.lines.length, 6);
  assert.equal(r.lines[r.total].cents, 960);
  assert.match(r.lines[r.total].label, /TOTAL/);
});

test('parseReceipt: no total word takes the largest amount; empty text is empty', () => {
  const r = parseReceipt('Bar Roma\nCaffe 1.20\nCornetto 1.50\n2.70');
  assert.equal(r.lines[r.total].cents, 270);
  const none = parseReceipt('');
  assert.deepEqual(none.lines, []);
  assert.equal(none.total, null);
  // A subtotal is not the total.
  const sub = parseReceipt('Subtotal 20,00\nTotaal 22,50\nWisselgeld 2,50');
  assert.equal(sub.lines[sub.total].cents, 2250);
});
