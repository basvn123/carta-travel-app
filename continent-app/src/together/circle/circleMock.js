/**
 * circleMock.js, the kringen fixture of the ?friendsmock seam (G16,
 * decision 0017). Display only, behind E2E_SEAMS like the rest of the seam.
 *
 * Unif: five members (you own it), four proposals, availability in May 2027
 * and home airports BRU, CRL and EIN; Familie: three members, one proposal.
 * The fares are fixture fares, so a headless check prices the same every
 * run; the live app reads the swept flight files instead.
 *
 * ?friendsmock=circle opens on the same fixture; the kring screens are
 * reached with &tv=circle&tg=c-unif and &tgs=vote|dates|flights|pick.
 */
import { MOCK_ME } from '../friendsMock.js';

const at = (d) => `2026-${d}T10:00:00Z`;

export function mockCircles() {
  const unif = {
    id: 'c-unif', name: 'Unif', ownerId: MOCK_ME, createdAt: at('10-01'), myStatus: 'joined',
    members: [
      { userId: MOCK_ME, status: 'joined', handle: 'bas_v', name: 'Bas', emoji: '', homeAirport: 'BRU' },
      { userId: 'u-sam', status: 'joined', handle: 'sam_m', name: 'Sam Martens', emoji: '', homeAirport: 'BRU' },
      { userId: 'u-jo', status: 'joined', handle: 'jo_p', name: 'Jo Peeters', emoji: '', homeAirport: 'EIN' },
      { userId: 'u-lea', status: 'joined', handle: 'lea_d', name: 'Léa Dubois', emoji: '', homeAirport: 'CRL' },
      { userId: 'u-ana', status: 'joined', handle: 'ana_r', name: 'Ana Rocha', emoji: '', homeAirport: 'BRU' },
    ],
    proposals: [
      { id: 'p-spu', destId: 'SPU', createdBy: 'u-sam', created_at: at('10-02') },
      { id: 'p-kot', destId: 'gem:kotor', createdBy: 'u-jo', created_at: at('10-03') },
      { id: 'p-svq', destId: 'SVQ', createdBy: 'u-lea', created_at: at('10-04') },
      { id: 'p-nap', destId: 'NAP', createdBy: 'u-ana', created_at: at('10-05') },
    ],
    votes: [
      { proposal_id: 'p-spu', user_id: 'u-sam', value: 1 },
      { proposal_id: 'p-spu', user_id: 'u-jo', value: 1 },
      { proposal_id: 'p-spu', user_id: 'u-lea', value: 1 },
      { proposal_id: 'p-spu', user_id: 'u-ana', value: 1 },
      { proposal_id: 'p-kot', user_id: 'u-jo', value: 1 },
      { proposal_id: 'p-kot', user_id: 'u-ana', value: 1 },
      { proposal_id: 'p-kot', user_id: 'u-lea', value: -1 },
      { proposal_id: 'p-svq', user_id: 'u-lea', value: 1 },
      { proposal_id: 'p-svq', user_id: 'u-sam', value: 1 },
      { proposal_id: 'p-nap', user_id: 'u-ana', value: 1 },
      { proposal_id: 'p-nap', user_id: 'u-jo', value: -1 },
      { proposal_id: 'p-nap', user_id: 'u-sam', value: -1 },
    ],
    availability: [
      { id: 'a1', user_id: MOCK_ME, start_date: '2027-05-08', end_date: '2027-05-18' },
      { id: 'a2', user_id: 'u-sam', start_date: '2027-05-10', end_date: '2027-05-16' },
      { id: 'a3', user_id: 'u-jo', start_date: '2027-05-12', end_date: '2027-05-22' },
      { id: 'a4', user_id: 'u-lea', start_date: '2027-05-01', end_date: '2027-05-15' },
      { id: 'a5', user_id: 'u-ana', start_date: '2027-05-11', end_date: '2027-05-20' },
    ],
    // Return fares a person, by proposal and home airport; null is no swept
    // fare (the dashed "No price yet" cell).
    mockFares: {
      'p-spu': { BRU: 96, EIN: 142, CRL: 118 },
      'p-svq': { BRU: 128, EIN: 109, CRL: 99 },
      'p-kot': { BRU: null, EIN: 171, CRL: null },
      'p-nap': { BRU: 88, EIN: 120, CRL: 75 },
    },
  };
  const family = {
    id: 'c-family', name: 'Familie', ownerId: 'u-ana', createdAt: at('09-01'), myStatus: 'joined',
    members: [
      { userId: 'u-ana', status: 'joined', handle: 'ana_r', name: 'Ana Rocha', emoji: '', homeAirport: 'BRU' },
      { userId: MOCK_ME, status: 'joined', handle: 'bas_v', name: 'Bas', emoji: '', homeAirport: 'BRU' },
      { userId: 'u-sam', status: 'joined', handle: 'sam_m', name: 'Sam Martens', emoji: '', homeAirport: 'BRU' },
    ],
    proposals: [{ id: 'p-bru', destId: 'gem:ghent', createdBy: 'u-ana', created_at: at('09-02') }],
    votes: [
      { proposal_id: 'p-bru', user_id: 'u-ana', value: 1 },
      { proposal_id: 'p-bru', user_id: MOCK_ME, value: 1 },
    ],
    availability: [],
    mockFares: {},
  };
  return [unif, family];
}
