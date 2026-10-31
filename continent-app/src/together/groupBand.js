/**
 * groupBand.js, the client half of a group trip's decisions (T931).
 *
 * The band itself is computed on the server, by group_trip_band() in
 * migration 055, so no member's maximum ever reaches another member's
 * browser. This module holds what the browser does with the answer: the
 * tallies of the two polls, the leading option, whether a price fits the
 * band and where things sit on the band's bar. bandTopFrom() mirrors the
 * SQL definition so the dev seam and the tests use the same rule.
 *
 * THE BAND (055): the lowest maximum any joined member set, rounded down to
 * a multiple of 5, and only once at least three members have set one.
 */

export const BAND_MIN_SET = 3;
export const BAND_STEP = 5;

/** The SQL rule, for the seam and the tests: null below three budgets. */
export function bandTopFrom(maxes, minSet = BAND_MIN_SET) {
  const ok = (maxes || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (ok.length < minSet) return null;
  return Math.floor(Math.min(...ok) / BAND_STEP) * BAND_STEP;
}

/** The RPC's row as the page reads it. */
export function bandState(row) {
  const top = row && Number.isFinite(Number(row.band_top)) && row.band_top !== null ? Number(row.band_top) : null;
  return {
    top,
    set: Number(row?.members_set) || 0,
    members: Number(row?.members) || 0,
    ready: top != null,
  };
}

/** Whether a day price fits everyone: true, false, or null when unknown. */
export function fitsBand(price, band) {
  if (!band?.ready || !Number.isFinite(price)) return null;
  return price <= band.top;
}

/**
 * One poll's options with their votes.
 *   options  [{ id, kind, ... }] of one kind
 *   votes    [{ kind, userId, optionId }]
 *   me       your user id
 * Returns the options in their order, each with { count, voters: [userId],
 * mine: boolean, share: 0..1 of the voters on this question }.
 */
export function tally(options, votes, me) {
  const list = options || [];
  const kind = list[0]?.kind;
  const onQ = (votes || []).filter((v) => !kind || v.kind === kind);
  const total = onQ.length;
  return list.map((o) => {
    const voters = onQ.filter((v) => v.optionId === o.id).map((v) => v.userId);
    return { ...o, count: voters.length, voters, mine: voters.includes(me), share: total ? voters.length / total : 0 };
  });
}

/**
 * The leading option: most votes, then the lower price where both have one,
 * then the order they were added in. Null with no options; with no votes at
 * all, null too, because a poll nobody answered has no winner.
 */
export function leader(tallied, priceOf = () => null) {
  const withVotes = (tallied || []).filter((o) => o.count > 0);
  if (!withVotes.length) return null;
  return withVotes
    .map((o, i) => ({ o, i, p: priceOf(o) }))
    .sort((a, b) => (b.o.count - a.o.count)
      || ((Number.isFinite(a.p) && Number.isFinite(b.p)) ? a.p - b.p : 0)
      || (a.i - b.i))[0].o;
}

/** Whether you still owe a vote on a question that has options. */
export function owesVote(options, votes, me, kind) {
  const has = (options || []).some((o) => o.kind === kind);
  if (!has) return false;
  return !(votes || []).some((v) => v.kind === kind && v.userId === me);
}

/**
 * The band's bar: a scale from 0 to a round number above every figure on
 * it, and each figure's position in percent.
 */
export function barScale(figures) {
  const ok = (figures || []).filter((n) => Number.isFinite(n) && n > 0);
  const hi = ok.length ? Math.max(...ok) : 100;
  const max = Math.max(20, Math.ceil((hi * 1.15) / 20) * 20);
  const pct = (v) => Math.max(0, Math.min(100, Math.round((v / max) * 1000) / 10));
  return { max, pct };
}
