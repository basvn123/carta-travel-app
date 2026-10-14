import React from 'react';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { ArrowLeftIcon, ChevronRightIcon } from '../components/Icons.jsx';
import { kindOf } from '../lib/taxonomy.js';
import { fmtMonthRanges } from './ClimateStrip.jsx';
import { useI18n } from '../i18n/index.jsx';
import { Button, IconButton, Money } from '../components/ui/index.js';
import { PlaceTile } from './ExploreCards.jsx';
import { Strip } from './SectionOpening.jsx';
import { GalleryStrip } from './CountryGallery.jsx';
import { countryPhotos, countryKnownKey } from '../lib/countryGallery.js';
import CreditFold from './CreditFold.jsx';

/**
 * A country as a destination of its own (PLAN.md C9; rebuilt in T450 on the
 * kit, after the Destinations tab).
 *
 * Top to bottom: the photographs people know the country for (T449's
 * gallery, swipeable), its name and the one line of what it is known for,
 * three key facts set label over value (the typical day at the traveller's
 * Lifestyle, the best months, how you get around), the two doors (every
 * place on the map, and its walks, beaches and rides on Destinations), then
 * the rails Explore draws: its best, its cities, its towns and villages, its
 * landscapes. The credits wait in one closed row at the end.
 *
 * What went (owner, 2026-10-14): "Carta holds N destinations in {country}",
 * the facts run together as one line, and the raw mini cards.
 *
 * Every section renders only when it has content: a thin country shows a
 * shorter page, never an empty shell.
 */

function median(xs) {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

function Rail({ id, title, rows, onSelect, favorites, onToggleFav, t }) {
  if (!rows.length) return null;
  return (
    <Strip id={id} title={title} t={t} className="cpg-rail">
      {rows.map((p) => (
        <li key={p.id} className="dtab-item">
          <PlaceTile p={p} onSelect={onSelect} t={t}
            fav={favorites ? favorites.has(p.id) : false}
            onToggleFav={onToggleFav} />
        </li>
      ))}
    </Strip>
  );
}

export function CountryPage({
  iso2, rows, onClose, onSelect, favorites = null, onToggleFav = null,
  onShowAll = null, onOpenOutdoors = null,
}) {
  const { t } = useI18n();
  const mine = React.useMemo(
    () => rows.filter((p) => p.iso2 === iso2)
      .sort((a, b) => (b.rating?.score ?? 0) - (a.rating?.score ?? 0)),
    [rows, iso2],
  );
  const country = mine[0]?.country || iso2;
  const knownKey = countryKnownKey(iso2);
  const photos = countryPhotos(iso2);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const badged = mine.filter((p) => p.country_badge)
    .sort((a, b) => (a.country_rank ?? 99) - (b.country_rank ?? 99));
  const byKind = (kinds) => mine.filter((p) => kinds.includes(kindOf(p))).slice(0, 12);
  const cities = byKind(['metro', 'city']);
  const towns = byKind(['town', 'village']);
  const areas = byKind(['area']);

  const day = median(mine.map((p) => p.cost?.dayEur));
  const monthVotes = new Array(13).fill(0);
  for (const p of mine) for (const m of p.climate?.best || []) monthVotes[m]++;
  const peak = Math.max(...monthVotes);
  const goodMonths = peak
    ? monthVotes.map((v, m) => (m > 0 && v >= peak * 0.6 ? m : null)).filter(Boolean)
    : [];
  const carShare = mine.length
    ? mine.filter((p) => p.local_transport?.car_needed).length / mine.length
    : 0;
  const carKey = carShare > 0.6 ? 'cpage.carMost'
    : carShare > 0.3 ? 'cpage.carSome' : 'cpage.carFew';

  return (
    <div className="cpage cpg" role="dialog" aria-label={country}>
      <div className="cpg-bar">
        <IconButton className="cpage-back" label={t('cpage.back')} onClick={onClose}>
          <ArrowLeftIcon size={20} />
        </IconButton>
      </div>

      <div className="cpg-wrap">
        {photos.length > 0 && (
          <div className="cpg-hero">
            <GalleryStrip cc={iso2} name={country} t={t} eager
              sizes="(max-width: 768px) 100vw, min(70vw, 1100px)" />
          </div>
        )}

        <header className="cpg-head">
          <h2 className="cpage-name cpg-name">
            <CountryFlag country={iso2} size={22} />
            <span>{country}</span>
          </h2>
          {knownKey && <p className="cpg-line">{t(knownKey)}</p>}
        </header>

        <dl className="cpg-keys">
          {day != null && (
            <div className="cpg-key">
              <dt>{t('cpage.kDay')}</dt>
              <dd><Money value={day} est /> <span className="cpg-unit">{t('cost.perDay')}</span></dd>
            </div>
          )}
          {goodMonths.length > 0 && (
            <div className="cpg-key">
              <dt>{t('cpage.kWhen')}</dt>
              <dd>{fmtMonthRanges(goodMonths)}</dd>
            </div>
          )}
          {mine.length > 0 && (
            <div className="cpg-key">
              <dt>{t('cpage.kCar')}</dt>
              <dd>{t(carKey)}</dd>
            </div>
          )}
        </dl>

        {(onShowAll || onOpenOutdoors) && (
          <div className="cpg-doors">
            {onShowAll && (
              <Button variant="secondary" iconEnd={<ChevronRightIcon size={14} />}
                onClick={() => onShowAll(iso2)}>
                {t('cpage.showAll', { country })}
              </Button>
            )}
            {onOpenOutdoors && (
              <Button variant="secondary" iconEnd={<ChevronRightIcon size={14} />}
                onClick={() => onOpenOutdoors(iso2)}>
                {t('cpage.outdoors')}
              </Button>
            )}
          </div>
        )}

        <div className="cpage-body cpg-rails">
          <Rail id={`cpg-best-${iso2}`} title={t('cpage.best', { country })} rows={badged}
            onSelect={onSelect} favorites={favorites} onToggleFav={onToggleFav} t={t} />
          <Rail id={`cpg-cities-${iso2}`} title={t('cpage.cities')} rows={cities}
            onSelect={onSelect} favorites={favorites} onToggleFav={onToggleFav} t={t} />
          <Rail id={`cpg-towns-${iso2}`} title={t('cpage.towns')} rows={towns}
            onSelect={onSelect} favorites={favorites} onToggleFav={onToggleFav} t={t} />
          <Rail id={`cpg-areas-${iso2}`} title={t('cpage.areas')} rows={areas}
            onSelect={onSelect} favorites={favorites} onToggleFav={onToggleFav} t={t} />
        </div>

        {photos.length > 0 && (
          <div className="dtab-sources">
            <CreditFold t={t}>
              <p className="dtab-sources-head">{t('dtab.photoCredits')}</p>
              <ul className="dtab-sources-list">
                {photos.map((p) => (
                  <li key={p.u}>
                    {p.place}: <a href={p.page} target="_blank" rel="noreferrer">{p.author}</a>, {p.licence}
                  </li>
                ))}
              </ul>
            </CreditFold>
          </div>
        )}
      </div>
    </div>
  );
}
