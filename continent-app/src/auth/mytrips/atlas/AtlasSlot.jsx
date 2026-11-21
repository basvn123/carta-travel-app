import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/index.jsx';
import { activeLocale } from '../../../lib/localeState.js';
import { PencilIcon } from '../../../components/Icons.jsx';
import { Pressable } from '../../../components/ui/Pressable.jsx';
import { AtlasPlate, CountryPick } from './AtlasPlate.jsx';
import { landShare, plateColours, stateOf } from './plateData.js';

/**
 * The one map of a My trips panel (G12, Phase B), placed per device like the
 * approved reference: on a phone a full-bleed band that fades into the
 * ground, on a tablet a block on top, from 1100 px a sticky pane right of
 * the 540 px content column (72-atlas.css). Its height is set per tab and
 * state in CSS before the plate loads, so a tab switch does not shift the
 * page. It mounts once; the plate inside changes with the tab, and the
 * routes draw in only when the tab changes, never at first paint.
 *
 * Saved (Phase D): the whole plate when nothing is saved, else a host the
 * Saved tab portals its live map into (savedHost), so MapLibre loads only there.
 *
 *   trips    tripsLayer() output
 *   europe   europeLayer() output plus { been, next, viaTrip, total }
 *   year, onYear          the year filter (Your Europe)
 *   onToggleCountry(iso)  a hand mark (T972, useVisitedCountries)
 *   onList, listRef       "Countries as a list" (VisitedCountriesSheet)
 */
export function AtlasSlot({ tab, geo, trips, europe, savedEmpty = false, savedHost = null, year = null, onYear, onToggleCountry, onList, listRef, children }) {
  const { t } = useI18n();
  const [picked, setPicked] = useState('');
  const first = useRef(tab);
  const [drawKey, setDrawKey] = useState(0);
  useEffect(() => {
    if (first.current === tab) return;
    first.current = tab;
    setDrawKey((n) => n + 1);
    setPicked('');
  }, [tab]);
  const share = useMemo(() => (europe ? landShare(geo, europe.been) : 0), [geo, europe]);
  if (tab === 'saved') {
    if (savedEmpty) {
      const L = { whole: true, state: 'empty', summary: { key: 'mt.mapTripsEmpty' } };
      return (
        <div className="atlas-slot is-saved is-empty">
          <div className="atlas-map" style={plateColours()}>
            <AtlasPlate geo={geo} layer={L} label={t('mt.mapSavedEmpty')} drawKey={drawKey} cornerT={{ n: 'N', s: t('mt.compassS'), e: t('mt.compassE'), w: t('mt.compassW') }} />
          </div>
        </div>
      );
    }
    return <div className="atlas-slot is-saved"><div className="atlas-map atlas-live" ref={savedHost} /></div>;
  }
  if (tab !== 'trips' && tab !== 'europe') return null;

  const nf = (n, d = 0) => Number(n).toLocaleString(activeLocale(), { maximumFractionDigits: d });
  const cornerT = { n: 'N', s: t('mt.compassS'), e: t('mt.compassE'), w: t('mt.compassW') };
  let plate;
  let under = null;
  let empty;
  if (tab === 'trips') {
    const L = trips || { whole: true, state: 'empty', summary: { key: 'mt.mapTripsEmpty' } };
    empty = L.state === 'empty';
    const { key, ...vars } = L.summary || { key: 'mt.mapTripsEmpty' };
    plate = <AtlasPlate geo={geo} layer={L} next={trips?.nextIso} label={t(key, vars)} drawKey={drawKey} cornerT={cornerT} />;
  } else {
    const E = europe;
    const n = E.been.size;
    empty = E.state === 'empty';
    // An empty record is marked straight from the map; with a record a tap
    // names the country first, with the mark in its pill (T972).
    const onPick = empty
      ? (cc) => { if (cc) onToggleCountry?.(cc); }
      : setPicked;
    const pickedState = picked ? stateOf(picked, E.been, E.next, new Set()) : '';
    plate = (
      <AtlasPlate
        geo={geo}
        layer={E}
        been={E.been}
        next={E.next}
        year={year}
        label={t('mt.mapEurope', { n, total: E.total })}
        drawKey={drawKey}
        picked={picked}
        onPick={onPick}
        cornerT={cornerT}
      >
        {n > 0 ? (
          <span className="atlas-floatchip">
            <b>{t('mt.nOf', { n, total: E.total })}</b>
            {share > 0 && <span>{t('mt.europeShare', { n: nf(share, share < 10 ? 1 : 0) })}</span>}
          </span>
        ) : (
          <span className="atlas-floatchip is-hint"><PencilIcon size={16} />{t('mt.tapCountries')}</span>
        )}
      </AtlasPlate>
    );
    const rampOf = E.ramp || {};
    under = (
      <>
        <CountryPick
          picked={empty ? '' : picked}
          state={pickedState}
          canToggle={!!onToggleCountry && !E.viaTrip?.has(picked)}
          onToggle={onToggleCountry}
        />
        <div className="atlas-under">
          <div className="atlas-legend" role="group" aria-label={t('mt.yearFilter')}>
            {E.years.map((y) => (
              <Pressable
                key={y}
                haptic="tick"
                className="atlas-yr"
                aria-pressed={year === y}
                onClick={() => onYear?.(year === y ? null : y)}
              >
                <i className={`is-r${rampOf[y] ?? 0}`} aria-hidden="true" />{y}
              </Pressable>
            ))}
            {E.hand.size > 0 && <span className="atlas-yr is-key"><i className="is-hand" aria-hidden="true" />{t('mt.legendHand')}</span>}
            {E.next.size > 0 && <span className="atlas-yr is-key"><i className="is-next" aria-hidden="true" />{t('mt.legendNextShort')}</span>}
          </div>
          <Pressable ref={listRef} className="atlas-lnk" onClick={onList}>{t('mt.countriesList')}</Pressable>
        </div>
      </>
    );
  }
  return (
    <div className={`atlas-slot is-${tab}${empty ? ' is-empty' : ''}`}>
      <div className="atlas-map" style={plateColours()}>{plate}</div>
      {under}
      {children}
    </div>
  );
}
