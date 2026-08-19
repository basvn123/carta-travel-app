/**
 * tripShares.js, a saved trip as a link somebody else can open.
 *
 * lib/shareLink.js already shares a trip with no backend at all, by packing
 * the whole draft into the URL hash. That stays the right answer for a draft.
 * It cannot be the answer for a SAVED trip: a filed trip carries a memory
 * whose photographs are data URLs, which no URL will hold, and a link with the
 * trip baked into it can never be taken back.
 *
 * So a saved trip is shared by token. The reader never queries the tables:
 * everything comes back through get_shared_trip, one security definer function
 * that decides what leaves the account and strips the rest (the ledger, the
 * booking references, the private notes, and the account behind a crew
 * member's name). See supabase/migrations/009_trip_shares.sql, which carries
 * the reasoning and a self-check that proves the whitelist holds.
 *
 * Reading needs no account, which is the point: a share whose first screen is
 * a signup wall does not get opened. Creating one does, because only a saved
 * trip has something to share, and only an account has saved trips.
 */
import { supabase } from './../lib/supabaseClient.js';

/** Where and when, or the whole memory: story, rating, photographs, and what
 *  the owner says the trip cost them. Never the group's expense ledger. */
export const SHARE_SCOPES = ['itinerary', 'memory'];

const PARAM = 'shared';

/** The full link for a token. Kept in the hash, like the trip link already is,
 *  so the token never reaches a server log. */
export function buildShareUrl(token) {
  if (!token || typeof window === 'undefined') return null;
  return `${window.location.origin}${window.location.pathname}#${PARAM}=${token}`;
}

/** The token in the current URL, or null. Read once at startup, alongside the
 *  existing #trip= reader; Supabase's own auth links also land in the hash, so
 *  only a hash carrying our own param is touched. */
export function readShareTokenFromUrl() {
  if (typeof window === 'undefined') return null;
  const hash = (window.location.hash || '').replace(/^#/, '');
  if (!hash.includes(`${PARAM}=`)) return null;
  const token = new URLSearchParams(hash).get(PARAM);
  // A token is a uuid or it is nothing. Refusing anything else here keeps a
  // tampered link from reaching the database at all.
  return /^[0-9a-f-]{36}$/i.test(token || '') ? token : null;
}

/** Strips our param from the address bar without disturbing anything else in
 *  the hash, and without adding a history entry. */
export function stripShareTokenFromUrl() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  params.delete(PARAM);
  const rest = params.toString();
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ''}`,
  );
}

/* ---- the owner's side ---- */

export async function fetchTripShares(tripPlanId) {
  const { data, error } = await supabase
    .from('trip_shares')
    .select('token, scope, created_at, expires_at, revoked_at')
    .eq('trip_plan_id', tripPlanId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createTripShare(userId, tripPlanId, scope = 'itinerary') {
  const { data, error } = await supabase
    .from('trip_shares')
    .insert({
      owner_id: userId,
      trip_plan_id: tripPlanId,
      scope: SHARE_SCOPES.includes(scope) ? scope : 'itinerary',
    })
    .select('token, scope, created_at')
    .single();
  if (error) throw error;
  return data;
}

/** Withdraws a link. A tombstone rather than a delete, so a token can never be
 *  re-issued to a different trip by chance, and so "who did I send this to"
 *  stays answerable. */
export async function revokeTripShare(token) {
  const { error } = await supabase
    .from('trip_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token', token);
  if (error) throw error;
}

/* ---- the reader's side ---- */

// ?sharemock verify seam, same precedent as ?savedmock on the trips panel and
// ?provmock on the price surfaces: a fixture stands in for the RPC so the
// reader's screen can be checked headlessly without live credentials.
// ?sharemock=gone stands in for a withdrawn link. Display only, and never on
// for a real visitor unless they type the flag themselves.
const SHARE_MOCK = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('sharemock');

const MOCK_TRIP = {
  tripPlanId: '00000000-0000-4000-8000-000000000001',
  label: 'Two weeks in Portugal',
  scope: 'memory',
  createdAt: '2026-06-02T10:00:00Z',
  stops: [
    { position: 0, destination_id: 'LIS', city: 'Lisbon', country: 'Portugal', arrive_date: '2026-06-02', depart_date: '2026-06-06' },
    { position: 1, destination_id: 'OPO', city: 'Porto', country: 'Portugal', arrive_date: '2026-06-06', depart_date: '2026-06-09' },
  ],
  payload: {
    assignments: {},
    extras: {
      people: [{ name: 'Sofie' }, { name: 'Jonas' }],
      memory: {
        v: 1,
        places: [
          { id: 'LIS', city: 'Lisbon', country: 'Portugal', lat: 38.72, lon: -9.14, nights: 4 },
          { id: 'OPO', city: 'Porto', country: 'Portugal', lat: 41.15, lon: -8.61, nights: 3 },
        ],
        legs: [{ mode: 'fly' }, { mode: 'train' }],
        travellers: { adults: 2, children: 0 },
        story: 'Rain every afternoon, and the best pastel de nata of my life.',
        highlights: ['The tram up to Graca at dusk'],
        rating: 8,
        spend: { currency: 'EUR', flights: 120, stay: 340 },
        // One honest inline photo and one hostile remote one. The SQL
        // projection strips the second before it ever reaches a real client;
        // the fixture keeps it so the verify can prove the client-side guard
        // (TripMemoryView) holds even if that filter were bypassed.
        photos: [
          { id: 'ok', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' },
          { id: 'pixel', src: 'https://evil.example/p.png' },
        ],
        cover: 'ok',
      },
    },
  },
};

/**
 * The shared trip, or null when the link is unknown, revoked or expired.
 *
 * The three cases are deliberately one case here: telling a visitor "that
 * token was real but has been withdrawn" says more about the owner than they
 * agreed to. Works signed out.
 */
export async function fetchSharedTrip(token) {
  if (SHARE_MOCK) return SHARE_MOCK === 'gone' ? null : MOCK_TRIP;
  if (!supabase || !token) return null;
  const { data, error } = await supabase.rpc('get_shared_trip', { share_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    tripPlanId: row.trip_plan_id,
    label: row.label || '',
    scope: row.scope,
    createdAt: row.created_at,
    stops: Array.isArray(row.stops) ? row.stops : [],
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
  };
}
