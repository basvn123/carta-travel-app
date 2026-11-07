import { useEffect, useState } from 'react';
import {
  adminAiCacheReport, adminChannelWeekly, adminFunnelWeekly, adminTasteWeekly, adminAiModelReport, adminAiUsage, adminAnalytics,
  adminEdgeErrors, adminHealth, adminLaunchMetrics, adminListContentReports, adminOssThreshold,
  adminParseFailures, adminPaywallFunnel, adminPipelineHealth, adminStats,
} from '../../auth/admin.js';
import { useAiCalls } from './useAiCalls.js';

// Everything the Overview tab shows except the margin, which has its own
// month argument, and the audit strip. Fetched once at unlock.
export function useOverview(unlocked) {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [modelReport, setModelReport] = useState(null);
  const [cacheReport, setCacheReport] = useState(null);
  const [aiUsage, setAiUsage] = useState(null);
  const [pipelineHealth, setPipelineHealth] = useState(null);
  const [edgeErrors, setEdgeErrors] = useState(null);
  const [parseFailures, setParseFailures] = useState(null);
  const [oss, setOss] = useState(null);
  // Priced trips, affiliate clicks and AI calls (048). Missing before the
  // paste, which hides the Launch card and the rate on the AI failures card.
  const [launch, setLaunch] = useState(null);
  // Weekly visits per UTM channel (K12). Missing before the migration is pasted.
  const [channels, setChannels] = useState(null);
  // Weekly product funnel (I11). Missing before migration 070 is pasted.
  const [funnelWeekly, setFunnelWeekly] = useState(null);
  // Taste chip acceptance (F3, T1152-d). { error } before migration 072 is
  // pasted, so the card can say what it waits for instead of vanishing.
  const [tasteWeekly, setTasteWeekly] = useState(null);
  // DSA notices still marked new, so the Reports tab can carry a count
  // without being opened (T068-b). Only the count; the queue loads on its tab.
  const [newReports, setNewReports] = useState(null);
  // Model calls by week (E4, T1139). null before migration 071 is pasted.
  const aiCalls = useAiCalls(unlocked);

  useEffect(() => {
    if (!unlocked) return;
    adminStats().then(setStats).catch(() => setStats(null));
    adminHealth().then(setHealth).catch(() => setHealth(null));
    adminAnalytics().then(setAnalytics).catch(() => setAnalytics(null));
    adminPaywallFunnel(30).then(setFunnel).catch(() => setFunnel(null));
    adminAiModelReport(30).then(setModelReport).catch(() => setModelReport(null));
    adminAiCacheReport(30).then(setCacheReport).catch(() => setCacheReport(null));
    adminAiUsage(30).then(setAiUsage).catch(() => setAiUsage(null));
    adminPipelineHealth().then(setPipelineHealth).catch(() => setPipelineHealth(null));
    adminEdgeErrors(30).then(setEdgeErrors).catch(() => setEdgeErrors(null));
    adminParseFailures(7).then(setParseFailures).catch(() => setParseFailures(null));
    adminOssThreshold().then(setOss).catch(() => setOss(null));
    adminLaunchMetrics(30).then(setLaunch).catch(() => setLaunch(null));
    adminChannelWeekly(8).then(setChannels).catch(() => setChannels(null));
    adminFunnelWeekly(8).then(setFunnelWeekly).catch(() => setFunnelWeekly(null));
    adminTasteWeekly(8).then(setTasteWeekly).catch((e) => setTasteWeekly({ error: e?.code || 'unavailable' }));
    adminListContentReports('new', 1, 0)
      .then((r) => setNewReports(typeof r?.new === 'number' ? r.new : null))
      .catch(() => setNewReports(null));
  }, [unlocked]);

  // Refreshes after an action elsewhere. A failure keeps the old figure,
  // unlike the first load, which clears it.
  const refreshStats = () => { adminStats().then(setStats).catch(() => {}); };
  const refreshAnalytics = () => { adminAnalytics().then(setAnalytics).catch(() => {}); };

  return {
    stats, health, analytics, funnel, modelReport, cacheReport, aiUsage,
    pipelineHealth, edgeErrors, parseFailures, oss, launch, channels, funnelWeekly, tasteWeekly, newReports, aiCalls,
    refreshStats, refreshAnalytics,
  };
}
