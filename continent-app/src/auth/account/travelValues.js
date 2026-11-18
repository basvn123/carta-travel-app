import { useSettings } from '../../components/SettingsLine.jsx';
import { fromName } from '../../components/FromPicker.jsx';
import { matchProfile, PROFILE_LABEL_KEYS } from '../../browse/styles/spendBits.jsx';
import { partyText } from '../../lib/party.js';

/**
 * The traveller's price settings as Account rows read them (T933, T934):
 * the same store the Explore settings line reads and writes (SettingsContext,
 * filled once by App), so a change in either place shows in both. Nothing
 * here keeps a copy of a value.
 */
export function useTravelValues(t) {
  const s = useSettings();
  if (!s) return null;
  const party = Number.isFinite(s.party) ? s.party : 2;
  const children = s.children || 0;
  const babies = s.babies || 0;
  const profile = matchProfile(s.lifestyle || {});
  return {
    s,
    home: fromName(s) || t('origin.pickTown'),
    homeSet: !!fromName(s),
    people: partyText(t, { adults: Math.max(1, party - children), children, babies }),
    party,
    bed: t(`stay.${s.stayTier || 'home'}`),
    vibe: profile ? t(PROFILE_LABEL_KEYS[profile]) : t('lifestyle.custom'),
    priceView: s.priceView === 'total' ? t('party.viewTotal') : t('party.viewPp'),
  };
}
