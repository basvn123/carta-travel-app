/**
 * A destination id, as a filename.
 *
 * The POI lists are sharded to public/poi/<name>.json, so an id has to
 * survive a filesystem and a URL. Three things in the catalogue's ids do
 * not: the "gem:" prefix most off-airport places carry (a colon is illegal
 * in an NTFS name), non-ASCII letters in a handful of Greek and Icelandic
 * ids, and the DOS device names Windows still refuses to create, which is
 * the same trap the fares layer hit with PRN.json.
 *
 * The generator (scripts/shard-poi.mjs) and the fetch both import THIS, so
 * a rule change can never leave one side writing names the other cannot
 * read.
 */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function shardName(id) {
  const s = String(id ?? '').trim();
  if (!s) return null;
  // Percent-encode anything outside the safe set, then make the escape
  // character itself filename-legal: "gem:bruges" becomes "gem_3Abruges".
  const enc = encodeURIComponent(s).replace(/%/g, '_').replace(/\./g, '_2E');
  if (!/^[A-Za-z0-9_-]+$/.test(enc)) return null;
  return RESERVED.test(enc) ? `${enc}_` : enc;
}
