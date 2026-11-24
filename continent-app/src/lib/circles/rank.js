/**
 * rank.js, the Stemmen step of a kring (G16, decision 0017).
 *
 * A proposal's score is its up votes minus its down votes. Ties go to the
 * earlier proposal, so a new idea has to win votes to pass an old one and
 * the list never shuffles on a tie.
 *
 * `myVotes` lets the page show a tap before the server answers: `values`
 * holds my own vote per proposal (1, -1 or 0 for cleared) and replaces any
 * stored row of mine (`me`) for that proposal.
 */

function timeOf(p) {
  const n = Date.parse(p?.created_at || '');
  return Number.isFinite(n) ? n : Infinity;
}

export function rankProposals(proposals, votes, myVotes = {}) {
  const me = myVotes?.me ?? null;
  const mine = myVotes?.values || {};
  const tally = new Map();
  const add = (pid, uid, value) => {
    if (value !== 1 && value !== -1) return;
    const row = tally.get(pid) || { up: 0, down: 0, upBy: [] };
    if (value === 1) { row.up += 1; row.upBy.push(uid); } else row.down += 1;
    tally.set(pid, row);
  };
  for (const v of votes || []) {
    if (!v) continue;
    if (me != null && v.user_id === me && Object.prototype.hasOwnProperty.call(mine, v.proposal_id)) continue;
    add(v.proposal_id, v.user_id, Number(v.value));
  }
  for (const [pid, value] of Object.entries(mine)) {
    if (me != null) add(pid, me, Number(value));
  }
  const myVote = (pid) => {
    if (Object.prototype.hasOwnProperty.call(mine, pid)) return Number(mine[pid]) || 0;
    const row = (votes || []).find((v) => v && v.proposal_id === pid && v.user_id === me);
    return row ? Number(row.value) || 0 : 0;
  };
  const rows = (proposals || []).filter(Boolean).map((p, i) => {
    const t = tally.get(p.id) || { up: 0, down: 0, upBy: [] };
    return { ...p, up: t.up, down: t.down, upBy: t.upBy, score: t.up - t.down, mine: me != null ? myVote(p.id) : 0, _i: i };
  });
  rows.sort((a, b) => b.score - a.score || timeOf(a) - timeOf(b) || a._i - b._i);
  return rows.map(({ _i, ...r }, rank) => ({ ...r, rank: rank + 1 }));
}

/** The next vote after a tap: tapping the same arrow again clears it. */
export function nextVote(current, pressed) {
  return Number(current) === Number(pressed) ? 0 : Number(pressed);
}
