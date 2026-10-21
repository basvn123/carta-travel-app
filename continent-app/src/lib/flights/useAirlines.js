/**
 * Airline names and logos from the sweep's index (T518), shared by every
 * flight row and chip: code -> { name, logo }, {} until it loads.
 */
import { useEffect, useState } from 'react';
import { loadAirlines } from './flightData.js';

export function useAirlines() {
  const [airlines, setAirlines] = useState(null);
  useEffect(() => {
    let alive = true;
    loadAirlines().then((a) => { if (alive) setAirlines(a); });
    return () => { alive = false; };
  }, []);
  return airlines || {};
}

export function airlineName(airlines, code) {
  return airlines?.[code]?.name || code || '';
}
