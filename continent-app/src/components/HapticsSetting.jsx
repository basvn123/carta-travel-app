/*
 * "Vibrate on tap" (G1, G5; house style 2026-11): the traveller's switch for
 * the haptic tick on a touch commit (src/lib/haptics.js). Shown only where
 * this device has a route to a haptic (an Android phone, an iPhone whose
 * Safari still plays the switch tick, a store build), so desktop and phones
 * without one get no setting that does nothing. Stored per device.
 */
import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Switch } from './ui/Switch.jsx';
import { hapticsAvailable, hapticsOn, onHapticsSetting, setHapticsSetting } from '../lib/haptics.js';

export function HapticsSetting({ className = '' }) {
  const { t } = useI18n();
  const [on, setOn] = useState(() => hapticsOn());
  const [available] = useState(() => hapticsAvailable());
  useEffect(() => onHapticsSetting(() => setOn(hapticsOn())), []);
  if (!available) return null;
  // Laid out as one of Settings' own rows (the account panel's .ac-row): an
  // icon column, the label inset, the switch inside the row's padding.
  return (
    <div className={`ac-row is-static hs-setting-row ${className}`.trim()}>
      <VibrateIcon />
      <Switch
        className="hs-setting-switch"
        label={t('settings.haptics')}
        checked={on}
        onChange={(next) => setHapticsSetting(next ? 'on' : 'off')}
      />
    </div>
  );
}

// A phone with two short waves, on the house icon grid (24, 1.75, square caps).
function VibrateIcon() {
  return (
    <svg className="ac-row-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">
      <path d="M8 3.5h8v17H8z" />
      <path d="M11 17.5h2" />
      <path d="M4.5 9v6M19.5 9v6" />
    </svg>
  );
}
