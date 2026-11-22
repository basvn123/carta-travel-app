import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Chip } from '../components/ui/index.js';
import { BedIcon, PlaneIcon, SunIcon, BellIcon } from '../components/Icons.jsx';
import { watch, unwatch, recordPrice, isWatched, watchId, subscribeWatch } from '../lib/watchStore.js';

const ICON = { day: SunIcon, stay: BedIcon, flight: PlaneIcon };

/**
 * Volgen on the place page (G12, decision 6): a chip for the day figure,
 * the stay and the flight, where the card has them. Following saves the
 * place too, so it shows on Saved's Gevolgd rail.
 *
 * Here is also where Carta re-prices them: each render with a figure for a
 * followed thing offers it to the store, which appends only a changed price
 * or a new day's (lib/watchStore appendPoint).
 *
 *   items     [{ kind, ref, label, eur, unitNote, source }], eur a whole euro figure
 *   placeKey  'dest:LIS'
 *   saved, onSave  the page's save mark
 */
export function WatchChips({ items, placeKey, saved = false, onSave = null }) {
  const { t } = useI18n();
  const [, bump] = useState(0);
  useEffect(() => subscribeWatch(() => bump((n) => n + 1)), []);
  const priced = items.filter((it) => it.ref && Number.isFinite(it.eur) && it.eur > 0);
  const key = priced.map((it) => `${it.kind}:${it.ref}:${Math.round(it.eur)}`).join('|');
  useEffect(() => {
    const at = new Date().toISOString();
    priced.forEach((it) => recordPrice(watchId(it.kind, it.ref), { at, eur: Math.round(it.eur) }));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by the figures
  if (!priced.length) return null;
  return (
    <div className="watch-chips" role="group" aria-label={t('watch.followGroup')}>
      {priced.map((it) => {
        const id = watchId(it.kind, it.ref);
        const on = isWatched(id);
        const Icon = on ? BellIcon : ICON[it.kind];
        return (
          <Chip key={id} kind="filter" selected={on} icon={<Icon size={14} />}
            aria-label={t(on ? 'watch.unfollowAria' : 'watch.followAria', { what: t(`watch.kind.${it.kind}`), name: it.label })}
            onClick={() => {
              if (on) { unwatch(id); return; }
              watch({ ...it, eur: Math.round(it.eur), placeKey });
              if (!saved) onSave?.();
            }}>
            {t(on ? 'watch.following' : 'watch.follow')} {t(`watch.kind.${it.kind}`).toLocaleLowerCase()}
          </Chip>
        );
      })}
    </div>
  );
}
