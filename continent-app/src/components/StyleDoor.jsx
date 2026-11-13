import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from './SettingsLine.jsx';
import { SparkIcon } from './Icons.jsx';
import { Button } from './ui/index.js';
import { styleIcon, styleName } from '../browse/TravelStylesSheet.jsx';

/**
 * The travel style door (owner, 2026-11-12: "a little button which stays all
 * the time ... top level"): in the app header on every tab, the active
 * style's colour, glyph and name; a tap opens Travel styles. With no style
 * yet it invites the first one.
 */
export function StyleDoor() {
  const { t } = useI18n();
  const app = useSettings();
  const ts = app?.travelStyles;
  if (!ts) return null;
  const s = ts.active;
  const Ico = s ? styleIcon(s) : SparkIcon;
  const name = s ? styleName(t, s) : t('styles.choose');
  return (
    <Button
      variant="quiet"
      className={`style-door${s ? ` tone-${s.tone}` : ' is-empty'}`}
      aria-label={s ? t('styles.doorAria', { name }) : t('styles.choose')}
      aria-haspopup="dialog"
      onClick={() => ts.setOpen(true)}
    >
      <span className="tstyle-disc" aria-hidden="true"><Ico size={18} /></span>
      <span className="style-door-text" aria-hidden="true">
        <span className="style-door-kicker">{t('styles.kicker')}</span>
        <span className="style-door-name">{name}</span>
      </span>
    </Button>
  );
}
