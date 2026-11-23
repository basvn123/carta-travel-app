// G11 (guide-gaps) and E10 J-5/J-9: the same event twice changes nothing the second time.
//  - the Stripe webhook: one grant per Checkout session, whether the event is replayed or
//    arrives first as checkout.session.completed (unpaid) and later as async_payment_succeeded;
//  - the account sync push: a second push of the same things writes nothing;
//  - the checkout return URLs: a server-side allow-listed origin, a same-origin returnTo.
// The webhook's grant_pass RPC is idempotent on the session id (migration 007); the fake below
// models that and the test proves the handler asks for exactly one grant per session.
// Run: node --test tests/idempotency.test.mjs (continent-app/)
import test from "node:test";
import assert from "node:assert/strict";
import { eventAction, grantArgs } from "../../supabase/functions/_shared/stripeEvents.mjs";
import { checkoutUrls, safeReturnTo, withPass } from "../../supabase/functions/_shared/checkoutUrls.mjs";
import { syncAccountThings } from "../src/auth/accountSync.js";

const TIERS = ["trip", "year"];
const session = (over = {}) => ({ id: "cs_1", client_reference_id: "user-1", metadata: { tier: "trip", user_id: "user-1" }, payment_status: "paid", ...over });
const ev = (type, s) => ({ id: `evt_${type}`, type, data: { object: s } });

/** The webhook's handler decisions over a fake grant_pass that is idempotent on the session id. */
function webhook() {
  const grants = new Map();
  let rpcCalls = 0;
  return {
    grants,
    get rpcCalls() { return rpcCalls; },
    handle(event) {
      const act = eventAction(event);
      if (act.action !== "grant") return act.action;
      const args = grantArgs(act.session, TIERS);
      if (!args) return "skipped";
      rpcCalls += 1;
      const first = !grants.has(args.sessionId);
      if (first) grants.set(args.sessionId, { user: args.userId, tier: args.tier, days: 60 });
      return first ? "granted" : "already";
    },
  };
}

test("G11: the same checkout.session.completed twice grants one pass, once", () => {
  const w = webhook();
  const e = ev("checkout.session.completed", session());
  assert.equal(w.handle(e), "granted");
  assert.equal(w.handle(e), "already");
  assert.equal(w.grants.size, 1);
  assert.equal(w.grants.get("cs_1").days, 60);
});

test("J-9: a delayed payment is granted when it is confirmed, and only once", () => {
  const w = webhook();
  assert.equal(w.handle(ev("checkout.session.completed", session({ payment_status: "unpaid" }))), "pending");
  assert.equal(w.grants.size, 0, "unpaid grants nothing");
  assert.equal(w.handle(ev("checkout.session.async_payment_succeeded", session())), "granted");
  assert.equal(w.handle(ev("checkout.session.async_payment_succeeded", session())), "already");
  assert.equal(w.grants.size, 1);
});

test("J-9: a failed async payment grants nothing and is reported, other events are ignored", () => {
  const w = webhook();
  assert.equal(w.handle(ev("checkout.session.async_payment_failed", session({ payment_status: "unpaid" }))), "failed");
  assert.equal(w.handle(ev("invoice.paid", {})), "ignore");
  assert.equal(w.grants.size, 0);
});

test("G11: a session with no user or an unknown tier grants nothing and does not retry forever", () => {
  const w = webhook();
  assert.equal(w.handle(ev("checkout.session.completed", session({ client_reference_id: "", metadata: { tier: "trip" } }))), "skipped");
  assert.equal(w.handle(ev("checkout.session.completed", session({ metadata: { tier: "gold", user_id: "u" } }))), "skipped");
  assert.equal(w.rpcCalls, 0);
});

test("G11: pushing the same account things twice writes nothing the second time", async () => {
  const rows = new Map();
  let upserts = 0;
  const cloud = {
    async fetch(userId) { return [...rows.values()].filter((r) => r.user_id === userId).map((r) => ({ ...r })); },
    async upsert(list) { upserts += list.length; for (const r of list) rows.set(`${r.user_id}|${r.kind}|${r.item_id}`, { ...r }); },
  };
  const m = new Map([["carta.keptTrips.v1", JSON.stringify([{ id: "k1", name: "Porto", country: "PT", keptAt: new Date(1000).toISOString(), nights: 4 }])]]);
  const storage = {
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); },
  };
  const first = await syncAccountThings({ userId: "u", storage, cloud, now: 5000 });
  assert.ok(first.pushed >= 1);
  const written = upserts;
  const again = await syncAccountThings({ userId: "u", storage, cloud, now: 6000 });
  assert.equal(again.pushed, 0);
  assert.equal(upserts, written, "the second push wrote no row");
  assert.equal(rows.size, 1);
});

test("J-5: checkout URLs come from the server's own origin, never the request's, and fail closed without one", () => {
  assert.equal(checkoutUrls({}, "/trip"), null);
  assert.equal(checkoutUrls({ APP_ORIGIN: "http://evil" }, "/"), null, "plain http is not an allowed origin");
  const u = checkoutUrls({ APP_ORIGIN: "https://carta.example/" }, "/trip?id=3#day");
  assert.equal(u.success, "https://carta.example/trip?id=3&pass=ok#day");
  assert.equal(u.cancel, "https://carta.example/trip?id=3&pass=cancel#day");
  const own = checkoutUrls({ CHECKOUT_SUCCESS_URL: "https://x.example/?pass=ok", CHECKOUT_CANCEL_URL: "https://x.example/?pass=cancel" }, "/");
  assert.equal(own.success, "https://x.example/?pass=ok");
});

test("J-5: returnTo is a same-origin path or it becomes the home page", () => {
  for (const bad of ["https://evil.example/", "//evil.example", "/\\evil", "javascript:alert(1)", "/javascript:x", "", null, 7, `/${"a".repeat(600)}`, "/a\nb"]) {
    assert.equal(safeReturnTo(bad), "/", String(bad).slice(0, 20));
  }
  assert.equal(safeReturnTo("/places?month=7#top"), "/places?month=7#top");
  assert.equal(withPass("/a?pass=old&x=1", "ok"), "/a?pass=ok&x=1");
});
