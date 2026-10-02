// The One Stop Shop threshold, from migration 026 (T033, T270). Cross-border
// EU sales to consumers this year against the EUR 10,000 limit. Stripe Tax
// does its own monitoring and stays authoritative; this is the backstop that
// puts the figure where the owner already looks.
//
// Two integrity counts ride along. A sale with no country, or with no amount,
// makes the total a floor rather than the answer, and the card says so
// instead of showing a small number as if it were settled.
function eur(cents) {
  if (cents == null) return '-';
  try {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
    }).format(cents / 100);
  } catch { return `EUR ${(cents / 100).toFixed(2)}`; }
}

export function OssThreshold({ report }) {
  if (!report || report.error) return null;
  const pct = Number(report.currentPct) || 0;
  const holes = (report.unknownCountry || 0) + (report.unknownAmount || 0);
  const currencies = report.currencies || [];
  const mixed = currencies.some((c) => String(c.currency).toLowerCase() !== 'eur');
  return (
    <section className="adminpage-card">
      <h2 className="adminpage-h2">VAT One Stop Shop threshold ({report.currentYear})</h2>
      <div className="adminpage-tiles">
        <div className="adminpage-tile">
          <b>{eur(report.currentCents)}</b>
          <span>Cross-border EU sales this year</span>
        </div>
        <div className="adminpage-tile">
          <b>{pct.toFixed(1)}%</b>
          <span>of {eur(report.thresholdCents)}</span>
        </div>
      </div>
      <div className="adminpage-bartrack" role="img" aria-label={`${pct.toFixed(1)} percent of the threshold`}>
        <span className="adminpage-barfill" style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      {report.breached && (
        <p className="adminpage-err" role="alert">
          The threshold was crossed this year or last. Tax is due in each buyer's country.
        </p>
      )}
      {holes > 0 && (
        <p className="adminpage-muted">
          {report.unknownCountry || 0} sales have no country and {report.unknownAmount || 0} have
          no amount, so the figure above is a floor.
        </p>
      )}
      {mixed && (
        <p className="adminpage-muted">
          Sales exist in more than one currency, which this total does not convert.
        </p>
      )}
    </section>
  );
}
