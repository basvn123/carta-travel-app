import React from 'react';
import { safeUrl } from '../lib/format.js';
import { monthName } from '../lib/dates.js';
import { Fold } from './Fold.jsx';
import { RatingBreakdown } from './RatingBreakdown.jsx';
import { Neighbourhoods } from './Neighbourhoods.jsx';
import { GettingThere } from './GettingThere.jsx';
import { DestFood } from './DestFood.jsx';
import { FlashDeck } from './FlashDeck.jsx';
import { cardCategory } from '../lib/flashcards.js';
import { Section } from './DestTiles.jsx';
import { cleanName, fmtKm, tipText } from './destParts.js';
import {
  PersonIcon, ParkingIcon, SunIcon, RainIcon, SnowIcon, ShoeIcon, SwimIcon, BootIcon, PlugIcon,
  BottleIcon, JacketIcon, BackpackIcon, CheckIcon, StarIcon, LinkIcon, BulbIcon, AlertIcon, BedIcon,
} from '../components/Icons.jsx';

/**
 * The destination page's Practical tab (T499, roadmap 1.4): what a traveller
 * reads once they have decided. Getting there and around, why it rates,
 * where to sleep, food and drink (T515), insider tips, parking and packing,
 * then the exits to the
 * booking sites. Moved from DestinationPage.jsx (T429, T446), not rewritten;
 * the folds keep their remembered state (carta-design "Remembered state").
 */
const PACK_GLYPH = {
  shoes: ShoeIcon, daypack: BackpackIcon, sun: SunIcon, bottle: BottleIcon,
  swim: SwimIcon, rain: RainIcon, winter: SnowIcon, layers: JacketIcon,
  evening: JacketIcon, modest: JacketIcon, boots: BootIcon, plug: PlugIcon,
};

