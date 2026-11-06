/**
 * provenance.js, field provenance on the destination records (T1143, D3).
 *
 * Since schema 20 every key block of a destination (costs, rating, climate,
 * crowding and the rest; the list is pipeline/config/sources.yaml) carries
 *   _src   the id of its source in the sources registry
 *   _asof  the date (YYYY-MM-DD) its pipeline layer last built it
 *
 * The screens were written against blocks without those keys, and a few walk
 * a block's keys. So the loader lifts the two keys off each block as a shard
 * arrives (catalogue.js) and keeps them beside the record, where
 * provenanceOf() reads them. A schema 19 shard has no stamps and passes
 * through unchanged, so the app reads the old and the new wire alike.
 *
 * The side table is a WeakMap keyed by the block object itself. The catalogue
 * builds a new record object on every snapshot (bootIndex.js mergeCatalogue)
 * but shares the blocks by reference, so the stamp follows the block through
 * every copy, costs nothing once the block is dropped, and adds no key a
 * screen could trip over.
 */

const SRC = '_src';
const ASOF = '_asof';
const byBlock = new WeakMap();

/**
 * Move `_src` and `_asof` off every block of one record into the side table.
 * Mutates the record in place (a freshly parsed shard, owned by the loader)
 * and returns it. Blocks without a stamp are left alone.
 */
export function liftProvenance(record) {
  if (!record || typeof record !== 'object') return record;
  for (const key of Object.keys(record)) {
    const block = record[key];
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    if (!(SRC in block) && !(ASOF in block)) continue;
    byBlock.set(block, Object.freeze({ src: block[SRC] ?? null, asof: block[ASOF] ?? null }));
    delete block[SRC];
    delete block[ASOF];
  }
  return record;
}

/** liftProvenance on every record of a shard ({ id: record }). */
export function liftShard(records) {
  if (records && typeof records === 'object') {
    for (const r of Object.values(records)) liftProvenance(r);
  }
  return records;
}

/**
 * Where one block of a record comes from and how fresh it is:
 * { src, asof } or null (a schema 19 record, a lite record, no such block).
 */
export function provenanceOf(record, block) {
  const b = record && record[block];
  return (b && typeof b === 'object' && byBlock.get(b)) || null;
}

/** Every stamped block of a record, { block: { src, asof } }, or {}. */
export function provenanceAll(record) {
  const out = {};
  if (!record || typeof record !== 'object') return out;
  for (const key of Object.keys(record)) {
    const p = provenanceOf(record, key);
    if (p) out[key] = p;
  }
  return out;
}
