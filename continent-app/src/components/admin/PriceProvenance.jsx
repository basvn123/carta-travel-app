import React, { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { DEFAULT_PRICE_REQUEST, priceDay } from '../../lib/price/index.js';
import { PRICING_RULES } from '../../lib/price/config.js';
import { formatMoney } from '../../lib/money.js';

/**
 * Where every price comes from (T696, plan rule 5): the internal view of the
 * engine's answer. The traveller sees one amount and its unit; here each line
 * shows its status, quality (live, measured, modelled, missing), basis and
 * provenance, for the app's current price request, and every rule of
 * config/pricing.json with its kind, source and review date. Admin only,
 * English only, like the rest of the admin page.
 */
const json = (v) => (v == null ? '' : JSON.stringify(v));
const TODAY = () => new Date().toISOString().slice(0, 10);

export function PriceProvenance() {
  const { t } = useI18n();
  const ctx = useFirstRun();
  const destinations = ctx?.data?.destinations || null;
  const request = ctx?.priceRequest || DEFAULT_PRICE_REQUEST;
  const [q, setQ] = useState('');

  const match = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || !destinations) return null;
    if (destinations[q.trim()]) return destinations[q.trim()];
    return Object.values(destinations).find((d) => String(d.city || '').toLowerCase() === s)
      || Object.values(destinations).find((d) => String(d.city || '').toLowerCase().startsWith(s)) || null;
  }, [q, destinations]);
  const row = useMemo(() => (match ? priceDay(match, request, destinations) : null), [match, request, destinations]);
  const today = TODAY();
  const rules = Object.entries(PRICING_RULES);

  return (
    <section>
      <h1 className="adminpage-h1">{t('admin.nav.prices')}</h1>
      <p className="adminpage-muted">{t('admin.pricesHint')}</p>
      <label className="adminpage-muted" htmlFor="admin-price-q">{t('admin.pricesFind')}</label>
      <input id="admin-price-q" className="adminpage-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      <h2 className="adminpage-h2">{t('admin.pricesRequest')}</h2>
      <pre className="adminpage-detailcell mono">{json({ ...request, lifestyle: undefined })}</pre>
      {row && (
        <>
          <h2 className="adminpage-h2">{`${match.city} (${match.id}): ${formatMoney(row.dayEur, { precision: 'cents' })}`}</h2>
          <div className="adminpage-tablewrap">
            <table className="adminpage-table">
              <thead>
                <tr><th>item</th><th>status</th><th>eur</th><th>quality</th><th>basis</th><th>provenance</th></tr>
              </thead>
              <tbody>
                {row.lines.map((l) => (
                  <tr key={l.key}>
                    <td className="mono">{l.key}</td>
                    <td className="mono">{l.status}</td>
                    <td className="mono">{l.eur == null ? 'missing' : formatMoney(l.eur, { precision: 'cents' })}</td>
                    <td className="mono">{l.quality}</td>
                    <td className="adminpage-detailcell mono">{json(l.basis)}</td>
                    <td className="adminpage-detailcell mono">{json(l.provenance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {q.trim() && !row && <p className="adminpage-muted">{t('admin.pricesNone')}</p>}
      <h2 className="adminpage-h2">{t('admin.pricesRules')}</h2>
      <div className="adminpage-tablewrap">
        <table className="adminpage-table">
          <thead>
            <tr><th>rule</th><th>kind</th><th>unit</th><th>source</th><th>set</th><th>review</th></tr>
          </thead>
          <tbody>
            {rules.map(([key, r]) => (
              <tr key={key}>
                <td className="mono">{key}</td>
                <td className="mono">{r.kind}</td>
                <td>{r.unit}</td>
                <td className="adminpage-detailcell">{r.source}</td>
                <td className="mono">{r.date}</td>
                <td className="mono">{r.review < today ? `${r.review} (${t('admin.pricesOverdue')})` : r.review}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
