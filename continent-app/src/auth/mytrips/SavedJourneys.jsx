import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { ChevronRightIcon } from '../../components/Icons.jsx';
import { loadAllJourneyCards } from '../../lib/journeys.js';
import { cardPerDay } from '../../lib/tripFilters.js';
import { WEEK } from '../../lib/tripLength.js';
import { countryName as localCountryName } from '../../lib/countryName.js';
import { toggleSavedJourney, useSavedJourneys } from '../../lib/journeySaves.js';
import { DayFrom } from '../../browse/JourneyCards.jsx';

/**
 * Carta's own trips the traveller saved (T831, row T824-a): the bookmark on
 * Carta's trips page lands here too, under Kept trips, in the same rows
 * (photo, the week's name, where, from a person a day). Open shows the
 * whole week; Remove takes the bookmark off. Newest saved first; a saved id
 * the library no longer has is left out quietly.
 *
 *   onOpen(id)   the week's page (SavedTripsPanel hands it to openFeature)
 */
export function SavedJourneys({ onOpen }) {
  const { t, lang } = useI18n();
  const saved = useSavedJourneys();
  const [cards, setCards] = useState(null);
  useEffect(() => {
    if (!saved.length || cards) return undefined;
    let live = true;
    loadAllJourneyCards().then((all) => { if (live) setCards(all || []); }).catch(() => { if (live) setCards([]); });
    return () => { live = false; };
  }, [saved.length, cards]);
  const rows = useMemo(() => {
    if (!cards) return [];
    const byId = new Map(cards.map((c) => [c.id, c]));
    return saved.map((id) => byId.get(id)).filter(Boolean);
  }, [cards, saved]);
  if (!saved.length || !rows.length) return null;

  return (
    <section className="mt-kept mt-journeys" aria-labelledby="mt-journeys-title">
      <div className="mt-kept-head">
        <h3 className="mt-kept-title" id="mt-journeys-title">{t('tp.saved.title')}</h3>
      </div>
      <div className="mt-rows mt-kept-list">
        {rows.map((c) => {
          const codes = (c.countries || []).length ? c.countries : [c.cc];
          const where = codes.filter(Boolean).map((cc) => localCountryName(cc, cc === c.cc ? c.country : null, lang)).join(', ');
          const perDay = cardPerDay(c, WEEK);
          return (
            <article key={c.id} className="mt-kept-row" aria-label={c.title} data-journey={c.id}>
              <HeroImage url={(c.photos || [])[0] || c.hero?.url} city={c.title} iso2={c.cc} className="mt-kept-img" maxWidth={330} ratio={[1, 1]} sizes="72px" />
              <div className="mt-kept-body">
                <h4 className="mt-kept-name">{c.title}</h4>
                <p className="mt-row-meta">
                  {c.cc && <CountryFlag country={c.cc} size={14} />}
                  <span>{[where, t('tp.card.days', { n: c.days || 7 })].filter(Boolean).join(', ')}</span>
                </p>
                {Number.isFinite(perDay) && <p className="mt-kept-price"><DayFrom value={perDay} t={t} /></p>}
              </div>
              <div className="mt-kept-acts">
                <Button size="sm" variant="primary" iconEnd={<ChevronRightIcon size={16} />} onClick={() => onOpen(c.id)}>
                  {t('tp.saved.open')}
                </Button>
                <Button size="sm" variant="quiet" aria-label={t('tp.saved.removeOne', { name: c.title })} onClick={() => toggleSavedJourney(c.id)}>
                  {t('tf.keep.remove')}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
