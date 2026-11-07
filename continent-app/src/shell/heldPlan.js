import { PLAN_ONCE_KEY } from '../lib/recommend/keptStore.js';

// A trip held by Kept trips' "Plan this trip" (keptStore holdPlan, T806).
export function heldPlanWaiting() {
  try { return Boolean(window.sessionStorage.getItem(PLAN_ONCE_KEY)); } catch { return false; }
}
