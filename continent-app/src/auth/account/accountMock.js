/**
 * accountMock.js, the ?accountmock dev seam (T933 to T936).
 *
 * Same precedent as ?friendsmock, ?savedmock and ?paymock: a fixture stands
 * in for the signed-in account so every state of the Account page renders
 * without a real account and in headless checks. Display only: never on
 * unless typed, and never in a production build (E2E_SEAMS).
 *
 *   ?accountmock        a signed-in traveller with a handle, a yearly plan
 *                       that renews, usage on both meters and the counts
 *   ?accountmock=trip   the same traveller on a Trip Pass (one-off, an end
 *                       date, no cancel)
 *   ?accountmock=free   the same traveller on Free
 *   ?accountmock=guest  signed out, with the sign-in card drawn even where
 *                       this build has no auth configured
 */
import { E2E_SEAMS } from '../../lib/e2eSeams.js';

export const ACCOUNT_MOCK = E2E_SEAMS && typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('accountmock')
  : null;
export const IS_ACCOUNT_MOCK = ACCOUNT_MOCK !== null;
export const ACCOUNT_MOCK_GUEST = ACCOUNT_MOCK === 'guest';

function inDays(n) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
}

export const MOCK_USER = Object.freeze({
  id: 'u-me',
  email: 'lena@example.com',
  created_at: inDays(-400),
  user_metadata: { full_name: 'Lena Maes' },
  app_metadata: { provider: 'email', providers: ['email', 'google'] },
  identities: [{ provider: 'email' }, { provider: 'google' }],
});

export const MOCK_PROFILE = Object.freeze({ handle: 'lena_m', avatarEmoji: '' });

/** What the Account page counts, as the fixture holds it. */
export const MOCK_FACTS = Object.freeze({
  loaded: true,
  trips: 9,
  countries: 12,
  friends: 3,
  saves: 14,
  photos: 46,
  dayPlans: 23,
  chats: 11,
  nextTripDest: 'LIS',
});

/** The entitlement the fixture holds, shaped like useEntitlement's. */
export function mockEntitlement(kind = ACCOUNT_MOCK) {
  const base = {
    loading: false, known: true, refresh: () => {},
    groundUsed: 0, groundCap: 0, groundLeft: 0, subscription: null,
  };
  if (kind === 'free') {
    return { ...base, tier: 'free', expiresAt: null, resetsAt: null, plansUsed: 1, plansCap: 2, plansLeft: 1 };
  }
  if (kind === 'trip') {
    return {
      ...base, tier: 'trip', expiresAt: inDays(41), resetsAt: inDays(41),
      plansUsed: 12, plansCap: 60, plansLeft: 48, groundUsed: 3, groundCap: 40, groundLeft: 37,
    };
  }
  const renews = inDays(134);
  return {
    ...base, tier: 'year', expiresAt: renews, resetsAt: renews,
    plansUsed: 42, plansCap: 300, plansLeft: 258, groundUsed: 7, groundCap: 120, groundLeft: 113,
    subscription: { status: 'active', live: true, cancelling: false, renewsAt: renews },
  };
}
