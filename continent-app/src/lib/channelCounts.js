/**
 * channelCounts.js, the client half of the cookieless channel counts (K12, T1109).
 *
 * On landing, read the UTM parameters, reduce them to a channel name and
 * send one tick to a per-day counter on the server. That is all.
 *
 * What is sent: a channel (utm_source, lower-cased, letters digits _ - only,
 * 32 characters at most, or 'none' when the link carried none) and a medium
 * bucket (email, social, paid, referral, organic, other, none). utm_campaign,
 * utm_content, utm_term, the full URL, the referrer, the path, the language
 * and the time of day are never read.
 * What is not stored: no cookie, no localStorage or sessionStorage value, no
 * device or session id, no IP. A reload of the page counts again; that
 * over-count is the price of not remembering anyone (docs/legal/ARTICLE30.md,
 * same basis as launchEvents.js, T214).
 *
 * FIRE AND FORGET: never throws, never awaited, a missing backend is silent.
 * Visits with no UTM at all are counted as 'none' so the weekly number has a
 * denominator, but are not split any further.
 */
const MEDIUMS = {
  email: 'email', newsletter: 'email', mail: 'email',
  social: 'social', 'social-media': 'social', sm: 'social',
  cpc: 'paid', ppc: 'paid', paid: 'paid', paidsocial: 'paid', display: 'paid',
  referral: 'referral', affiliate: 'referral', partner: 'referral',
  organic: 'organic', seo: 'organic',
};

/** Reduce one free-text UTM value to the shape the server accepts. */
export function cleanChannel(raw) {
  const s = String(raw == null ? '' : raw).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return s || 'none';
}

export function mediumBucket(raw) {
  const s = String(raw == null ? '' : raw).toLowerCase().trim();
  if (!s) return 'none';
  return MEDIUMS[s] || 'other';
}

/** { channel, medium } from a location.search string. Pure. */
export function channelOf(search) {
  let params;
  try { params = new URLSearchParams(search || ''); } catch { params = new URLSearchParams(); }
  return { channel: cleanChannel(params.get('utm_source')), medium: mediumBucket(params.get('utm_medium')) };
}

/**
 * Send one tick through `rpc(name, args)` (supabase.rpc in the app, a stub in
 * tests). Resolves, never rejects.
 */
export async function sendChannelVisit(rpc, search) {
  const { channel, medium } = channelOf(search);
  try {
    await rpc('channel_visit', { p_channel: channel, p_medium: medium });
  } catch { /* a counter is never worth an error */ }
  return { channel, medium };
}

let sent = false;
/** Once per page load, from main.jsx. */
export function trackChannelVisit(search = typeof window !== 'undefined' ? window.location.search : '') {
  if (sent) return;
  sent = true;
  try {
    // Loaded on demand so the pure helpers above import cleanly under node.
    import('./supabaseClient.js')
      .then(({ authConfigured, getSupabase }) => (authConfigured ? getSupabase() : null))
      .then((supabase) => supabase && sendChannelVisit((fn, args) => supabase.rpc(fn, args), search))
      .then(() => {}, () => {});
  } catch { /* the page carries on */ }
}

/**
 * Shape the admin_channel_weekly report for display: weeks newest first, each
 * with its total and channels sorted by count, plus the latest full number.
 * Pure, so the admin view and the test share it.
 */
export function channelWeeksView(report) {
  if (!report || report.error || !Array.isArray(report.weeks)) return null;
  const weeks = report.weeks
    .map((w) => {
      const channels = (w.channels || [])
        .map((c) => ({ channel: c.channel, n: Number(c.n) || 0 }))
        .sort((a, b) => b.n - a.n || a.channel.localeCompare(b.channel));
      return { week: w.week, total: channels.reduce((s, c) => s + c.n, 0), channels };
    })
    .sort((a, b) => (a.week < b.week ? 1 : -1));
  return { weeks, current: weeks[0] || null };
}
