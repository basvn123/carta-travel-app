import { useEffect, useState } from 'react';
import {
  adminAiCacheReport, adminAiModelReport, adminAiUsage, adminAnalytics,
  adminEdgeErrors, adminHealth, adminPaywallFunnel, adminPipelineHealth, adminStats,
} from '../../auth/admin.js';

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
  }, [unlocked]);

  // Refreshes after an action elsewhere. A failure keeps the old figure,
  // unlike the first load, which clears it.
  const refreshStats = () => { adminStats().then(setStats).catch(() => {}); };
  const refreshAnalytics = () => { adminAnalytics().then(setAnalytics).catch(() => {}); };

  return {
    stats, health, analytics, funnel, modelReport, cacheReport, aiUsage,
    pipelineHealth, edgeErrors,
    refreshStats, refreshAnalytics,
  };
}
