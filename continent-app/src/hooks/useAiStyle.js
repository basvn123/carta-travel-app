import { useMemo } from 'react';
import { useSettings } from '../components/SettingsLine.jsx';
import { styleForAi } from '../lib/styleForAi.js';

/**
 * The active travel style as Ask Viantra and plan-day receive it (G12), or
 * null with no style (the request then carries no `style` at all). One
 * object per style change, so it can sit in an effect's dependencies.
 */
export function useAiStyle() {
  const active = useSettings()?.travelStyles?.active || null;
  return useMemo(() => (active ? styleForAi(active) : null), [active]);
}
