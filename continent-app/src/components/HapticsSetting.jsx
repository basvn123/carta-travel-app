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
  return (
    <Switch
      className={`haptics-setting ${className}`.trim()}
      label={t('settings.haptics')}
      checked={on}
      onChange={(next) => setHapticsSetting(next ? 'on' : 'off')}
    />
  );
}
