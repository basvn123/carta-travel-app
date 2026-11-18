import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { HouseIcon } from '../HouseIcons.jsx';
import { useSettings } from '../SettingsLine.jsx';
import { styleIcon, styleName } from '../../browse/styles/styleBits.jsx';
import { openStudio } from '../../browse/styles/studioDoors.js';
import { Dock } from './Dock.jsx';

/**
 * The style disc (Style Studio, G12; decision.md "Doors"): the active travel
 * style in the bottom-left corner, its glyph and a dot while a trip has
 * changed it. A tap opens the Style Studio overview; the disc edits nothing
 * itself, so the studio stays the one place a style changes.
 *
 * Hidden where the corner is taken: on Plan (its bar owns the bottom), on
 * the full pages, under the phone keyboard and while a dialog is open (the
 * last two in 89-dock.css).
 */
export function StyleDock({ hidden = false }) {
  const { t } = useI18n();
  const app = useSettings();
  const ts = app?.travelStyles;
  if (!ts) return null;
  const s = ts.active;
  const Ico = s ? styleIcon(s) : HouseIcon.pack;
  const name = s ? styleName(t, s) : t('styles.choose');
  const changed = Boolean(s && (ts.changed || ts.held));
  return (
    <Dock
      id="style"
      anchor="corner"
      hidden={hidden}
      className={`style-dock${s ? ` tone-${s.tone}` : ' is-empty'}`}
      glyph={<span key={s?.id || 'none'} className="dock-glyph-in"><Ico size={26} /></span>}
      label={s ? t(changed ? 'styles.doorAriaChanged' : 'styles.doorAria', { name }) : name}
      title={name}
      changed={changed}
      onActivate={() => openStudio(ts)}
    />
  );
}
