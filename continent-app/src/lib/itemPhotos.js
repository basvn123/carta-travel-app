/**
 * One photograph shape for every item page (T430). The layers arrived with
 * four: beach, lake and summit rows carry { u, big, w, h, by, lic, licUrl,
 * page, ev }, a trail { u, w, h, title, author, license, page, caption,
 * along_m }, a cycle route { url, thumb, author, license, along_m }, the
 * trips { url, w, h, credit, page }. PhotoGallery takes
 *
 *   { url, srcSet, w, h, caption, author, licence, page, alongM }
 *
 * and this module is the one place that maps the others onto it. Commons
 * thumbs get a srcset up to 1280 px, so a desktop draws the sharp file
 * (owner, 2026-10-15: "enhance the quality of these images").
 *
 * Pure, and the veto list (lib/photoVeto.js) is applied here so no page can
 * forget it.
 */
import { srcSetFor, thumbAt, isResizable } from './heroImage.js';
import { vetoed as isVetoed } from './photoVeto.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/[\s,]+$/, '').trim();

// A credit that is a number, a dash or nothing at all is not a credit
// (row T429-h: "0, CC BY 3.0").
const realCredit = (s) => {
  const v = clean(s);
  return v && !/^[\d\s.\-_,]+$/.test(v) ? v : '';
};

export function toPhoto(img, { caption = '', fallbackCaption = '' } = {}) {
  if (!img) return null;
  if (typeof img === 'string') img = { url: img };
  const raw = img.big || img.url || img.u || img.thumb || '';
  if (!raw || isVetoed(raw) || (img.u && isVetoed(img.u))) return null;
  const url = isResizable(raw) ? thumbAt(raw, 960) : raw;
  return {
    url,
    srcSet: srcSetFor(raw, 1280),
    w: Number(img.w) || null,
    h: Number(img.h) || null,
    caption: clean(caption || img.caption || img.title || img.cap || fallbackCaption),
    author: realCredit(img.by ?? img.author ?? img.credit),
    licence: clean(img.lic ?? img.license ?? img.licence),
    page: img.page || img.licUrl || null,
    alongM: Number.isFinite(Number(img.along_m)) ? Number(img.along_m) : null,
  };
}

/** A list of layer images as gallery photos, vetoed and de-duplicated. */
export function toPhotos(list, opts = {}) {
  const seen = new Set();
  const out = [];
  for (const img of Array.isArray(list) ? list : []) {
    const p = toPhoto(img, opts);
    if (!p || seen.has(p.url)) continue;
    seen.add(p.url);
    out.push(p);
  }
  return out;
}
