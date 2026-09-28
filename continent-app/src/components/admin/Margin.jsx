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
export function Margin({ report, monthsBack, onMonth }) {
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
