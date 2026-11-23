/**
 * fairest.js, the Vluchten step of a kring (G16, decision 0017).
 *
 * Each member flies from their own home airport, so one place can be cheap
 * for one friend and dear for another. Per proposal we take the average
 * return fare and the spread (dearest minus cheapest) over the members with
 * a fare. A proposal where any member has no swept fare is incomplete: we
 * never estimate, so it cannot be called the fairest. "Eerlijkst" is the
 * complete proposal with the smallest spread, ties to the lower average,
 * then the earlier row; none when every proposal is incomplete.
 *
 * Input: rows of `{ id, fares: { [userId]: number | null } }` and the member
 * ids that should each have a fare.
 */

export function fairest(rows, memberIds) {
  const out = (rows || []).filter(Boolean).map((r) => {
    const ids = memberIds && memberIds.length ? memberIds : Object.keys(r.fares || {});
    const priced = [];
    for (const uid of ids) {
      const v = r.fares ? r.fares[uid] : null;
      if (v != null && Number.isFinite(Number(v))) priced.push(Number(v));
    }
    const complete = ids.length > 0 && priced.length === ids.length;
    const avg = priced.length ? priced.reduce((s, v) => s + v, 0) / priced.length : null;
    const spread = priced.length ? Math.max(...priced) - Math.min(...priced) : null;
    return { id: r.id, avg, spread, min: priced.length ? Math.min(...priced) : null, max: priced.length ? Math.max(...priced) : null, priced: priced.length, complete };
  });
  let best = null;
  for (const r of out) {
    if (!r.complete) continue;
    if (!best || r.spread < best.spread || (r.spread === best.spread && r.avg < best.avg)) best = r;
  }
  return { rows: out, fairestId: best ? best.id : null };
}