export function DestPractical({ p }) {
  const {
    t, lang, city, destination, data, getting, rhythm, bookAhead, verdict, verdictBand, fmtScore,
    sleep, tips, packs, month, parking, exits, isOpen, toggle, onOpenLifestyle,
  } = p;
  const hasGetting = !!(getting || rhythm || bookAhead.length > 0);
  const hasSleep = !!(sleep?.neighbourhoods?.length > 0 || sleep?.beds || sleep?.curve);
  const hasPark = !!(parking && (parking.spots?.length > 0 || parking.park_ride || parking.web));
  const sleepNames = (sleep?.neighbourhoods || []).slice(0, 3).map((n) => n.name).filter(Boolean).join(', ');
  const parkSearch = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`parking ${city}`)}`;
  const webPark = parking?.web || null;
  const cityNamed = new Set((webPark?.car_parks || []).map((c) => (c.name || '').toLowerCase()));
  const fmtDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${iso}T00:00:00Z`));
    } catch { return iso; }
  };

  return (
    <>
      {/* Getting there keeps its heading when it has nothing to show and says
          so in one line (T367): every tab exists for every place, so the bar
          never shifts between places (1.4 part 3). */}
      <Section id="getting" title={t('dest.gettingTitle')}>
        {getting && <GettingThere getting={lang === 'en' ? getting : { ...getting, why: null }} t={t} />}
        {!hasGetting && <div className="sec-none" data-testid="section-none"><p>{t('dest.gettingNone', { city })}</p></div>}
        {rhythm && lang === 'en' && <p className="destp-rhythm">{rhythm}</p>}
        {bookAhead.length > 0 && (
          <p className="destp-bookahead">
            <AlertIcon size={16} className="destp-bookahead-icon" />
            {t('dest.bookAhead', { names: bookAhead.join(', ') })}
          </p>
        )}
      </Section>

      <div className="destp-folds">
        {/* The verdict, with its argument. The Score in the head opens it. */}
        {verdict?.score != null && (
          <Fold level={2}
            id="sec-rating"
            icon={StarIcon}
            title={t('dest.ratingTitle', { score: fmtScore(verdict.score) })}
            summary={verdictBand}
            open={isOpen('rating')}
            onToggle={() => toggle('rating')}
          >
            <RatingBreakdown
              rating={verdict}
              meta={data?.meta}
              t={t}
              countryLine={verdict.country_rank === 1
                ? t('card.topOf', { country: destination.country })
                : verdict.country_badge
                  ? t('card.rankIn', { n: verdict.country_rank, country: destination.country })
                  : null}
            />
          </Fold>
        )}

        {/* Where to sleep: neighbourhood prices, tiers, the price curve. */}
        {hasSleep && (
          <Fold level={2}
            id="sec-sleep"
            icon={BedIcon}
            title={t('dest.sleepTitle')}
            summary={sleepNames}
            open={isOpen('sleep')}
            onToggle={() => toggle('sleep')}
          >
            <Neighbourhoods sleep={sleep} t={t} />
          </Fold>
        )}

        {/* Food and drink: the traveller's day at their Lifestyle, then what
            things cost here (T515). The page's fifth and last fold. */}
        <DestFood t={t} city={city} destination={destination}
          isOpen={isOpen} toggle={toggle} onOpenLifestyle={onOpenLifestyle} />

        {/* Insider tips: rule codes with evidence behind every sentence. */}
        {tips.length > 0 && (
          <Fold level={2}
            id="sec-tips"
            icon={BulbIcon}
            title={t('dest.tipsTitleV')}
            open={isOpen('tips')}
            onToggle={() => toggle('tips')}
          >
            {/* One tip at a time on the shared deck (carta-design
                "Flashcards", T395): Previous, Next, the arrow keys and
                Show all; printing shows the list. */}
            <div className="destp-tips">
              <FlashDeck
                id="dest-tips-deck"
                label={t('dest.tipsTitleV')}
                t={t}
                cards={tips.map((tip) => {
                  const text = tipText(tip, t);
                  return { key: tip.code, text, category: cardCategory(text, 'tip') };
                })}
              />
            </div>
          </Fold>
        )}

        {/* Parking and what to bring: the two practical lists, one fold
            (T429; carta-design caps a page at five folded rows). */}
        {(hasPark || packs.length > 0) && (
          <Fold level={2}
            id="sec-practical"
            icon={BackpackIcon}
            title={t('dest.practicalTitle')}
            summary={packs.length > 0 ? t('dest.packSummaryFor', { month: monthName(month, lang, true) }) : ''}
            open={isOpen('practical')}
            onToggle={() => toggle('practical')}
          >
            {packs.length > 0 && (
              <div className="destp-pack">
                <h3 className="destp-subhead">{t('explore.packTitle')}</h3>
                <div className="xp-packs">
                  {packs.map((key) => {
                    const Glyph = PACK_GLYPH[key] || PersonIcon;
                    return (
                      <span key={key} className="xp-pack">
                        <Glyph size={16} />
                        <span>{t(`explore.pack.${key}`)}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {hasPark && (
              <div className="destp-parking">
                <h3 className="destp-subhead">{t('explore.parkTitle')}</h3>
                {webPark && (
                  <div className="dpark-web">
                    <p className="dpark-web-head"><CheckIcon size={12} />{t('dest.parkChecked', { date: fmtDate(webPark.checked) })}</p>
                    {webPark.restricted && (
                      <p className="dpark-web-line is-warn">{t('dest.parkRestricted')}</p>
                    )}
                    {webPark.car_parks?.length > 0 && (
                      <p className="dpark-web-line">
                        <b>{t('dest.parkCityNamed')}:</b> {webPark.car_parks.map((c) => cleanName(c.name)).join(', ')}
                      </p>
                    )}
                    {webPark.park_ride_names?.length > 0 && (
                      <p className="dpark-web-line"><b>{t('explore.park.park_ride')}:</b> {webPark.park_ride_names.map(cleanName).join(', ')}</p>
                    )}
                    {safeUrl(webPark.official_url) && (
                      <a className="dpark-web-link" href={safeUrl(webPark.official_url)} target="_blank" rel="noreferrer noopener"><LinkIcon size={12} />{t('dest.parkOfficial')}</a>
                    )}
                  </div>
                )}
                <ul className="destp-park-list">
                  {(parking.spots || []).map((s) => {
                    const confirmed = s.name && cityNamed.has(s.name.toLowerCase());
                    return (
                      <li className="destp-park" key={`${s.lat}|${s.lon}`}>
                        <span className="destp-park-main">
                          <span className="destp-park-name">
                            {s.name ? cleanName(s.name) : t('explore.parkUnnamed')}
                            {confirmed && <span className="dpark-ok"><CheckIcon size={10} />{t('dest.parkVerified')}</span>}
                          </span>
                          <span className="destp-park-sub">
                            <span className={s.fee === 'no' ? 'destp-park-free' : ''}>
                              {t(s.fee === 'no' ? 'explore.parkFree' : s.fee === 'yes' ? 'explore.parkPaid' : 'explore.parkFeeUnknown')}
                            </span>
                            {s.capacity != null && <span>{t('explore.parkSpaces', { n: s.capacity })}</span>}
                            <span>{t('dest.walkMin', { n: s.walk_min })}</span>
                          </span>
                        </span>
                        <span className="destp-park-nav">
                          <a href={s.nav.gmaps} target="_blank" rel="noreferrer noopener">{t('dest.navGmaps')}</a>
                          <a href={s.nav.waze} target="_blank" rel="noreferrer noopener">{t('dest.navWaze')}</a>
                        </span>
                      </li>
                    );
                  })}
                  {parking.park_ride && (
                    <li className="destp-park is-pr" key="pr">
                      <span className="destp-park-main">
                        <span className="destp-park-name">{parking.park_ride.name || t('explore.park.park_ride')}</span>
                        <span className="destp-park-sub">
                          <span>{t('explore.park.park_ride')}</span>
                          <span>{fmtKm((parking.park_ride.dist_m || 0) / 1000)}</span>
                        </span>
                      </span>
                      <span className="destp-park-nav">
                        <a href={parking.park_ride.nav.gmaps} target="_blank" rel="noreferrer noopener">{t('dest.navGmaps')}</a>
                        <a href={parking.park_ride.nav.waze} target="_blank" rel="noreferrer noopener">{t('dest.navWaze')}</a>
                      </span>
                    </li>
                  )}
                </ul>
                <a className="destp-exit dpark-search" href={parkSearch} target="_blank" rel="noreferrer noopener"><ParkingIcon size={16} /><span>{t('dest.parkSearch')}</span></a>
                {/* The OpenStreetMap credit the ODbL asks for stays. */}
                <p className="xp-source">{t('dest.parkSource')}</p>
              </div>
            )}
          </Fold>
        )}
      </div>

      {/* Exits: every hand-over to a booking or search site, one row, each a
          link; the one line every booking link owes the traveller
          (PRODUCT.md: prices may have changed). */}
      {exits.length > 0 && (
        <section className="destp-exits" aria-labelledby="h-exits">
          <h2 className="destp-exits-title" id="h-exits">{t('explore.furtherTitle', { city })}</h2>
          <div className="destp-exit-row">
            {exits.map(({ key, href, label, Icon }) => (
              <a key={key} className="destp-exit" href={href} target="_blank" rel="noreferrer noopener">
                <Icon size={16} />
                <span>{label}</span>
              </a>
            ))}
          </div>
          <p className="destp-exits-note">{t('prov.bookingNote')}</p>
        </section>
      )}
    </>
  );
}
