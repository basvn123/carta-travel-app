import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { useGuidedData } from '../lib/guidedData.js';
import { makeLabels } from '../lib/guidedSearch.js';
import { computeCosts } from '../lib/costIndex.js';
import { dedupeGateways } from '../hooks/useExploreCatalog.js';
import { AskSearch } from '../browse/AskSearch.jsx';

/**
 * Ask Carta on the Plan start page (T558): the same box as Explore's, read
 * as a plan by default ("Plan 7 days in Tuscany for food and wine"). Its one
 * primary hands the routed stops and nights to the trip planner through
 * App's openTripInPlanner, the door a published trip uses, so every stop
 * and night stays editable there. The rows are priced at the traveller's
 * Lifestyle and bed, the same inputs as Explore's cards.
 *
 * props
 *   data         the app data (the full catalogue once loaded)
 *   onOpenPlace  (id) open a place
 *   onPlanTrip   ({stops: [{dest, nights}], transport}) App's openTripInPlanner
 */
export function PlanAsk({ data, onOpenPlace, onPlanTrip }) {
  const { t, lang } = useI18n();
  const s = useSettings();
  const guided = useGuidedData(true);
  const lifestyle = s?.lifestyle || null;
  const stayTier = s?.stayTier || 'home';
  const rows = React.useMemo(() => {
    const dests = data?.destinations;
    if (!dests) return [];
    const costs = computeCosts(dests, { lifestyle, stay_tier: stayTier });
    return dedupeGateways(Object.values(dests)).map((p) => ({ ...p, cost: costs.get(p.id) || null }));
  }, [data, lifestyle, stayTier]);
  const countries = React.useMemo(() => [...new Map(rows.map((p) => [p.iso2, p.country])).entries()], [rows]);
  const labels = React.useMemo(() => makeLabels({ t, lang, guided, countries }), [t, lang, guided, countries]);
  const price = React.useMemo(() => ({ lifestyle, stayTier, flights: data?.flights || null, dests: data?.destinations || null, origin: s?.origin || null }), [lifestyle, stayTier, data, s?.origin]);
  return (
    <AskSearch t={t} lang={lang} guided={guided} rows={rows} countries={countries} labels={labels}
      mode="plan" price={price} onOpenPlace={onOpenPlace} onPlanTrip={onPlanTrip} />
  );
}
