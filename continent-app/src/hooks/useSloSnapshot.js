// The SLO panel's data (ROADMAP H8, T1160): config/slo.json plus a snapshot.
// The snapshot is src/admin/sloSnapshot.json (built into the app, empty until
// the owner runs the SLO collector, see docs/runbooks/slo.md). Nothing is
// fetched: a panel about outages must not depend on the thing that is down.
import { useMemo } from 'react';
import config from '../../config/slo.json';
import shipped from '../admin/sloSnapshot.json';
import { evaluateAll, overall } from '../lib/slo.js';

export function useSloSnapshot(snapshot = shipped, cfg = config) {
  return useMemo(() => {
    const rows = evaluateAll(cfg, snapshot);
    return { rows, overall: overall(rows), generatedAt: snapshot?.generatedAt || null, windowDays: snapshot?.windowDays || cfg.window_days };
  }, [snapshot, cfg]);
}
