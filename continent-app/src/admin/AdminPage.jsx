import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  adminAddNote, adminAnalytics, adminAiCacheReport, adminAiModelReport, adminAiUsage,
  adminBanUser, adminMargin,
  adminDeleteUser, adminGetAudit,
  adminPaywallFunnel,
  adminGetUser, adminHealth, adminListFeedback, adminListUsers, adminMark,
  adminListOverrides, adminResetQuota, adminSetConfig, adminSetFeedbackStatus,
  adminSetTier, adminStats, adminUnbanUser,
} from '../auth/admin.js';
import { supabase } from '../lib/supabaseClient.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useI18n } from '../i18n/index.jsx';
import { TIERS } from '../lib/pricing.js';
// GATES only for its hard/soft kind, as a fallback when the RPC still answers
// the pre-027 shape (no `kind` on each reason). See PaywallFunnel's kindOf.
import { GATES } from '../hooks/usePaywall.jsx';
import {
  AlertIcon, ArrowLeftIcon, DownloadIcon, LockIcon, SearchIcon,
} from '../components/Icons.jsx';
import { ContentSection } from './ContentSection.jsx';

// The back office, as a page rather than a drawer.
//
// It started as a spoke inside the account panel, which was the wrong shape
// the moment it had to show a table: 440px of slide-over is a place to change
// your own name, not a place to read every account you have. So this takes
// the whole viewport, keeps the app's own typography (Fraunces on headings,
// mono on every measured fact) and lays the work out in four sections that
// each answer one question: how is it going, who are they, what is the site
// saying, and what has been done.
//
// SECURITY, because this file will be read by somebody wondering. Nothing
// here is a permission. Every call goes through an RPC that re-checks
// membership in public.admin_users against the caller's signed token, rate
// limits the caller, and writes the outcome to an append-only trail. A
// visitor who edits this bundle to force the page open sees the same empty
// screen with "forbidden" on it, because the browser has no say in the
// answer. The lock below is a second pair of eyes on a warm session, not a
// gate; the gate is in the database.

const PAGE = 50;
const SECTIONS = ['overview', 'users', 'content', 'feedback', 'site', 'audit'];

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date(iso));
  } catch { return ''; }
}

function fmtDateTime(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch { return ''; }
}

function initial(r) {
  const s = r.displayName || r.handle || r.email || '?';
  return s.trim().charAt(0).toUpperCase();
}

function rowName(r) {
  return r.displayName || r.handle || r.email || r.id;
}

/** Four weeks of daily counts. Scaled to the busiest day, with that day's
 *  figure written out, so the chart is never the only way to read it. */
function Sparkbars({ series }) {
  const top = Math.max(...series.map((d) => d.n || 0), 1);
  return (
    <div className="adminpage-spark" role="img"
      aria-label={series.map((d) => `${d.day}: ${d.n}`).join(', ')}>
      {series.map((d) => (
        <span key={d.day} className="adminpage-sparkbar" title={`${d.day}: ${d.n}`}>
          <span style={{ height: `${Math.max((d.n / top) * 100, d.n ? 8 : 2)}%` }} />
        </span>
      ))}
    </div>
  );
}

/**
 * The pass funnel, thirty days.
 *
 * Reads top to bottom as the journey itself: how many people were asked, how
 * many walked away, how many pressed buy, how many actually hold a pass. The
 * two rates between them are the only numbers that say whether a change to
 * the gates or the price did anything.
 *
 * Guests are called out rather than folded in. They can be shown an offer but
 * cannot be followed to a purchase, so a conversion rate that quietly includes
 * them in the denominator understates every gate.
 */
/**
 * The ai_plan_cache hit rate, from migration 029.
 *
 * This is the cheapest lever the AI side has: a hit costs nothing at Google
 * and answers the traveller immediately, so the rate is read here as money
 * and as latency at once. It is shown three ways because one number cannot
 * answer the question on its own. The headline rate says where we are. The
 * per-version split says whether the last change to the cache key helped,
 * which matters because the key is normalised deliberately (T039 collapsed
 * the group bands, the free-text spelling and the empty fields into v5) and
 * a normalisation that does not move the rate is a normalisation that was
 * wrong about what forks it. The miss list says where to look next: a
 * destination that misses constantly is either genuinely rare traffic or is
 * still forking its key on something nobody has noticed.
 *
 * Deliberately not i18n'd: this panel is owner-only and the section beside it
 * is written the same way. Adding six locale files for one reader would be
 * work with no reader.
 */
