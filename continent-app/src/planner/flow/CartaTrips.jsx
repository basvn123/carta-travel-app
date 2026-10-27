import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { loadAllJourneyCards, loadJourneyIndex, typeLabel } from '../../lib/journeys.js';
import { cardPerDay } from '../../lib/tripFilters.js';
import { WEEK } from '../../lib/tripLength.js';
import { JourneyCard } from '../../browse/JourneyCards.jsx';
import Logo from '../../components/Logo.jsx';
import { Button, Chip, ChipGroup, IconButton } from '../../components/ui/index.js';
import { ArrowLeftIcon, BedIcon, ListDayIcon, ReceiptIcon, RouteIcon } from '../../components/Icons.jsx';

// What every one of Carta's trips already holds, said once at the top.
const INCLUDED = [
  ['days', ListDayIcon],
  ['stays', BedIcon],
  ['getting', RouteIcon],
  ['costs', ReceiptIcon],
];

// Cards per page of the grid; More adds the next page.
const PAGE = 24;
// The in-season band at the top of All.
const FEATURED = 6;

const RAIL_SIZES = '(max-width: 768px) 84vw, (max-width: 1279px) 44vw, 400px';

/** In season this month first, then the cheapest a person a day. */
function ranked(cards, month) {
  const inSeason = (c) => ((c.months || []).includes(month) ? 0 : 1);
  const perDay = (c) => cardPerDay(c, WEEK) ?? Infinity;
  return cards.slice().sort((a, b) => inSeason(a) - inSeason(b) || perDay(a) - perDay(b));
}

/**
 * Carta's own trips (T752): every written week of the journeys library on one
 * page of its own, the door both the Plan opening and "Use one of Carta's own
 * trips" open. Carta's mark and the title, what every trip already holds
 * (the days, the stays, getting there, the costs), the styles as one row of
 * chips, the weeks in season this month as a band, and every week as the
 * library's own trip cards. A card opens the whole week.
 *
 *   onBack()             back where the page was opened from
 *   onOpenJourney(id)    one week, its whole plan
 */
export function CartaTrips({ titleTag = 'h1', onBack, onOpenJourney }) {
  const { t, lang } = useI18n();
  const Title = titleTag;
  const month = new Date().getMonth() + 1;
  const [types, setTypes] = useState([]);
  const [cards, setCards] = useState(null);
  const [style, setStyle] = useState('all');
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let live = true;
    loadJourneyIndex().then((ix) => { if (live) setTypes(ix?.types || []); }).catch(() => {});
    loadAllJourneyCards().then((all) => { if (live) setCards(all); });
    return () => { live = false; };
  }, []);

  const all = useMemo(() => (cards ? ranked(cards, month) : []), [cards, month]);
  const list = useMemo(() => (style === 'all' ? all : all.filter((c) => c.type === style)), [all, style]);
  const featured = useMemo(
    () => (style === 'all' ? all.filter((c) => (c.months || []).includes(month)).slice(0, FEATURED) : []),
    [all, style, month],
  );
  const open = (card) => onOpenJourney(card.id);
  const pick = (s) => { setStyle(s); setShown(PAGE); };

  return (
    <div className="pf-carta">
      <div className="pf-carta-top">
        <IconButton tone="surface" className="pf-round" label={t('pf.back')} onClick={onBack}>
          <ArrowLeftIcon size={18} />
        </IconButton>
      </div>

      <header className="pf-carta-hero">
        <Logo size={44} className="pf-carta-mark" />
        <Title className="pf-title pf-carta-title" tabIndex={-1}>{t('pf.carta.title')}</Title>
        <ul className="pf-carta-incl" aria-label={t('pf.carta.inclLabel')}>
          {INCLUDED.map(([key, Icon]) => (
            <li key={key}>
              <span className="pf-carta-incl-icon" aria-hidden="true"><Icon size={18} /></span>
              {t(`pf.carta.incl.${key}`)}
            </li>
          ))}
        </ul>
      </header>

      {types.length > 0 && (
        <ChipGroup label={t('pf.carta.styles')} className="pf-carta-styles">
          <Chip kind="choice" selected={style === 'all'} onClick={() => pick('all')}>{t('pf.carta.all')}</Chip>
          {types.map((tp) => (
            <Chip key={tp.slug} kind="choice" selected={style === tp.slug} onClick={() => pick(tp.slug)}>
              {typeLabel(tp.slug, t, tp.name)}
            </Chip>
          ))}
        </ChipGroup>
      )}

      {featured.length > 0 && (
        <section className="pf-carta-sec" aria-labelledby="pf-carta-season">
          <h2 className="pf-carta-h" id="pf-carta-season">{t('pf.carta.inSeason')}</h2>
          <div className="pf-carta-rail">
            {featured.map((c) => (
              <JourneyCard key={c.id} card={c} length={WEEK} onOpen={open} t={t} lang={lang} sizes={RAIL_SIZES} />
            ))}
          </div>
        </section>
      )}

      {cards && (
        <section className="pf-carta-sec" aria-labelledby="pf-carta-all">
          <h2 className="pf-carta-h" id="pf-carta-all">
            {style === 'all' ? t('pf.carta.allTrips') : typeLabel(style, t, style)}
          </h2>
          {list.length > 0 ? (
            <div className="pf-carta-grid">
              {list.slice(0, shown).map((c) => (
                <JourneyCard key={c.id} card={c} length={WEEK} onOpen={open} t={t} lang={lang} />
              ))}
            </div>
          ) : (
            <p className="pf-carta-empty">{t('pf.carta.empty')}</p>
          )}
          {list.length > shown && (
            <Button variant="secondary" className="pf-carta-more" onClick={() => setShown(shown + PAGE)}>
              {t('pf.carta.more')}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}
