import React from 'react';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip, tierClass } from '../components/RatingBadge.jsx';
import { KindGlyph } from '../components/KindGlyph.jsx';
import { kindOf } from '../lib/taxonomy.js';
import { fmtMonthRanges } from './ClimateStrip.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * A country as a destination of its own (PLAN.md C9), not a filtered grid.
 *
 * The A6 badges pay off here: Finland gets a page with a top three instead
 * of an unlabelled wall. Structure: the badged destinations first (that IS
 * the country's shortlist), then the kinds broken out - its best cities,
 * villages and landscapes - then the practical paragraph: how many places
 * Carta holds there, the typical day in euros (median over the country's
 * rows), when to go (the months most of its places rate best), and whether
 * a car is generally needed (the share of places that need one).
 *
 * Every section renders only when it has content - a thin country shows a
 * shorter page, never an empty shell.
 */

function median(xs) {
  const s = xs.filter((x) => x != null).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

function MiniCard({ p, onSelect, t }) {
  const kind = kindOf(p);
  return (
    <button className="railcard" onClick={() => onSelect(p.id)}
      aria-label={t('explore.openDest', { city: p.city })}>
      <span className="railcard-media">
        <HeroImage url={p.image} city={p.city} iso2={p.iso2}
          className="railcard-img" maxWidth={330} sizes="180px" ratio={[4, 3]} />
        {(p.rating?.tier ?? 0) >= 2 && (
          <span className={`railcard-seal ${tierClass(p.rating)}`} />
        )}
      </span>
      <span className="railcard-body">
        <span className="railcard-kind">
          <KindGlyph kind={kind} size={9} label={t(`pkind.${kind}`)} />
          <span>{t(`pkind.${kind}`)}</span>
        </span>
        <span className="railcard-name">{p.city}</span>
        <ScoreChip rating={p.rating} size="xs" />
      </span>
    </button>
  );
}

function Strip({ title, rows, onSelect, t }) {
  if (!rows.length) return null;
  return (
    <section className="cpage-section">
      <h3 className="cpage-h">{title}</h3>
      <div className="xrails-strip">
        {rows.map((p) => <MiniCard key={p.id} p={p} onSelect={onSelect} t={t} />)}
      </div>
    </section>
  );
}

export function CountryPage({ iso2, rows, onClose, onSelect }) {
  const { t } = useI18n();
  const mine = React.useMemo(
    () => rows.filter((p) => p.iso2 === iso2)
      .sort((a, b) => (b.rating?.score ?? 0) - (a.rating?.score ?? 0)),
    [rows, iso2],
  );
  const country = mine[0]?.country || iso2;

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const badged = mine.filter((p) => p.country_badge)
    .sort((a, b) => (a.country_rank ?? 99) - (b.country_rank ?? 99));
  const byKind = (kinds) => mine.filter((p) => kinds.includes(kindOf(p))).slice(0, 8);
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
    <div className="cpage" role="dialog" aria-label={country}>
      <div className="cpage-top">
        <button className="cpage-back" onClick={onClose} aria-label={t('cpage.back')}>
          ←
        </button>
        <CountryFlag country={iso2} size={20} />
        <h2 className="cpage-name">{country}</h2>
      </div>

      <p className="cpage-facts">
        {t('cpage.holds', { n: mine.length, country })}
        {day != null && <> · {t('cpage.day', { eur: Math.round(day) })}</>}
        {goodMonths.length > 0 && <> · {t('cpage.when', { months: fmtMonthRanges(goodMonths) })}</>}
        {' · '}{t(carKey)}
      </p>

      <div className="cpage-body">
        <Strip title={t('cpage.best', { country })} rows={badged} onSelect={onSelect} t={t} />
        <Strip title={t('cpage.cities')} rows={cities} onSelect={onSelect} t={t} />
        <Strip title={t('cpage.towns')} rows={towns} onSelect={onSelect} t={t} />
        <Strip title={t('cpage.areas')} rows={areas} onSelect={onSelect} t={t} />
      </div>
    </div>
  );
}
