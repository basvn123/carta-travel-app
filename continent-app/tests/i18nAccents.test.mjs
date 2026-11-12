/* Owner sweep 2026-11-12 (ROADMAP I8): 905 translated strings had been written
 * without their accents ("etapes", "Fuhrt uber", "dia", "piu"). These are the
 * stripped words that kept coming back; each pattern only matches a spelling
 * that is wrong in that language, so a hit is always a missing accent. */
import test from 'node:test';
import assert from 'node:assert/strict';

const STRIPPED = {
  fr: /(^|[^\p{L}'’])((?<!y )a (pied|moins de|l'est|l'ouest|l'aller)|jusqu'a|etapes?|deja|meme|apres|tres|ete verifie|itineraire|randonnees?)(?=$|[^\p{L}])/u,
  es: /(^|[^\p{L}])(Dia|dia|dias|Aqui|aqui|tambien|despues|sesion|Federacion|continuacion)(?=$|[^\p{L}])/u,
  it: /(^|[^\p{L}])(piu|gia|citta|perche|cosi|attivita|qualita)(?=$|[^\p{L}])/u,
  de: /(^|[^\p{L}])(fuer|ueber|Ueber|Fuhrt|fuehrt|Strasse|Strassen|Straende|zuruck|naechste|Hohle|Kuste|veroeffentlicht)(?=$|[^\p{L}])/u,
};

for (const [code, re] of Object.entries(STRIPPED)) {
  const cat = (await import(`../src/i18n/${code}.js`))[code];
  test(`${code}: no word written without its accents`, () => {
    // A URL slug may be plain ASCII on purpose.
    const bad = Object.entries(cat).filter(([, v]) => typeof v === 'string' && !/^https?:/.test(v) && re.test(v)).map(([k, v]) => `${k}: ${v.slice(0, 60)}`);
    assert.deepEqual(bad.slice(0, 20), [], `${bad.length} stripped values in ${code}.js`);
  });
}
