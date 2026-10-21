/**
 * passMoments.js, the paid moments of roadmap 1.15 point 5 (T497): which
 * heading and line each gate opens the pass sheet with, which plan it opens
 * on, and how a checkout failure is worded. Pure, so the PassModal and the
 * pricing page share it and a node test can read it.
 *
 * Keys only: every figure in the copy is filled from lib/pricing.js.
 */
export const REASON_COPY = {
  plans:     { heading: 'pass.headingPlans',     sub: 'pass.subPlans' },
  ground:    { heading: 'pass.headingGround',    sub: 'pass.subGround' },
  export:    { heading: 'pass.headingExport',    sub: 'pass.subExport' },
  exportCal: { heading: 'pass.headingExportCal', sub: 'pass.subExport' },
  exportMap: { heading: 'pass.headingExportMap', sub: 'pass.subExport' },
  import:    { heading: 'pass.headingImport',    sub: 'pass.subImport' },
  save:      { heading: 'pass.headingSave',      sub: 'pass.subSave' },
  plansLow:  { heading: 'pass.headingPlansLow' },
  expiring:  { heading: 'pass.headingExpiring' },
};

/** The offers nothing was blocked for (usePaywall GATES of kind 'soft'). */
export const SOFT = new Set(['plansLow', 'expiring']);

/**
 * Which plan the sheet opens on (T488-g). At a paid moment, and when somebody
 * asked for the prices, the Trip Pass is chosen, so the price in the line
 * under the heading is the price on the button. An offer nobody asked for
 * keeps the yearly plan, except for a Trip Pass running out, which is offered
 * more days. A guest who chose a plan before signing in gets it back.
 */
export function initialPick(reason, current, initialTier = '') {
  if (initialTier === 'trip' || initialTier === 'year') return initialTier;
  if (!SOFT.has(reason)) return 'trip';
  return current === 'trip' && reason === 'expiring' ? 'trip' : 'year';
}

/** A guest's chosen plan, kept through sign-in (Google leaves the page). */
export const PENDING_PASS_KEY = 'carta.pendingPass';

/** A checkout failure code to the one sentence that explains it. */
export const FAIL_KEY = {
  auth: 'pass.errSignIn',
  no_auth_config: 'pass.errSignIn',
  no_stripe: 'pass.errUnavailable',
  no_price: 'pass.errUnavailable',
  bad_tier: 'pass.errGeneric',
  stripe_error: 'pass.errGeneric',
  pass_max: 'pass.errMax',
  subscribed: 'pass.errSubscribed',
  quota_check: 'pass.errUnavailable',
  network: 'pass.errNetwork',
};
