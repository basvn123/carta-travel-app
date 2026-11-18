/*
 * Settings (G12, Explore top): the sheet and the way every door opens it.
 *
 *   import { SettingsSheet, useSettingsSheet, openSettings } from './browse/settings/index.js';
 *   <SettingsSheet />                         mount once, inside the settings context
 *   openSettings({ step: 'when' })            from any door (a chip, a "Change")
 *   const { isOpen, step, open, close, toggle } = useSettingsSheet();
 */
export { SettingsSheet, DOCK_QUERY } from './SettingsSheet.jsx';
export {
  useSettingsSheet, openSettings, closeSettings, toggleSettings, settingsSheetState, SETTINGS_STEPS,
} from './settingsSheetStore.js';
