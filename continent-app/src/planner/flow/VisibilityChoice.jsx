import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Chip, ChipGroup } from '../../components/ui/index.js';
import { FriendsIcon, LinkIcon, LockIcon } from '../../components/Icons.jsx';
import { VISIBILITY } from './tripSettings.js';

const ICONS = { private: LockIcon, friends: FriendsIcon, link: LinkIcon };

/**
 * Who can see the trip (T751): the three answers as kit choice chips, each
 * with its glyph, in place of a native select. Shared by Create trip and
 * the trip settings, so the two never disagree.
 */
export function VisibilityChoice({ value, onChange, className = '' }) {
  const { t } = useI18n();
  return (
    <ChipGroup label={t('pf.create.visibility')} className={`pf-vis ${className}`.trim()}>
      {VISIBILITY.map((v) => {
        const Icon = ICONS[v];
        // The three stand on one line (owner, plan flow walk): the link chip
        // reads "Link" and keeps its whole name for a screen reader.
        const short = v === 'link';
        return (
          <Chip key={v} kind="choice" selected={value === v} icon={Icon ? <Icon size={16} /> : null}
            aria-label={short ? t('pf.vis.link') : undefined} onClick={() => onChange(v)}>
            {t(short ? 'pf.vis.linkShort' : `pf.vis.${v}`)}
          </Chip>
        );
      })}
    </ChipGroup>
  );
}
