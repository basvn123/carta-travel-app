import { useI18n } from '../../i18n/index.jsx';
import { useState } from 'react';
import { geocodeAddress } from '../../lib/geocode.js';
import { CarIcon } from '../../components/Icons.jsx';

/** "Driving from" editor for own-car trips: the drive out/home legs price
 *  from this point. Same explicit-search Nominatim flow as the wizard. */
export function OwnCarFromEditor({ carHome, setCarHome }) {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    const q = query.trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setResults(await geocodeAddress(q));
    setBusy(false);
  };
  if (carHome) {
    return (
      <p className="trip-note trip-carfrom-note">
        <CarIcon size={11} /> {t('trip.drivingFrom', { from: carHome.name })}
        {' '}
        <button className="trip-carfrom-change" onClick={() => setCarHome(null)}>{t('wizard.change')}</button>
      </p>
    );
  }
  return (
    <div className="trip-carfrom">
      <div className="trip-carfrom-row">
        <input
          className="trip-ownflight-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          placeholder={t('wizard.carFromPlaceholder')}
          aria-label={t('wizard.carFromLabel')}
        />
        <button className="trip-carfrom-btn" onClick={search} disabled={busy || query.trim().length < 3}>
          {busy ? t('wizard.searching') : t('wizard.search')}
        </button>
      </div>
      {results.length > 0 && (
        <div className="trip-carfrom-results">
          {results.map((r, i) => (
            <button
              key={`${r.lat},${r.lon},${i}`}
              className="trip-carfrom-result"
              onClick={() => { setCarHome({ name: r.shortLabel, lat: r.lat, lon: r.lon }); setResults([]); setQuery(''); }}
            >{r.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
