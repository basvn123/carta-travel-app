import React, { useEffect, useMemo, useRef, useState } from 'react';
import { originGroups, originLabel } from '../lib/origins.js';
import { geocodeAddress } from '../lib/geocode.js';
import { CarIcon } from './TransportIcons.jsx';
import { MapPinIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * "Where are you travelling from?", the global departure control that reprices
 * the whole app. It asks a different question per travel mode, because a flight
 * and a road trip do not start in the same place:
 *
 *   plane  a searchable list of every European origin airport we priced fares
 *          from, grouped by country. Picking one calls `onChangeOrigin(code)`
 *          and the fares table is rehydrated upstream (useAppData).
 *   car    free text, geocoded through Nominatim on an explicit search, the
 *          same flow the wizard's "where do you drive from?" step uses. Until
 *          a town is picked NOTHING is priced (see needsDriveHome), so this
 *          control shows itself as the unanswered question it is.
 *
 * Renders nothing in plane mode until the multi-origin fares are present
 * (data.meta.origins), so the app degrades gracefully on an older dataset.
 */
export function OriginPicker({
  data, origin, onChangeOrigin,
  mode = 'plane', driveHome = null, onChangeDriveHome, askOpen = 0, onOpenChange,
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [driveQuery, setDriveQuery] = useState('');
  const [driveResults, setDriveResults] = useState(null);
  const [driveBusy, setDriveBusy] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const isCar = mode === 'car';
  const origins = data?.meta?.origins;
  const hasOrigins = origins && Object.keys(origins).length > 0;

  const groups = useMemo(
    () => (hasOrigins && !isCar ? originGroups(data, query) : []),
    [data, query, hasOrigins, isCar],
  );

  // Close on outside click / Escape; focus the search when it opens.
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      clearTimeout(t);
    };
  }, [open]);

  // Switching to car with no town named blocks every price in the app, so the
  // question opens itself rather than waiting to be found. The counter (not the
  // condition) is the trigger, so closing it keeps it closed.
  useEffect(() => {
    if (askOpen > 0) setOpen(true);
  }, [askOpen]);

  // Let the page know: the map's drive prompt asks the same question, and two
  // copies of it on screen at once read as a stutter.
  useEffect(() => { onOpenChange?.(open); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isCar && !hasOrigins) return null;

  const pick = (code) => { onChangeOrigin(code); setOpen(false); setQuery(''); };

  const runDriveSearch = async () => {
    const q = driveQuery.trim();
    if (q.length < 3 || driveBusy) return;
    setDriveBusy(true);
    setDriveResults(await geocodeAddress(q));
    setDriveBusy(false);
  };

  const pickDriveHome = (r) => {
    onChangeDriveHome?.({ name: r.shortLabel || r.label, lat: r.lat, lon: r.lon });
    setDriveResults(null);
    setDriveQuery('');
    setOpen(false);
  };

  const label = isCar
    ? (driveHome?.name || t('origin.pickTown'))
    : (origin ? originLabel(data, origin) : t('origin.pickAirport'));

  return (
    <div className={`origin-picker ${isCar ? 'is-drive' : ''}`} ref={rootRef}>
      <button
        className={`origin-btn ${isCar && !driveHome ? 'needs-answer' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={isCar ? t('origin.driveBtnTitle') : t('origin.btnTitle')}
      >
        {/* Car mode only: the icon is what makes the changed question read at a
            glance. Plane mode keeps the plain pill it has always been, since
            the wizard and trip planner reuse it inside their own labelled rows. */}
        {isCar && <span className="origin-btn-icon" aria-hidden="true"><CarIcon size={16} /></span>}
        <span className="origin-btn-label">
          <span className="origin-btn-from">{isCar ? t('origin.drivingFrom') : t('origin.from')}</span>
          <b>{label}</b>
        </span>
        <span className="origin-btn-caret" aria-hidden="true">▾</span>
      </button>

      {open && isCar && (
        <div className="origin-pop origin-pop-drive">
          <p className="origin-drive-ask">{t('wizard.carFromLabel')}</p>
          <p className="origin-drive-note">{t('origin.driveWhy')}</p>
          <div className="origin-drive-row">
            <input
              ref={inputRef}
              className="origin-search"
              type="search"
              value={driveQuery}
              onChange={(e) => { setDriveQuery(e.target.value); setDriveResults(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') runDriveSearch(); }}
              placeholder={t('wizard.carFromPlaceholder')}
              aria-label={t('wizard.carFromLabel')}
            />
            <button
              className="origin-drive-search"
              onClick={runDriveSearch}
              disabled={driveBusy || driveQuery.trim().length < 3}
            >
              {driveBusy ? t('wizard.searching') : t('wizard.search')}
            </button>
          </div>

          {driveResults && (
            driveResults.length ? (
              <div className="origin-list origin-drive-list">
                {driveResults.map((r, i) => (
                  <button
                    key={`${r.lat},${r.lon},${i}`}
                    className="origin-opt origin-drive-opt"
                    onClick={() => pickDriveHome(r)}
                  >
                    <MapPinIcon size={12} />
                    <span className="origin-drive-opt-label">{r.label}</span>
                  </button>
                ))}
              </div>
            ) : <p className="origin-empty">{t('origin.driveNoMatch', { query: driveQuery.trim() })}</p>
          )}

          {driveHome && (
            <p className="origin-drive-picked">
              {t('wizard.carFromPicked')}
              <button className="origin-drive-clear" onClick={() => onChangeDriveHome?.(null)}>
                {t('wizard.change')}
              </button>
            </p>
          )}
        </div>
      )}

      {open && !isCar && (
        <div className="origin-pop" role="listbox">
          <input
            ref={inputRef}
            className="origin-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('origin.searchPlaceholder')}
            aria-label={t('origin.searchAria')}
          />
          <div className="origin-list">
            {groups.length === 0 && (
              <p className="origin-empty">{t('origin.noMatch', { query })}</p>
            )}
            {groups.map((g) => (
              <div className="origin-group" key={g.country}>
                <div className="origin-group-head">{g.country}</div>
                {g.items.map((o) => (
                  <button
                    key={o.code}
                    className={`origin-opt ${o.code === origin ? 'on' : ''}`}
                    onClick={() => pick(o.code)}
                    role="option"
                    aria-selected={o.code === origin}
                  >
                    <span className="origin-opt-city">{o.city}</span>
                    <span className="origin-opt-code">{o.code}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
