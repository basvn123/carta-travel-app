import React, { useMemo, useState } from 'react';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { Chip, Field, Segmented } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { formatMoney } from '../../lib/money.js';
import { cityLabel } from '../../lib/placeName.js';
import { LIKES } from '../flow/tripSettings.js';
import { MAX_LIKES } from '../../lib/taste.js';
import { swapCandidates, swapPicks } from './swapCity.js';

const SIZES = ['town', 'village', 'city', 'mix'];
const REACHES = ['near', 'mid', 'far'];

/**
 * Swap city (T841, owner board panel 7): another place takes a stop's
 * place and keeps its dates and nights. Two doors on one sheet:
 *   "I know where"   search any place by name; empty, the nearest ones
 *   "Help me choose" what you want there (up to three), how big a place
 *                    and how far from the stop; Carta's picks update as the
 *                    answers change, ranked like Explore's For you
 * Each place says how far it is and what it does to the trip's total. A
 * pick swaps at once; the page's Undo brings the old stop back.
 *
 *   stop        the stop's details (dest, nights, arriveDate)
 *   delta(id)   the total's change with `id` in the stop's place, or null
 */
export function SwapCity({ stop, destinations, exclude, delta, onPick, onClose }) {
  const { t, lang } = useI18n();
  const [door, setDoor] = useState('know');
  const [query, setQuery] = useState('');
  const [likes, setLikes] = useState([]);
  const [size, setSize] = useState('mix');
  const [reach, setReach] = useState('mid');
  const city = cityLabel(stop?.dest?.city || '') || t('itin.unknown');
  const month = stop?.arriveDate ? Number(stop.arriveDate.slice(5, 7)) : null;
  const list = useMemo(() => (door === 'know'
    ? swapCandidates({ destinations, from: stop?.dest, exclude, query, limit: 8 })
    : swapPicks({ destinations, from: stop?.dest, exclude, likes, size: size === 'mix' ? null : size, reach, month, limit: 5 })),
  [door, destinations, stop, exclude, query, likes, size, reach, month]);
  const toggleLike = (k) => setLikes((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : cur.length >= MAX_LIKES ? cur : [...cur, k]));
  // Each place's change to the total, priced once per list (T841).
  const deltas = useMemo(() => new Map(list.map(({ dest }) => [dest.id, delta?.(dest.id)])), [list]); // eslint-disable-line react-hooks/exhaustive-deps -- the trip does not change while the sheet is open
  const deltaText = (id) => {
    const d = deltas.get(id);
    if (!Number.isFinite(d)) return '';
    if (Math.abs(d) < 0.005) return t('tp.bal.same');
    return t(d > 0 ? 'tp.bal.more' : 'tp.bal.less', { price: formatMoney(Math.abs(d), { precision: 'cents', locale: lang }) });
  };

  return (
    <SheetShell title={t('tp.sw.title', { city })} onClose={onClose} width={520} className="tps-sheet" labelId="tps-title">
      <div className="tps">
        <Segmented
          block
          label={t('tp.sw.how')}
          value={door}
          onChange={setDoor}
          options={[{ value: 'know', label: t('tp.sw.know') }, { value: 'help', label: t('tp.sw.help') }]}
        />
        {door === 'know' ? (
          <Field label={t('tp.sw.search')} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        ) : (
          <div className="tps-qs">
            <section className="tps-q" aria-labelledby="tps-q1">
              <h3 className="tps-h" id="tps-q1">{t('tp.sw.qLikes', { city })}</h3>
              <div className="tps-chips">
                {LIKES.map((k) => (
                  <Chip key={k} kind="filter" selected={likes.includes(k)} onClick={() => toggleLike(k)}>{t(`pf.like.${k}`)}</Chip>
                ))}
              </div>
            </section>
            <section className="tps-q" aria-labelledby="tps-q2">
              <h3 className="tps-h" id="tps-q2">{t('tp.sw.qSize')}</h3>
              <Segmented block size="sm" label={t('tp.sw.qSize')} value={size} onChange={setSize}
                options={SIZES.map((v) => ({ value: v, label: t(`tp.sw.size.${v}`) }))} />
            </section>
            <section className="tps-q" aria-labelledby="tps-q3">
              <h3 className="tps-h" id="tps-q3">{t('tp.sw.qReach', { city })}</h3>
              <Segmented block size="sm" label={t('tp.sw.qReach', { city })} value={reach} onChange={setReach}
                options={REACHES.map((v) => ({ value: v, label: t(`tp.sw.reach.${v}`) }))} />
            </section>
          </div>
        )}

        {list.length === 0 ? (
          <p className="tps-note">{door === 'know' ? t('tp.sw.noMatch') : t('tp.sw.noPicks')}</p>
        ) : (
          <ul className="tps-list" aria-label={door === 'know' ? t('tp.sw.know') : t('tp.sw.picks')}>
            {list.map(({ dest, km }) => (
              <li key={dest.id}>
                <button type="button" className="tps-row" onClick={() => onPick(dest.id)}>
                  <span className="tps-thumb">
                    <HeroImage url={dest.image?.url} city={cityLabel(dest.city)} iso2={dest.iso2} className="tps-img" ratio={[1, 1]} maxWidth={120} />
                  </span>
                  <span className="tps-main">
                    <span className="tps-name">{cityLabel(dest.city)}</span>
                    <span className="tps-sub">
                      {[dest.country, Number.isFinite(km) ? t('tp.sw.away', { km: Math.round(km), city }) : ''].filter(Boolean).join(', ')}
                    </span>
                  </span>
                  <span className="tps-delta">{deltaText(dest.id)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SheetShell>
  );
}
