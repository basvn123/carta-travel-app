import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from './SettingsLine.jsx';
import { HouseIcon } from './HouseIcons.jsx';
import { Button } from './ui/index.js';
import { styleIcon, styleName } from '../browse/styles/styleBits.jsx';

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
  // No sparkle (house style): an empty door shows the pack.
  const Ico = s ? styleIcon(s) : HouseIcon.pack;
  const name = s ? styleName(t, s) : t('styles.choose');
  // Changed for now (a trip's party, a link): said in words, not colour alone.
  const changed = Boolean(s && ts.changed);
  return (
    <Button
      variant="quiet"
      className={`style-door${s ? ` tone-${s.tone}` : ' is-empty'}${changed ? ' is-changed' : ''}`}
      // The name is the visible words (WCAG 2.5.3, label in name): the kicker
      // and the style; on a phone they are visually hidden, not removed.
      aria-haspopup="dialog"
      onClick={() => ts.setOpen(true)}
    >
      <span className="tstyle-disc" aria-hidden="true"><Ico size={18} /></span>
      <span className="style-door-text">
        <span className="style-door-kicker">{t(changed ? 'styles.kickerChanged' : 'styles.kicker')}</span>
        <span className="style-door-name">{name}</span>
      </span>
    </Button>
  );
}
