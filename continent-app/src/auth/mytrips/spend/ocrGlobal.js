// Tesseract's worker script is written for webpack, which gives the worker
// scope the Node names it uses: `global`, and a `Buffer` for zlibjs's
// gunzip of the language data (it only allocates bytes and indexes them).
// Vite does not, so the worker gets the two names here, before the script.
/* eslint-disable no-undef */
self.global = self;
if (typeof self.Buffer === 'undefined') {
  const B = function Buffer(n) { return new Uint8Array(n); };
  B.from = (a) => Uint8Array.from(a);
  self.Buffer = B;
}