function CacheHitRate({ report }) {
  const lookups = report.lookups || 0;
  const hits = report.hits || 0;
  const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '-');
  const byVersion = report.byVersion || [];
  const misses = report.topMisses || [];

  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">Plan cache hit rate ({report.days || 30} days)</h2>
      {lookups === 0 ? (
        <p className="adminpage-muted">
          No plan-day lookups recorded yet. Logging starts when the function is redeployed.
        </p>
      ) : (
        <>
          <div className="adminpage-tiles">
            <div className="adminpage-tile"><b>{pct(hits, lookups)}</b><span>Served from cache</span></div>
            <div className="adminpage-tile"><b>{hits}</b><span>Cache hits</span></div>
            <div className="adminpage-tile"><b>{lookups - hits}</b><span>Generations bought</span></div>
            <div className="adminpage-tile"><b>{report.freshRows || 0}</b><span>Rows still fresh</span></div>
          </div>
          <p className="adminpage-muted">
            Every hit is a Gemini generation not bought, and a plan the traveller gets
            without waiting. The cache serves a row for seven days, so rows past that
            age count as misses.
          </p>

          {byVersion.length > 0 && (
            <div className="adminpage-cols">
              <section className="adminpage-card">
                <h3 className="adminpage-h3">By cache key version</h3>
                <ol className="adminpage-rank">
                  {byVersion.map((v) => (
                    <li key={v.v}>
                      <span className="adminpage-rankname">v{v.v}</span>
                      <span className="adminpage-ranknum">
                        {pct(v.hits || 0, v.lookups || 0)} of {v.lookups || 0}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              {misses.length > 0 && (
                <section className="adminpage-card">
                  <h3 className="adminpage-h3">Where the misses are</h3>
                  <ol className="adminpage-rank">
                    {misses.map((m) => (
                      <li key={m.destId}>
                        <span className="adminpage-rankname">{m.destId}</span>
                        <span className="adminpage-ranknum">{m.misses}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/**
 * The AI usage rollup, from migration 030.
 *
 * Four questions in one section, in the order an owner actually asks them.
 * How close is the shared daily ceiling to biting. How much of the traffic
 * the cache absorbed. How many people were turned away, and by which cap.
 * Who is spending the most.
 *
 * Plan and ground are kept apart in every one of those, and that separation
 * is the point of the section rather than a detail of it. A plan unit is
 * tokens on Gemini Flash and is effectively free. A ground unit is a billed
 * Google Search query, and on Gemini 3 one grounded generation can run
 * several. A single blended "AI calls" figure would hide the only line item
 * that costs money behind the one that does not, which is exactly the blind
 * spot this section exists to close.
 *
 * The daily percentage is against an assumed ceiling and says so. The real
 * cap is AI_GLOBAL_DAILY_CAP in the Edge Function environment, which SQL
 * cannot read; the RPC reads a site_config mirror if one has been set and
 * otherwise assumes the function default of 200. A percentage against the
 * wrong ceiling is worse than no percentage, so the ceiling it was computed
 * against is printed next to it.
 *
 * Deliberately not i18n'd, the same as CacheHitRate above and for the same
 * reason: this panel has one reader.
 *
 * Kept self-contained so T062 can lift it into its own module unchanged.
 */
function AiUsage({ report }) {
  const cap = report.globalCap || 200;
  const daily = report.daily || [];
  const plan = report.plan || {};
  const ground = report.ground || {};
  const cache = report.cache || {};
  const rej = report.rejections || {};
  const byTier = report.rejectionsByTier || [];
  const users = report.topUsers || [];
  const peak = report.peakDay;
  const today = report.today || 0;
  const rate = cache.rate == null ? '-' : `${cache.rate}%`;

  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">AI usage ({report.days || 30} days)</h2>

      <div className="adminpage-tiles">
        <div className="adminpage-tile">
          <b>{today}</b><span>Units today of {cap} assumed cap</span>
        </div>
        <div className="adminpage-tile">
          <b>{peak ? peak.n : 0}</b>
          <span>{peak ? `Busiest day, ${peak.day}` : 'No traffic recorded'}</span>
        </div>
        <div className="adminpage-tile">
          <b>{report.daysAtCap || 0}</b><span>Days that reached the cap</span>
        </div>
        <div className="adminpage-tile">
          <b>{rate}</b><span>Served from cache</span>
        </div>
      </div>
      <p className="adminpage-muted">
        The shared daily ceiling lives in the Edge Function environment as
        AI_GLOBAL_DAILY_CAP, where SQL cannot read it, so {cap} is what this
        assumes. Set a site_config key named ai_global_daily_cap to the real
        number if the two ever drift apart.
      </p>

      <div className="adminpage-tiles">
        <div className="adminpage-tile">
          <b>{plan.units || 0}</b><span>Plan units, {plan.users || 0} accounts</span>
        </div>
        <div className="adminpage-tile">
          <b>{ground.units || 0}</b><span>Ground units, {ground.users || 0} accounts</span>
        </div>
        <div className="adminpage-tile">
          <b>{rej.userCap || 0}</b><span>Refused by their own cap</span>
        </div>
        <div className="adminpage-tile">
          <b>{rej.globalCap || 0}</b><span>Refused by the shared cap</span>
        </div>
      </div>
      <p className="adminpage-muted">
        Plan units are tokens on Flash and cost close to nothing. Ground units
        are billed Google Search queries and are the line that moves the bill,
        so the two are never added together. A refusal by a user cap is somebody
        who wanted more than their tier gives. A refusal by the shared cap is
        somebody who was turned away from a generation they had already paid for.
      </p>

      <div className="adminpage-cols">
        <section className="adminpage-card">
          <h3 className="adminpage-h3">Daily consumption</h3>
          {daily.length === 0 ? (
            <p className="adminpage-muted">
              Nothing recorded yet. The daily total ticks on the first AI call.
            </p>
          ) : (
            <>
              <Sparkbars series={daily.map((d) => ({ day: d.day, n: d.n }))} />
              <ul className="adminpage-bars">
                {daily.slice(0, 7).map((d) => (
                  <li key={d.day}>
                    <span className="adminpage-barlabel">{d.day}</span>
                    <span className="adminpage-bartrack">
                      <span className="adminpage-barfill"
                        style={{ width: `${Math.min((d.n / cap) * 100, 100)}%` }} />
                    </span>
                    <span className="adminpage-barnum">{d.n}</span>
                  </li>
                ))}
              </ul>
              <p className="adminpage-muted">
                Bars are scaled to the assumed cap, so a full bar is a day that
                ran out. The list shows the last seven days.
              </p>
            </>
          )}
        </section>

        <section className="adminpage-card">
          <h3 className="adminpage-h3">Refusals by tier</h3>
          {byTier.length === 0 ? (
            <p className="adminpage-muted">
              No refusals recorded. Logging starts when the functions are redeployed.
            </p>
          ) : (
            <ol className="adminpage-rank">
              {byTier.map((r) => (
                <li key={r.tier}>
                  <span className="adminpage-rankname">{r.tier}</span>
                  <span className="adminpage-ranknum">
                    {r.userCap || 0} own, {r.globalCap || 0} shared
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="adminpage-muted">
            Free accounts at their own wall is the offer working. Paid accounts
            at it is an allowance priced wrong.
          </p>
        </section>
      </div>

      <h3 className="adminpage-h3">Heaviest accounts</h3>
      {users.length === 0 ? (
        <p className="adminpage-muted">No AI usage recorded in this window.</p>
      ) : (
        <div className="adminpage-tablewrap">
          <table className="adminpage-table adminpage-table-static">
            <thead>
              <tr>
                <th>Account</th>
                <th>Tier</th>
                <th className="num">Plan</th>
                <th className="num">Ground</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.userId}>
                  <td>{u.email || u.userId}</td>
                  <td className="mono">{u.tier || 'free'}</td>
                  <td className="num mono">{u.plan || 0}</td>
                  <td className="num mono">{u.ground || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="adminpage-muted">
        Ranked on ground first. An account with a thousand cached plans is not
        the one eating the margin; an account with thirty grounded searches is.
      </p>
    </section>
  );
}

/** Integer cents to a euro string. Every money figure in the margin section
 *  goes through this, so nothing is ever a raw float on screen. */
function eur(cents) {
  if (cents == null) return '-';
  try {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch { return `EUR ${(cents / 100).toFixed(2)}`; }
}

/**
 * The margin dashboard, from migration 031.
 *
 * CARTA_UNIT_ECONOMICS.md is a model. It asserts EUR 6.85 of contribution per
 * purchase and hangs everything on it: the EUR 0.17 a visitor is worth, the
 * conclusion that paid acquisition cannot work, the order of the seven levers
 * in section 4. This section is the instrument that says whether the model is
 * right, which is why the comparison against 6.85 is the largest thing on it
 * and every other figure is a line leading to that one.
 *
 * It reads top to bottom as the sheet in section 3.1 reads: gross, less VAT,
 * less Stripe, to net receipts; then less AI, less the infrastructure share,
 * to contribution. Keeping the two orders identical is deliberate. Somebody
 * checking this against the document should be able to put them side by side
 * and read down both at once, and a rearranged order would cost that for
 * nothing.
 *
 * Three of the five lines are modelled rather than observed and each says so
 * on screen, in the line itself rather than in a footnote. A modelled VAT
 * figure presented like a measured one is worse than no figure, because it
 * invites somebody to file it. The rule the whole section follows: a number
 * you cannot source is a number that has to carry its source.
 *
 * The reconciliation is a real three-column table because it is genuinely
 * tabular data, ledger against dashboard against difference, and because the
 * done condition for this task is that line existing rather than the tiles
 * above it. It reads "not reconciled" until every infrastructure row for the
 * month came off an invoice, which is T016 and is not something this panel
 * can do for itself.
 *
 * Deliberately not i18n'd, the same as AiUsage and CacheHitRate above and for
 * the same reason: this panel has one reader.
 *
 * Kept self-contained so T062 can lift it into its own module unchanged.
 */
function Margin({ report, monthsBack, onMonth }) {
  const sales = report.sales || {};
  const vat = report.vat || {};
  const stripe = report.stripe || {};
  const ai = report.ai || {};
  const infra = report.infra || {};
  const con = report.contribution || {};
  const tiers = sales.byTier || [];
  const items = infra.items || [];
  const n = sales.count || 0;

  // The contribution figures come back as cents with two decimals, because a
  // per-purchase share of one month's infrastructure is not a whole cent.
  // Rounded to whole cents for display and kept exact in the delta beneath.
  const per = con.perPurchaseCents;
  const holes = (sales.excludedNoAmount || 0) + (sales.excludedCurrency || 0);

  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">Margin, {report.month || 'no month'}</h2>

      <div className="adminpage-monthpick">
        <button type="button" className="adminpage-btn"
          onClick={() => onMonth(monthsBack + 1)}>
          Earlier month
        </button>
        <span className="mono">{report.month}</span>
        <button type="button" className="adminpage-btn"
          disabled={monthsBack <= 0}
          onClick={() => onMonth(Math.max(0, monthsBack - 1))}>
          Later month
        </button>
      </div>
      {!report.closed && (
        <p className="adminpage-muted">
          This month is still running, so a part month of sales is being read
          against a whole month of infrastructure. Step back one month for a
          figure that means something.
        </p>
      )}

      <div className="adminpage-tiles">
        <div className="adminpage-tile">
          <b>{n}</b><span>Passes sold</span>
        </div>
        <div className="adminpage-tile">
          <b>{eur(report.netReceiptsCents)}</b><span>Net receipts</span>
        </div>
        <div className="adminpage-tile">
          <b>{per == null ? '-' : eur(Math.round(per))}</b>
          <span>Contribution per purchase</span>
        </div>
        <div className="adminpage-tile">
          <b>{eur(con.assumedCents)}</b><span>The model assumes</span>
        </div>
      </div>

      {per == null ? (
        <p className="adminpage-muted">
          No valued sales in this month, so there is no contribution to compare.
          The assumption stands untested until a pass is bought.
        </p>
      ) : (
        <p className="adminpage-muted">
          Measured contribution is {eur(Math.round(per))} against the{' '}
          {eur(con.assumedCents)} in CARTA_UNIT_ECONOMICS.md section 5, a
          difference of {eur(Math.round(con.deltaCents))} or {con.deltaPct}{' '}
          percent. The assumption is a blended 70/30 Trip and Year mix at
          typical AI use, so a month with a different mix or heavier use will
          differ for reasons that are not a fault in the model.
        </p>
      )}

      <h3 className="adminpage-h3">Passes sold by tier</h3>
      {tiers.length === 0 ? (
        <p className="adminpage-muted">No passes sold in this month.</p>
      ) : (
        <div className="adminpage-tablewrap">
          <table className="adminpage-table adminpage-table-static">
            <thead>
              <tr>
                <th>Tier</th>
                <th className="num">Sold</th>
                <th className="num">Gross</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((r) => (
                <tr key={r.tier}>
                  <td className="mono">{r.tier}</td>
                  <td className="num mono">{r.count}</td>
                  <td className="num mono">{eur(r.grossCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {holes > 0 && (
        <p className="adminpage-muted">
          {holes} sales are missing from every figure here: {sales.excludedNoAmount || 0}{' '}
          with no recorded amount and {sales.excludedCurrency || 0} charged in
          another currency. A sum across currencies would be nonsense, so they
          are counted rather than converted, and every total on this page is a
          floor while they exist.
        </p>
      )}

      <h3 className="adminpage-h3">From gross to contribution</h3>
      <div className="adminpage-tablewrap">
        <table className="adminpage-table adminpage-table-static">
          <thead>
            <tr>
              <th>Line</th>
              <th className="num">Month</th>
              <th className="num">Per purchase</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Gross charged</td>
              <td className="num mono">{eur(sales.grossCents)}</td>
              <td className="num mono">{n ? eur(Math.round((sales.grossCents || 0) / n)) : '-'}</td>
              <td>Observed, from the sales ledger</td>
            </tr>
            <tr>
              <td>VAT</td>
              <td className="num mono">{eur(-(vat.cents || 0))}</td>
              <td className="num mono">{n ? eur(-Math.round((vat.cents || 0) / n)) : '-'}</td>
              <td>
                Modelled, {vat.basis === 'buyer_country'
                  ? 'at each buyer state rate, the threshold is breached'
                  : 'at 21 percent Belgian, place of supply is still Belgium'}
              </td>
            </tr>
            <tr>
              <td>Stripe</td>
              <td className="num mono">{eur(-(stripe.cents || 0))}</td>
              <td className="num mono">{n ? eur(-Math.round((stripe.cents || 0) / n)) : '-'}</td>
              <td>Modelled, {stripe.rateEea} in the EEA, plus {stripe.tax} tax</td>
            </tr>
            <tr>
              <td><b>Net receipts</b></td>
              <td className="num mono"><b>{eur(report.netReceiptsCents)}</b></td>
              <td className="num mono">
                <b>{n ? eur(Math.round((report.netReceiptsCents || 0) / n)) : '-'}</b>
              </td>
              <td>Gross less the two lines above</td>
            </tr>
            <tr>
              <td>AI</td>
              <td className="num mono">{eur(-(ai.cents || 0))}</td>
              <td className="num mono">{n ? eur(-Math.round((ai.cents || 0) / n)) : '-'}</td>
              <td>
                Units observed, priced at {ai.planPrice}c a plan and{' '}
                {ai.groundPrice}c a grounded search
              </td>
            </tr>
            <tr>
              <td>Infrastructure</td>
              <td className="num mono">{eur(-(infra.cents || 0))}</td>
              <td className="num mono">
                {infra.perPurchaseCents == null
                  ? '-' : eur(-Math.round(infra.perPurchaseCents))}
              </td>
              <td>
                Ledger, {infra.actualRows || 0} invoiced and{' '}
                {infra.modelledRows || 0} modelled, split per purchase
              </td>
            </tr>
            <tr>
              <td><b>Contribution</b></td>
              <td className="num mono"><b>{eur(con.totalCents)}</b></td>
              <td className="num mono">
                <b>{per == null ? '-' : eur(Math.round(per))}</b>
              </td>
              <td>Net receipts less AI less the infrastructure share</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="adminpage-muted">
        VAT is backed out of the gross rather than added to it, because the
        prices are VAT inclusive. Stripe reports the real fee on the balance
        transaction behind each charge and nothing in this schema stores it, so
        the documented rate is applied per sale, which keeps the fixed 25 cents
        diluting a Year Pass twice as far as a Trip Pass. Infrastructure is
        split by purchase count, the same method section 3.1 uses, so the figure
        beside it is comparable by construction.
      </p>

      <h3 className="adminpage-h3">AI units this month</h3>
      <div className="adminpage-tiles">
        <div className="adminpage-tile">
          <b>{ai.planUnits || 0}</b><span>Plan units, {eur(ai.planCents)}</span>
        </div>
        <div className="adminpage-tile">
          <b>{ai.groundUnits || 0}</b><span>Ground units, {eur(ai.groundCents)}</span>
        </div>
        <div className="adminpage-tile">
          <b>{ai.dailyTotalUnits || 0}</b><span>Units on the daily counter</span>
        </div>
        <div className="adminpage-tile">
          <b>{n ? eur(Math.round((ai.cents || 0) / n)) : '-'}</b>
          <span>AI per purchase</span>
        </div>
      </div>
      <p className="adminpage-muted">
        The first two are units on entitlement periods that opened in this
        month. The daily counter is the honest per-day figure but does not
        separate plan from ground, so it cannot be priced and is here only to
        show how far the period keying moves the answer. A grounded search is
        five times a plan and is the only line that reliably costs money, so
        the two are never added together.
      </p>

      <h3 className="adminpage-h3">Reconciliation to the ledger</h3>
      <div className="adminpage-tablewrap">
        <table className="adminpage-table adminpage-table-static">
          <thead>
            <tr>
              <th>Line</th>
              <th className="num">Ledger</th>
              <th className="num">Dashboard</th>
              <th className="num">Difference</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Infrastructure spend</td>
              <td className="num mono">
                {infra.reconciled ? eur(infra.cents) : 'not invoiced'}
              </td>
              <td className="num mono">{eur(infra.cents)}</td>
              <td className="num mono">{infra.reconciled ? eur(0) : '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {infra.reconciled ? (
        <p className="adminpage-muted">
          Every infrastructure line for this month came off an invoice, so this
          month reconciles.
        </p>
      ) : (
        <p className="adminpage-muted">
          {infra.modelledRows || 0} of the {items.length} infrastructure lines
          below are still the figures CARTA_UNIT_ECONOMICS.md section 2.1
          models, not bills anybody has read. Reconciling this month against
          them would prove only that the model equals itself, which is why this
          row says not invoiced rather than zero. Replace each line with the
          real amount as T016 sets up the bookkeeping, and this row closes by
          itself.
        </p>
      )}
      {items.length > 0 && (
        <div className="adminpage-tablewrap">
          <table className="adminpage-table adminpage-table-static">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num">Amount</th>
                <th>Source</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.item}>
                  <td className="mono">{r.item}</td>
                  <td className="num mono">{eur(r.cents)}</td>
                  <td className="mono">{r.source}</td>
                  <td>{r.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PaywallFunnel({ funnel, t }) {
  const shown = funnel.shown || 0;
  const checkout = funnel.checkout || 0;
  const bought = funnel.purchased || 0;
  const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '-');
  const reasons = funnel.byReason || [];
  const kinds = funnel.byKind || [];
  // byKind and the conversionRate per reason are only on the RPC from
  // migration 027. An admin panel talking to a project still on 022 (or one
  // where 027 has not been pasted into the SQL editor yet) gets the older
  // shape back, and reading r.kind off it would be undefined for every row.
  // Falling back to the client-side GATES kind keeps the badge correct either
  // way instead of showing a blank.
  const kindOf = (reason) => (GATES[reason]?.kind === 'soft' ? 'soft' : 'hard');

  return (
    <>
      <h2 className="adminpage-h2">{t('admin.funnelTitle')}</h2>
      <p className="adminpage-muted">{t('admin.funnelHint', { days: funnel.days || 30 })}</p>
      <div className="adminpage-tiles">
        <div className="adminpage-tile"><b>{shown}</b><span>{t('admin.funnelShown')}</span></div>
        <div className="adminpage-tile"><b>{funnel.dismissed || 0}</b><span>{t('admin.funnelDismissed')}</span></div>
        <div className="adminpage-tile"><b>{checkout}</b><span>{t('admin.funnelCheckout')}</span></div>
        <div className="adminpage-tile"><b>{bought}</b><span>{t('admin.funnelBought')}</span></div>
        <div className="adminpage-tile"><b>{pct(checkout, shown)}</b><span>{t('admin.funnelRateOffer')}</span></div>
        <div className="adminpage-tile"><b>{pct(bought, checkout)}</b><span>{t('admin.funnelRatePaid')}</span></div>
      </div>
      {!!funnel.shownGuest && (
        <p className="adminpage-muted">
          {t('admin.funnelGuests', { n: funnel.shownGuest, pct: pct(funnel.shownGuest, shown) })}
        </p>
      )}

      {kinds.length > 0 && (
        <div className="adminpage-tiles adminpage-tiles-kind">
          {kinds.map((k) => (
            <div className="adminpage-tile" key={k.kind}>
              <b>{k.conversionRate != null ? `${k.conversionRate}%` : pct(k.bought || 0, k.shown || 0)}</b>
              <span>{t(k.kind === 'soft' ? 'admin.funnelKindSoft' : 'admin.funnelKindHard', { n: k.shown || 0 })}</span>
            </div>
          ))}
        </div>
      )}
      <p className="adminpage-muted">{t('admin.funnelKindHint')}</p>

      <div className="adminpage-cols">
        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.funnelByGate')}</h3>
          {reasons.length === 0 ? (
            <p className="adminpage-muted">{t('admin.funnelEmpty')}</p>
          ) : (
            <ol className="adminpage-rank">
              {reasons.map((r) => {
                const kind = r.kind || kindOf(r.reason);
                const rate = r.conversionRate != null ? `${r.conversionRate}%` : pct(r.bought || 0, r.shown || 0);
                return (
                  <li key={r.reason}>
                    <span className="adminpage-rankname">
                      {r.reason}
                      <span className={`adminpage-kindtag adminpage-kindtag-${kind}`}>
                        {t(kind === 'soft' ? 'admin.funnelKindTagSoft' : 'admin.funnelKindTagHard')}
                      </span>
                      <em>{rate} {t('admin.funnelRateGate')}</em>
                    </span>
                    <span className="adminpage-ranknum">
                      {r.shown} / {r.checkout}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="adminpage-muted">{t('admin.funnelByGateHint')}</p>
        </section>

        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.funnelDaily')}</h3>
          <Sparkbars series={(funnel.daily || []).map((d) => ({ day: d.day, n: d.shown }))} />
          <p className="adminpage-muted">{t('admin.funnelDailyHint')}</p>
        </section>
      </div>
    </>
  );
}

export function AdminPage({ onClose }) {
  const { t } = useI18n();
  const { user, hasPassword, reauthenticate, sendPasswordReset } = useAuth();

  const [unlocked, setUnlocked] = useState(false);
  const [lockValue, setLockValue] = useState('');
  const [lockBusy, setLockBusy] = useState(false);
  const [lockErr, setLockErr] = useState('');

  const [section, setSection] = useState('overview');
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [modelReport, setModelReport] = useState(null);
  const [cacheReport, setCacheReport] = useState(null);
  const [aiUsage, setAiUsage] = useState(null);
  // The margin dashboard opens on the last CLOSED month, not on the month in
  // progress: a part month of sales against a whole month of infrastructure is
  // not a figure anybody should read. The selector moves this offset and the
  // effect below refetches, so the RPC is asked once per month looked at.
  const [marginBack, setMarginBack] = useState(1);
  const [margin, setMargin] = useState(null);
  const [audit, setAudit] = useState(null);
  const [auditBusy, setAuditBusy] = useState(false);

  const [overrides, setOverrides] = useState([]);

  const [feedback, setFeedback] = useState(null);
  const [fbFilter, setFbFilter] = useState('new');
  const [fbBusy, setFbBusy] = useState(false);

  const [maintOn, setMaintOn] = useState(false);
  const [maintText, setMaintText] = useState('');
  const [maintBusy, setMaintBusy] = useState(false);
  const [maintSaved, setMaintSaved] = useState(false);
  const [maintErr, setMaintErr] = useState('');

  const [noticeOn, setNoticeOn] = useState(false);
  const [noticeText, setNoticeText] = useState('');
  const [noticeTone, setNoticeTone] = useState('info');
  const [noticeBusy, setNoticeBusy] = useState(false);
  const [noticeSaved, setNoticeSaved] = useState(false);
  const [noticeErr, setNoticeErr] = useState('');

  const [flags, setFlags] = useState({});
  const [newFlag, setNewFlag] = useState('');
  const [flagsBusy, setFlagsBusy] = useState(false);
  const [flagsSaved, setFlagsSaved] = useState(false);
  const [flagsErr, setFlagsErr] = useState('');

  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [degraded, setDegraded] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  // A failed list and an empty list used to look identical, which is how a
  // database of accounts read as "no accounts match that search" for an
  // afternoon. They are now different things on screen.
  const [listErr, setListErr] = useState('');
  const [csvBusy, setCsvBusy] = useState(false);
  // Bumped by the retry button. The list loads once per search, so a failure
  // on the first load would otherwise be a dead end until the page reopened.
  const [reloadKey, setReloadKey] = useState(0);
  const listReq = useRef(0);

  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [tierPick, setTierPick] = useState('free');
  const [tierDays, setTierDays] = useState('');
  const [tierBusy, setTierBusy] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [quotaArmed, setQuotaArmed] = useState(false);
  const [quotaBusy, setQuotaBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [banArmed, setBanArmed] = useState(false);
  const [banDays, setBanDays] = useState('');
  const [banBusy, setBanBusy] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const errText = useCallback((e) => {
    const code = e?.code || '';
    if (code === 'forbidden') return t('admin.errForbidden');
    if (code === 'slow_down') return t('admin.errSlow');
    if (code === 'confirm_mismatch') return t('admin.errConfirm');
    if (code === 'target_is_admin') return t('admin.errTargetAdmin');
    if (code === 'own_account') return t('admin.errOwn');
    if (code === 'bad_note') return t('admin.errNote');
    // A Postgres error carries its own message, and on this screen the person
    // reading it is the person who can fix it, so it is shown rather than
    // flattened into "something went wrong".
    if (e?.message) return e.message;
    return t('admin.errGeneric');
  }, [t]);

  // Escape closes the page, the way every other overlay in the app behaves.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const unlock = async () => {
    setLockBusy(true); setLockErr('');
    try {
      if (hasPassword) {
        await reauthenticate(lockValue);
      } else if (lockValue.trim().toLowerCase() !== (user?.email || '').toLowerCase()) {
        throw new Error('mismatch');
      }
      setUnlocked(true);
    } catch {
      setLockErr(hasPassword ? t('admin.lockWrong') : t('admin.lockWrongEmail'));
    }
    setLockBusy(false);
  };

  const loadAudit = useCallback(async (limit = 25) => {
    setAuditBusy(true);
    try { setAudit(await adminGetAudit(limit, 0)); } catch { setAudit(null); }
    setAuditBusy(false);
  }, []);

  // Its own effect, because it has its own argument. Folding it into the big
  // overview effect would refetch every other section on every month change.
  useEffect(() => {
    if (!unlocked) return;
    adminMargin(marginBack).then(setMargin).catch(() => setMargin(null));
  }, [unlocked, marginBack]);

  const loadOverrides = useCallback(async () => {
    try {
      const res = await adminListOverrides(null);
      setOverrides(res.rows || []);
    } catch { setOverrides([]); }
  }, []);

  const loadFeedback = useCallback(async (status) => {
    setFbBusy(true);
    try { setFeedback(await adminListFeedback(status === 'all' ? null : status, 100, 0)); } catch { setFeedback(null); }
    setFbBusy(false);
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    adminStats().then(setStats).catch(() => setStats(null));
    adminHealth().then(setHealth).catch(() => setHealth(null));
    adminAnalytics().then(setAnalytics).catch(() => setAnalytics(null));
    adminPaywallFunnel(30).then(setFunnel).catch(() => setFunnel(null));
    adminAiModelReport(30).then(setModelReport).catch(() => setModelReport(null));
    adminAiCacheReport(30).then(setCacheReport).catch(() => setCacheReport(null));
    adminAiUsage(30).then(setAiUsage).catch(() => setAiUsage(null));
    loadAudit(25);
    loadFeedback('new');
    loadOverrides();
    if (supabase) {
      supabase.from('site_config').select('key,value').then(({ data }) => {
        for (const row of data || []) {
          if (row.key === 'announcement' && row.value && typeof row.value === 'object') {
            setNoticeOn(!!row.value.enabled);
            setNoticeText(typeof row.value.text === 'string' ? row.value.text : '');
            setNoticeTone(row.value.tone === 'warn' ? 'warn' : 'info');
          }
          if (row.key === 'maintenance' && row.value && typeof row.value === 'object') {
            setMaintOn(!!row.value.enabled);
            setMaintText(typeof row.value.message === 'string' ? row.value.message : '');
          }
          if (row.key === 'features' && row.value && typeof row.value === 'object') {
            const clean = {};
            for (const [k, v] of Object.entries(row.value)) {
              if (typeof v === 'boolean') clean[k] = v;
            }
            setFlags(clean);
          }
        }
      });
    }
  }, [unlocked, loadAudit, loadFeedback, loadOverrides]);

  useEffect(() => {
    if (!unlocked) return undefined;
    const id = ++listReq.current;
    setListBusy(true);
    const timer = setTimeout(async () => {
      try {
        const res = await adminListUsers(search.trim() || null, PAGE, 0);
        if (id !== listReq.current) return;
        setRows(res.rows || []);
        setTotal(res.total || 0);
        setDegraded(!!res.degraded);
        setListErr('');
      } catch (e) {
        if (id === listReq.current) { setRows([]); setTotal(0); setListErr(errText(e)); }
      } finally {
        if (id === listReq.current) setListBusy(false);
      }
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [search, unlocked, errText, reloadKey]);

  const reloadList = async () => {
    try {
      const res = await adminListUsers(search.trim() || null, Math.max(rows.length, PAGE), 0);
      setRows(res.rows || []);
      setTotal(res.total || 0);
    } catch { /* the table keeps what it had */ }
  };

  const loadMore = async () => {
    try {
      const res = await adminListUsers(search.trim() || null, PAGE, rows.length);
      setRows((r) => [...r, ...(res.rows || [])]);
      setTotal(res.total || 0);
    } catch (e) { setListErr(errText(e)); }
  };

  const openUser = async (id) => {
    setDetailBusy(true);
    setActionErr(''); setActionNotice('');
    setQuotaArmed(false); setBanArmed(false); setBanDays('');
    setDeleteArmed(false); setDeleteConfirm(''); setNoteText('');
    try {
      const d = await adminGetUser(id);
      setDetail(d);
      setTierPick(d.tier || 'free');
      setTierDays('');
    } catch (e) {
      setActionErr(errText(e));
    }
    setDetailBusy(false);
  };

  const refreshDetail = async (id) => {
    try { setDetail(await adminGetUser(id)); } catch { /* keep what is shown */ }
  };

  const saveNotice = async () => {
    setNoticeBusy(true); setNoticeErr(''); setNoticeSaved(false);
    try {
      await adminSetConfig('announcement', {
        enabled: noticeOn, text: noticeText.trim(), tone: noticeTone,
      });
      setNoticeSaved(true);
      loadAudit(25);
    } catch (e) { setNoticeErr(errText(e)); }
    setNoticeBusy(false);
  };

  const saveMaintenance = async () => {
    setMaintBusy(true); setMaintErr(''); setMaintSaved(false);
    try {
      await adminSetConfig('maintenance', { enabled: maintOn, message: maintText.trim() });
      setMaintSaved(true);
      loadAudit(25);
    } catch (e) { setMaintErr(errText(e)); }
    setMaintBusy(false);
  };

  const setFeedbackStatus = async (id, status) => {
    try {
      await adminSetFeedbackStatus(id, status);
      await loadFeedback(fbFilter);
      adminAnalytics().then(setAnalytics).catch(() => {});
    } catch { /* the row keeps its state, a retry is one click */ }
  };

  const saveFlags = async () => {
    setFlagsBusy(true); setFlagsErr(''); setFlagsSaved(false);
    try {
      await adminSetConfig('features', flags);
      setFlagsSaved(true);
      loadAudit(25);
    } catch (e) { setFlagsErr(errText(e)); }
    setFlagsBusy(false);
  };

  const applyTier = async () => {
    if (!detail) return;
    setTierBusy(true); setActionErr(''); setActionNotice('');
    try {
      const days = tierDays.trim() ? parseInt(tierDays, 10) : NaN;
      await adminSetTier(detail.id, tierPick, Number.isFinite(days) && days > 0 ? days : null);
      await refreshDetail(detail.id);
      setActionNotice(t('admin.passApplied'));
      adminStats().then(setStats).catch(() => {});
      reloadList(); loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setTierBusy(false);
  };

  const resetQuota = async () => {
    if (!detail) return;
    if (!quotaArmed) { setQuotaArmed(true); return; }
    setQuotaBusy(true); setActionErr(''); setActionNotice('');
    try {
      await adminResetQuota(detail.id);
      await refreshDetail(detail.id);
      setActionNotice(t('admin.quotaDone'));
      loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setQuotaBusy(false); setQuotaArmed(false);
  };

  const sendReset = async () => {
    if (!detail?.email) return;
    setResetBusy(true); setActionErr(''); setActionNotice('');
    try {
      await sendPasswordReset(detail.email);
      await adminMark('send_reset', detail.id).catch(() => {});
      await refreshDetail(detail.id);
      setActionNotice(t('admin.resetSent'));
      loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setResetBusy(false);
  };

  const doBan = async () => {
    if (!detail) return;
    setBanBusy(true); setActionErr(''); setActionNotice('');
    try {
      const days = banDays.trim() ? parseInt(banDays, 10) : 36500;
      await adminBanUser(detail.id, Number.isFinite(days) && days > 0 ? days : 36500);
      await refreshDetail(detail.id);
      setActionNotice(t('admin.banDone'));
      setBanArmed(false); reloadList(); loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setBanBusy(false);
  };

  const doUnban = async () => {
    if (!detail) return;
    setBanBusy(true); setActionErr(''); setActionNotice('');
    try {
      await adminUnbanUser(detail.id);
      await refreshDetail(detail.id);
      setActionNotice(t('admin.banLifted'));
      reloadList(); loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setBanBusy(false);
  };

  const saveNote = async () => {
    if (!detail || !noteText.trim()) return;
    setNoteBusy(true); setActionErr(''); setActionNotice('');
    try {
      await adminAddNote(detail.id, noteText.trim());
      setNoteText('');
      await refreshDetail(detail.id);
      setActionNotice(t('admin.noteSaved'));
      loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setNoteBusy(false);
  };

  const doDelete = async () => {
    if (!detail) return;
    setDeleteBusy(true); setActionErr('');
    try {
      await adminDeleteUser(detail.id, deleteConfirm.trim());
      setDetail(null);
      adminStats().then(setStats).catch(() => {});
      reloadList(); loadAudit(25);
    } catch (e) { setActionErr(errText(e)); }
    setDeleteBusy(false);
  };

  const exportCsv = async () => {
    setCsvBusy(true);
    try {
      const all = [];
      let want = Infinity;
      while (all.length < want && all.length < 5000) {
        const res = await adminListUsers(search.trim() || null, 100, all.length);
        want = res.total || 0;
        const batch = res.rows || [];
        if (!batch.length) break;
        all.push(...batch);
      }
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const head = ['id', 'email', 'handle', 'display_name', 'tier', 'pass_expires',
        'suspended_until', 'signed_up', 'last_sign_in', 'trip_plans', 'day_plans'];
      const lines = [head.join(',')].concat(all.map((r) => [
        r.id, r.email, r.handle, r.displayName, r.tier, r.expiresAt,
        r.bannedUntil, r.createdAt, r.lastSignIn, r.tripPlans, r.dayPlans,
      ].map(esc).join(',')));
      // The BOM is for Excel, which otherwise guesses the encoding wrong.
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `carta-users-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { setListErr(errText(e)); }
    setCsvBusy(false);
  };

  // ---- the lock -----------------------------------------------------------
  if (!unlocked) {
    return (
      <div className="adminpage adminpage-locked">
        <div className="adminpage-lock">
          <span className="adminpage-lock-icon" aria-hidden="true"><LockIcon size={22} /></span>
          <h1 className="adminpage-lock-title">{t('admin.title')}</h1>
          <p className="adminpage-lock-hint">
            {hasPassword ? t('admin.lockHint') : t('admin.lockHintEmail')}
          </p>
          <label className="adminpage-lock-label" htmlFor="admin-lock-input">
            {hasPassword ? t('admin.lockLabel') : t('admin.lockLabelEmail')}
          </label>
          <input
            id="admin-lock-input"
            className="adminpage-lock-input"
            type={hasPassword ? 'password' : 'email'}
            autoComplete={hasPassword ? 'current-password' : 'off'}
            value={lockValue}
            onChange={(e) => { setLockValue(e.target.value); setLockErr(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && lockValue.trim()) unlock(); }}
          />
          {lockErr && <p className="adminpage-err">{lockErr}</p>}
          <div className="adminpage-lock-actions">
            <button type="button" className="adminpage-btn" onClick={onClose}>
              {t('admin.lockCancel')}
            </button>
            <button
              type="button"
              className="adminpage-btn primary"
              disabled={lockBusy || !lockValue.trim()}
              onClick={unlock}
            >
              {lockBusy ? t('account.pleaseWait') : t('admin.lockUnlock')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const missing = (stats?.missing || []).concat(
    health?.tables
      ? Object.entries(health.tables).filter(([, present]) => !present).map(([k]) => k)
      : [],
  );
  const missingUnique = [...new Set(missing)];

  // ---- one account, in full ----------------------------------------------
  const renderDetail = () => (
    <div className="adminpage-detail">
      <button type="button" className="adminpage-back" onClick={() => setDetail(null)}>
        <ArrowLeftIcon size={13} /> {t('admin.backToList')}
      </button>

      <div className="adminpage-detail-head">
        <span className="adminpage-ava lg" aria-hidden="true">
          {detail.avatarEmoji || initial(detail)}
        </span>
        <div className="adminpage-detail-id">
          <h2>{rowName(detail)}</h2>
          <p>
            {detail.email}
            {detail.handle ? ` @${detail.handle}` : ''}
          </p>
          <code className="adminpage-uuid">{detail.id}</code>
        </div>
        <div className="adminpage-detail-chips">
          {detail.isAdmin && <span className="adminpage-chip staff">{t('admin.chipStaff')}</span>}
          {!!detail.bannedUntil && <span className="adminpage-chip banned">{t('admin.chipBanned')}</span>}
          {detail.tier !== 'free' && <span className={`adminpage-chip ${detail.tier}`}>{detail.tier}</span>}
        </div>
      </div>

      {actionNotice && <p className="adminpage-ok">{actionNotice}</p>}
      {actionErr && <p className="adminpage-err">{actionErr}</p>}

      <div className="adminpage-cols">
        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.factsTitle')}</h3>
          <dl className="adminpage-facts">
            <div><dt>{t('admin.fSignedUp')}</dt><dd>{fmtDate(detail.createdAt)}</dd></div>
            <div><dt>{t('admin.fLastSeen')}</dt><dd>{fmtDateTime(detail.lastSignIn) || t('admin.never')}</dd></div>
            <div><dt>{t('admin.fProvider')}</dt><dd>{detail.provider || 'email'}</dd></div>
            <div><dt>{t('admin.fConfirmed')}</dt><dd>{detail.confirmedAt ? t('admin.yes') : t('admin.no')}</dd></div>
            {!!detail.bannedUntil && (
              <div><dt>{t('admin.fBanned')}</dt><dd>{fmtDate(detail.bannedUntil)}</dd></div>
            )}
            <div><dt>{t('admin.fTrips')}</dt><dd>{detail.tripPlans}</dd></div>
            <div><dt>{t('admin.fDayPlans')}</dt><dd>{detail.dayPlans}</dd></div>
            <div><dt>{t('admin.fFriends')}</dt><dd>{detail.friends}</dd></div>
            <div><dt>{t('admin.fBadges')}</dt><dd>{(detail.badges || []).length}</dd></div>
            <div><dt>{t('admin.fPlansUsed')}</dt><dd>{detail.plansUsed}</dd></div>
            <div><dt>{t('admin.fGroundUsed')}</dt><dd>{detail.groundUsed}</dd></div>
          </dl>

          <h3 className="adminpage-h3">{t('admin.historyTitle')}</h3>
          {(detail.history || []).length === 0 ? (
            <p className="adminpage-muted">{t('admin.historyEmpty')}</p>
          ) : (
            <ul className="adminpage-log">
              {detail.history.map((h, i) => (
                <li key={i}>
                  <span className="adminpage-when">{fmtDateTime(h.createdAt)}</span>
                  <span className="adminpage-what">
                    <b>{h.action}</b>
                    {h.action === 'note' && h.detail?.text ? ` ${h.detail.text}`
                      : h.detail?.tier ? ` ${h.detail.tier}`
                      : h.detail?.days ? ` ${h.detail.days}d` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.passTitle')}</h3>
          {detail.tier !== 'free' && detail.expiresAt && (
            <p className="adminpage-muted">
              {t('admin.passUntil', {
                tier: t((TIERS[detail.tier] || TIERS.free).labelKey),
                date: fmtDate(detail.expiresAt),
              })}
            </p>
          )}
          <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.passTitle')}>
            {['free', 'trip', 'year'].map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={tierPick === k}
                className={`adminpage-seg ${tierPick === k ? 'on' : ''}`}
                onClick={() => setTierPick(k)}
              >
                {t(TIERS[k].labelKey)}
              </button>
            ))}
          </div>
          {tierPick !== 'free' && (
            <div className="adminpage-inline">
              <label htmlFor="admin-days">{t('admin.passDays')}</label>
              <input
                id="admin-days"
                inputMode="numeric"
                placeholder={tierPick === 'year' ? '365' : '30'}
                value={tierDays}
                onChange={(e) => setTierDays(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
          )}
          <button
            type="button"
            className="adminpage-btn primary wide"
            disabled={tierBusy || detailBusy}
            onClick={applyTier}
          >
            {tierBusy ? t('account.pleaseWait') : t('admin.passApply')}
          </button>

          <h3 className="adminpage-h3">{t('admin.supportTitle')}</h3>
          <div className="adminpage-stack">
            <button type="button" className="adminpage-btn" disabled={quotaBusy} onClick={resetQuota}>
              {quotaBusy ? t('account.pleaseWait') : quotaArmed ? t('admin.quotaConfirm') : t('admin.quotaReset')}
            </button>
            <button type="button" className="adminpage-btn" disabled={resetBusy || !detail.email} onClick={sendReset}>
              {resetBusy ? t('account.pleaseWait') : t('admin.sendReset')}
            </button>
            {!detail.bannedUntil ? (
              !banArmed ? (
                <button type="button" className="adminpage-btn" onClick={() => setBanArmed(true)}>
                  {t('admin.banArm')}
                </button>
              ) : (
                <div className="adminpage-armed">
                  <p className="adminpage-muted">{t('admin.banHint')}</p>
                  <div className="adminpage-inline">
                    <label htmlFor="admin-ban-days">{t('admin.passDays')}</label>
                    <input
                      id="admin-ban-days"
                      inputMode="numeric"
                      placeholder="36500"
                      value={banDays}
                      onChange={(e) => setBanDays(e.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </div>
                  <div className="adminpage-row">
                    <button type="button" className="adminpage-btn" onClick={() => { setBanArmed(false); setBanDays(''); }}>
                      {t('admin.banCancel')}
                    </button>
                    <button type="button" className="adminpage-btn danger" disabled={banBusy} onClick={doBan}>
                      {banBusy ? t('account.pleaseWait') : t('admin.banGo')}
                    </button>
                  </div>
                </div>
              )
            ) : (
              <button type="button" className="adminpage-btn" disabled={banBusy} onClick={doUnban}>
                {banBusy ? t('account.pleaseWait') : t('admin.banLift')}
              </button>
            )}
          </div>

          <h3 className="adminpage-h3">{t('admin.notesTitle')}</h3>
          <textarea
            className="adminpage-textarea"
            rows={3}
            maxLength={1000}
            value={noteText}
            placeholder={t('admin.notePlaceholder')}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <button
            type="button"
            className="adminpage-btn"
            disabled={noteBusy || !noteText.trim()}
            onClick={saveNote}
          >
            {noteBusy ? t('account.pleaseWait') : t('admin.noteSave')}
          </button>

          <h3 className="adminpage-h3 danger">{t('admin.dangerTitle')}</h3>
          {!deleteArmed ? (
            <button type="button" className="adminpage-btn danger" onClick={() => setDeleteArmed(true)}>
              {t('admin.deleteArm')}
            </button>
          ) : (
            <div className="adminpage-armed">
              <p className="adminpage-muted">{t('admin.deleteHint')}</p>
              <label className="adminpage-lock-label" htmlFor="admin-del-confirm">
                {t('admin.deleteConfirmLabel')}
              </label>
              <input
                id="admin-del-confirm"
                className="adminpage-lock-input"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={detail.email || detail.handle || ''}
                autoComplete="off"
              />
              <div className="adminpage-row">
                <button
                  type="button"
                  className="adminpage-btn"
                  onClick={() => { setDeleteArmed(false); setDeleteConfirm(''); }}
                >
                  {t('admin.deleteCancel')}
                </button>
                <button
                  type="button"
                  className="adminpage-btn danger solid"
                  disabled={deleteBusy || !deleteConfirm.trim()}
                  onClick={doDelete}
                >
                  {deleteBusy ? t('account.pleaseWait') : t('admin.deleteGo')}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );

  return (
    <div className="adminpage">
      <header className="adminpage-bar">
        <div className="adminpage-brand">
          <LockIcon size={15} />
          <span>{t('admin.title')}</span>
        </div>
        <nav className="adminpage-nav" aria-label={t('admin.title')}>
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`adminpage-navbtn ${section === s && !detail ? 'on' : ''}`}
              aria-current={section === s && !detail ? 'page' : undefined}
              onClick={() => { setSection(s); setDetail(null); }}
            >
              {t(`admin.nav.${s}`)}
            </button>
          ))}
        </nav>
        <button type="button" className="adminpage-close" onClick={onClose} aria-label={t('account.close')}>
          x
        </button>
      </header>

      <main className="adminpage-body">
        {missingUnique.length > 0 && (
          <div className="adminpage-warn" role="status">
            <AlertIcon size={15} />
            <span>{t('admin.missingTables', { tables: missingUnique.join(', ') })}</span>
          </div>
        )}

        {detail ? renderDetail() : (
          <>
            {section === 'overview' && (
              <>
                <h1 className="adminpage-h1">{t('admin.nav.overview')}</h1>
                <p className="adminpage-muted">{t('admin.hint')}</p>
                {stats ? (
                  <div className="adminpage-tiles">
                    <div className="adminpage-tile"><b>{stats.users}</b><span>{t('admin.statUsers')}</span></div>
                    <div className="adminpage-tile"><b>{stats.newWeek}</b><span>{t('admin.statNewWeek')}</span></div>
                    <div className="adminpage-tile"><b>{stats.newMonth}</b><span>{t('admin.statNewMonth')}</span></div>
                    <div className="adminpage-tile"><b>{stats.passesTrip}</b><span>{t('admin.statTrip')}</span></div>
                    <div className="adminpage-tile"><b>{stats.passesYear}</b><span>{t('admin.statYear')}</span></div>
                    <div className="adminpage-tile"><b>{stats.tripPlans}</b><span>{t('admin.statTrips')}</span></div>
                    <div className="adminpage-tile"><b>{stats.dayPlans}</b><span>{t('admin.statDayPlans')}</span></div>
                    <div className="adminpage-tile"><b>{stats.aiToday}</b><span>{t('admin.statAiToday')}</span></div>
                  </div>
                ) : (
                  <p className="adminpage-err">{t('admin.statsFailed')}</p>
                )}

                {analytics && (
                  <>
                    <h2 className="adminpage-h2">{t('admin.activeTitle')}</h2>
                    <p className="adminpage-muted">{t('admin.activeHint')}</p>
                    <div className="adminpage-tiles">
                      <div className="adminpage-tile"><b>{analytics.activeDay}</b><span>{t('admin.activeDay')}</span></div>
                      <div className="adminpage-tile"><b>{analytics.activeWeek}</b><span>{t('admin.activeWeek')}</span></div>
                      <div className="adminpage-tile"><b>{analytics.activeMonth}</b><span>{t('admin.activeMonth')}</span></div>
                      <div className="adminpage-tile"><b>{analytics.neverSignedIn}</b><span>{t('admin.neverIn')}</span></div>
                    </div>

                    <div className="adminpage-cols">
                      <section className="adminpage-card">
                        <h3 className="adminpage-h3">{t('admin.signupsTitle')}</h3>
                        {/* Four weeks of signups. A bar per day, scaled to the
                            busiest one, with the count in mono underneath the
                            peak so the shape is never the only information. */}
                        <Sparkbars series={analytics.signups || []} />
                        <p className="adminpage-muted">
                          {t('admin.signupsTotal', {
                            n: (analytics.signups || []).reduce((s, d) => s + (d.n || 0), 0),
                          })}
                        </p>
                      </section>

                      <section className="adminpage-card">
                        <h3 className="adminpage-h3">{t('admin.providerTitle')}</h3>
                        <p className="adminpage-muted">{t('admin.providerHint')}</p>
                        <ul className="adminpage-bars">
                          {(analytics.providers || []).map((p) => {
                            const top = Math.max(...(analytics.providers || []).map((x) => x.n), 1);
                            return (
                              <li key={p.provider}>
                                <span className="adminpage-barlabel">{p.provider}</span>
                                <span className="adminpage-bartrack">
                                  <span className="adminpage-barfill" style={{ width: `${(p.n / top) * 100}%` }} />
                                </span>
                                <span className="adminpage-barnum">{p.n}</span>
                              </li>
                            );
                          })}
                        </ul>
                      </section>
                    </div>

                    <div className="adminpage-cols">
                      <section className="adminpage-card">
                        <h3 className="adminpage-h3">{t('admin.topDestsTitle')}</h3>
                        <p className="adminpage-muted">{t('admin.topDestsHint')}</p>
                        {(analytics.topDests || []).length === 0 ? (
                          <p className="adminpage-muted">{t('admin.topNone')}</p>
                        ) : (
                          <ol className="adminpage-rank">
                            {analytics.topDests.map((d) => (
                              <li key={d.id}>
                                <span className="adminpage-rankname">
                                  {d.city || d.id}
                                  {d.country && <em>{d.country}</em>}
                                </span>
                                <span className="adminpage-ranknum">{d.n}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </section>

                      <section className="adminpage-card">
                        <h3 className="adminpage-h3">{t('admin.topCountriesTitle')}</h3>
                        {(analytics.topCountries || []).length === 0 ? (
                          <p className="adminpage-muted">{t('admin.topNone')}</p>
                        ) : (
                          <ol className="adminpage-rank">
                            {analytics.topCountries.map((c) => (
                              <li key={c.country}>
                                <span className="adminpage-rankname">{c.country}</span>
                                <span className="adminpage-ranknum">{c.n}</span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </section>
                    </div>
                  </>
                )}

                {funnel && !funnel.error && <PaywallFunnel funnel={funnel} t={t} />}

                {margin && !margin.error && (
                  <Margin report={margin} monthsBack={marginBack} onMonth={setMarginBack} />
                )}

                {aiUsage && !aiUsage.error && <AiUsage report={aiUsage} />}

                {cacheReport && !cacheReport.error && <CacheHitRate report={cacheReport} />}

                {modelReport && !modelReport.error && (
                  <section className="adminpage-card">
                    <h2 className="adminpage-h2">AI Model Fallbacks (30 days)</h2>
                    {modelReport.totalFallbacks > 0 ? (
                      <>
                        <p className="adminpage-muted">
                          Total fallbacks: <b>{modelReport.totalFallbacks}</b>
                        </p>
                        <div className="adminpage-cols">
                          <section className="adminpage-card">
                            <h3 className="adminpage-h3">By Model</h3>
                            <ul className="adminpage-bars">
                              {Object.entries(modelReport.byModel || {}).map(([model, count]) => {
                                const total = Object.values(modelReport.byModel || {}).reduce((a, b) => a + b, 0);
                                return (
                                  <li key={model}>
                                    <span className="adminpage-barlabel">{model}</span>
                                    <span className="adminpage-bartrack">
                                      <span className="adminpage-barfill" style={{ width: `${(count / total) * 100}%` }} />
                                    </span>
                                    <span className="adminpage-barnum">{count}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        </div>
                      </>
                    ) : (
                      <p className="adminpage-muted">No fallbacks recorded in the last 30 days.</p>
                    )}
                  </section>
                )}

                <h2 className="adminpage-h2">{t('admin.recentTitle')}</h2>
                {(audit?.rows || []).length === 0 ? (
                  <p className="adminpage-muted">{t('admin.auditEmpty')}</p>
                ) : (
                  <ul className="adminpage-log">
                    {(audit.rows || []).slice(0, 8).map((r) => (
                      <li key={r.id}>
                        <span className="adminpage-when">{fmtDateTime(r.createdAt)}</span>
                        <span className="adminpage-what">
                          <b>{r.action}</b>{r.target ? ` ${r.target}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {section === 'users' && (
              <>
                <div className="adminpage-headrow">
                  <h1 className="adminpage-h1">{t('admin.nav.users')}</h1>
                  <button type="button" className="adminpage-btn" disabled={csvBusy} onClick={exportCsv}>
                    <DownloadIcon size={13} /> {csvBusy ? t('account.pleaseWait') : t('admin.exportCsv')}
                  </button>
                </div>

                <div className="adminpage-search">
                  <SearchIcon size={16} />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('admin.searchPlaceholder')}
                    aria-label={t('admin.searchLabel')}
                  />
                </div>

                {degraded && (
                  <div className="adminpage-warn" role="status">
                    <AlertIcon size={15} />
                    <span>{t('admin.degraded')}</span>
                  </div>
                )}
                {listErr && (
                  <p className="adminpage-err">
                    {listErr}
                    <button
                      type="button"
                      className="adminpage-retry"
                      onClick={() => setReloadKey((k) => k + 1)}
                    >
                      {t('admin.retry')}
                    </button>
                  </p>
                )}

                {/* Three states, told apart on purpose: rows, a genuinely
                    empty search, and a failure. A failure draws no table at
                    all, because a header row over nothing reads as "your
                    database is empty" when it means "the query did not
                    run". */}
                {rows.length === 0 ? (
                  (!listBusy && !listErr) && <p className="adminpage-muted">{t('admin.none')}</p>
                ) : (
                  <div className="adminpage-tablewrap">
                    <table className="adminpage-table">
                      <thead>
                        <tr>
                          <th>{t('admin.colUser')}</th>
                          <th>{t('admin.colEmail')}</th>
                          <th>{t('admin.colPlan')}</th>
                          <th>{t('admin.colJoined')}</th>
                          <th>{t('admin.colSeen')}</th>
                          <th className="num">{t('admin.colTrips')}</th>
                          <th>{t('admin.colStatus')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} onClick={() => openUser(r.id)}>
                            <td>
                              <button
                                type="button"
                                className="adminpage-namebtn"
                                onClick={(e) => { e.stopPropagation(); openUser(r.id); }}
                              >
                                <span className="adminpage-ava" aria-hidden="true">
                                  {r.avatarEmoji || initial(r)}
                                </span>
                                <span className="adminpage-nametext">
                                  <b>{rowName(r)}</b>
                                  {r.handle && <span>@{r.handle}</span>}
                                </span>
                              </button>
                            </td>
                            <td className="mono">{r.email}</td>
                            <td>
                              {r.tier === 'free'
                                ? <span className="adminpage-muted">free</span>
                                : <span className={`adminpage-chip ${r.tier}`}>{r.tier}</span>}
                            </td>
                            <td className="mono">{fmtDate(r.createdAt)}</td>
                            <td className="mono">{fmtDateTime(r.lastSignIn) || t('admin.never')}</td>
                            <td className="mono num">{r.tripPlans}</td>
                            <td>
                              {r.isAdmin && <span className="adminpage-chip staff">{t('admin.chipStaff')}</span>}
                              {!!r.bannedUntil && <span className="adminpage-chip banned">{t('admin.chipBanned')}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {rows.length > 0 && (
                  <p className="adminpage-count">{t('admin.showing', { shown: rows.length, total })}</p>
                )}
                {rows.length < total && (
                  <button type="button" className="adminpage-btn" onClick={loadMore}>
                    {t('admin.loadMore')}
                  </button>
                )}
              </>
            )}

            {section === 'content' && (
              <ContentSection
                overrides={overrides}
                onOverridesChanged={async () => { await loadOverrides(); loadAudit(25); }}
                errText={errText}
              />
            )}

            {section === 'feedback' && (
              <>
                <h1 className="adminpage-h1">{t('admin.nav.feedback')}</h1>
                <p className="adminpage-muted">{t('admin.feedbackHint')}</p>
                <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.nav.feedback')}>
                  {['new', 'open', 'done', 'all'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={fbFilter === s}
                      className={`adminpage-seg ${fbFilter === s ? 'on' : ''}`}
                      onClick={() => { setFbFilter(s); loadFeedback(s); }}
                    >
                      {t(`admin.fb.${s}`)}
                      {s === 'new' && feedback?.new ? ` (${feedback.new})` : ''}
                    </button>
                  ))}
                </div>
                {fbBusy && <p className="adminpage-muted">{t('account.pleaseWait')}</p>}
                {!fbBusy && (feedback?.rows || []).length === 0 && (
                  <p className="adminpage-muted">{t('admin.fbEmpty')}</p>
                )}
                <div className="adminpage-fblist">
                  {(feedback?.rows || []).map((f) => (
                    <article key={f.id} className="adminpage-fb">
                      <header className="adminpage-fbhead">
                        <span className={`adminpage-chip kind-${f.kind}`}>{t(`account.feedbackKind.${f.kind}`)}</span>
                        <span className="adminpage-fbwho">
                          {f.handle ? `@${f.handle}` : f.email || t('admin.fbAnon')}
                        </span>
                        <span className="adminpage-when">{fmtDateTime(f.createdAt)}</span>
                        <span className={`adminpage-chip status-${f.status}`}>{t(`admin.fb.${f.status}`)}</span>
                      </header>
                      <p className="adminpage-fbmsg">{f.message}</p>
                      {f.context && (
                        <p className="adminpage-fbctx">
                          {[f.context.path, f.context.viewport, f.context.lang]
                            .filter(Boolean).join('  ')}
                        </p>
                      )}
                      <div className="adminpage-row">
                        {f.email && (
                          <a
                            className="adminpage-btn"
                            href={`mailto:${f.email}?subject=${encodeURIComponent('Re: your Carta feedback')}`}
                          >
                            {t('admin.fbReply')}
                          </a>
                        )}
                        {f.status !== 'open' && (
                          <button type="button" className="adminpage-btn" onClick={() => setFeedbackStatus(f.id, 'open')}>
                            {t('admin.fbMarkOpen')}
                          </button>
                        )}
                        {f.status !== 'done' && (
                          <button type="button" className="adminpage-btn" onClick={() => setFeedbackStatus(f.id, 'done')}>
                            {t('admin.fbMarkDone')}
                          </button>
                        )}
                        {f.userId && (
                          <button type="button" className="adminpage-btn" onClick={() => { setSection('users'); openUser(f.userId); }}>
                            {t('admin.fbOpenUser')}
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}

            {section === 'site' && (
              <>
                <h1 className="adminpage-h1">{t('admin.nav.site')}</h1>
                <section className="adminpage-card adminpage-maint">
                  <h3 className="adminpage-h3">{t('admin.maintTitle')}</h3>
                  <p className="adminpage-muted">{t('admin.maintHint')}</p>
                  <label className="adminpage-check">
                    <input
                      type="checkbox"
                      checked={maintOn}
                      onChange={(e) => { setMaintOn(e.target.checked); setMaintSaved(false); }}
                    />
                    <span>{t('admin.maintEnabled')}</span>
                  </label>
                  <textarea
                    className="adminpage-textarea"
                    rows={2}
                    maxLength={500}
                    value={maintText}
                    placeholder={t('admin.maintPlaceholder')}
                    onChange={(e) => { setMaintText(e.target.value); setMaintSaved(false); }}
                  />
                  {maintErr && <p className="adminpage-err">{maintErr}</p>}
                  <button
                    type="button"
                    className={`adminpage-btn wide ${maintOn ? 'danger solid' : ''}`}
                    disabled={maintBusy}
                    onClick={saveMaintenance}
                  >
                    {maintBusy ? t('account.pleaseWait')
                      : maintSaved ? t('admin.maintSaved')
                      : maintOn ? t('admin.maintClose') : t('admin.maintOpen')}
                  </button>
                </section>
                <div className="adminpage-cols">
                  <section className="adminpage-card">
                    <h3 className="adminpage-h3">{t('admin.noticeTitle')}</h3>
                    <p className="adminpage-muted">{t('admin.noticeHint')}</p>
                    <label className="adminpage-check">
                      <input
                        type="checkbox"
                        checked={noticeOn}
                        onChange={(e) => { setNoticeOn(e.target.checked); setNoticeSaved(false); }}
                      />
                      <span>{t('admin.noticeEnabled')}</span>
                    </label>
                    <textarea
                      className="adminpage-textarea"
                      rows={3}
                      maxLength={280}
                      value={noticeText}
                      placeholder={t('admin.noticePlaceholder')}
                      onChange={(e) => { setNoticeText(e.target.value); setNoticeSaved(false); }}
                    />
                    <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.noticeTitle')}>
                      {['info', 'warn'].map((tone) => (
                        <button
                          key={tone}
                          type="button"
                          role="radio"
                          aria-checked={noticeTone === tone}
                          className={`adminpage-seg ${noticeTone === tone ? 'on' : ''}`}
                          onClick={() => { setNoticeTone(tone); setNoticeSaved(false); }}
                        >
                          {t(tone === 'warn' ? 'admin.noticeToneWarn' : 'admin.noticeToneInfo')}
                        </button>
                      ))}
                    </div>
                    {noticeErr && <p className="adminpage-err">{noticeErr}</p>}
                    <button
                      type="button"
                      className="adminpage-btn primary wide"
                      disabled={noticeBusy || (noticeOn && !noticeText.trim())}
                      onClick={saveNotice}
                    >
                      {noticeBusy ? t('account.pleaseWait') : noticeSaved ? t('admin.noticeSaved') : t('admin.noticeSave')}
                    </button>
                  </section>

                  <section className="adminpage-card">
                    <h3 className="adminpage-h3">{t('admin.flagsTitle')}</h3>
                    <p className="adminpage-muted">{t('admin.flagsHint')}</p>
                    {Object.keys(flags).length === 0 && (
                      <p className="adminpage-muted">{t('admin.flagsNone')}</p>
                    )}
                    <div className="adminpage-flags">
                      {Object.entries(flags).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
                        <div key={k} className="adminpage-flag">
                          <code>{k}</code>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={v}
                            className={`adminpage-switch ${v ? 'on' : ''}`}
                            onClick={() => { setFlags((f) => ({ ...f, [k]: !v })); setFlagsSaved(false); }}
                          >
                            {v ? t('admin.flagOn') : t('admin.flagOff')}
                          </button>
                          <button
                            type="button"
                            className="adminpage-flagdel"
                            aria-label={t('admin.flagRemove')}
                            onClick={() => {
                              setFlags((f) => { const n = { ...f }; delete n[k]; return n; });
                              setFlagsSaved(false);
                            }}
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="adminpage-row">
                      <input
                        className="adminpage-lock-input mono"
                        value={newFlag}
                        aria-label={t('admin.flagAddLabel')}
                        placeholder="beta_map"
                        onChange={(e) => setNewFlag(
                          e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40),
                        )}
                      />
                      <button
                        type="button"
                        className="adminpage-btn"
                        disabled={!newFlag || flags[newFlag] !== undefined}
                        onClick={() => {
                          setFlags((f) => ({ ...f, [newFlag]: false }));
                          setNewFlag(''); setFlagsSaved(false);
                        }}
                      >
                        {t('admin.flagAdd')}
                      </button>
                    </div>
                    {flagsErr && <p className="adminpage-err">{flagsErr}</p>}
                    <button
                      type="button"
                      className="adminpage-btn primary wide"
                      disabled={flagsBusy}
                      onClick={saveFlags}
                    >
                      {flagsBusy ? t('account.pleaseWait') : flagsSaved ? t('admin.flagsSaved') : t('admin.flagsSave')}
                    </button>
                  </section>
                </div>
              </>
            )}

            {section === 'audit' && (
              <>
                <h1 className="adminpage-h1">{t('admin.nav.audit')}</h1>
                <p className="adminpage-muted">{t('admin.auditHint')}</p>
                {(audit?.rows || []).length === 0 ? (
                  <p className="adminpage-muted">{t('admin.auditEmpty')}</p>
                ) : (
                  <div className="adminpage-tablewrap">
                    <table className="adminpage-table">
                      <thead>
                        <tr>
                          <th>{t('admin.colWhen')}</th>
                          <th>{t('admin.colAction')}</th>
                          <th>{t('admin.colActor')}</th>
                          <th>{t('admin.colTarget')}</th>
                          <th>{t('admin.colDetail')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(audit.rows || []).map((r) => (
                          <tr key={r.id}>
                            <td className="mono">{fmtDateTime(r.createdAt)}</td>
                            <td><b>{r.action}</b></td>
                            <td className="mono">{r.actor}</td>
                            <td className="mono">{r.target || ''}</td>
                            <td className="adminpage-detailcell">
                              {r.detail ? JSON.stringify(r.detail) : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {(audit?.rows || []).length < (audit?.total || 0) && (
                  <button
                    type="button"
                    className="adminpage-btn"
                    disabled={auditBusy}
                    onClick={() => loadAudit((audit?.rows || []).length + 50)}
                  >
                    {auditBusy ? t('account.pleaseWait') : t('admin.loadMore')}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
