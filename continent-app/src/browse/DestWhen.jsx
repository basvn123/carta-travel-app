import React from 'react';
import { safeUrl } from '../lib/format.js';
import { ClimateStrip } from './ClimateStrip.jsx';
import { CrowdCalendar } from './CrowdCalendar.jsx';
import { BathingWater } from './BathingWater.jsx';
import { Section } from './DestTiles.jsx';

/**
 * The destination page's When to go tab (T499, roadmap 1.4): the month strip
 * with every figure, the cheapest months to stay, the crowds, the bathing
 * water and the festivals, which were a fold and are an open block here.
 * Moved from DestinationPage.jsx (T429, T446), not rewritten. Roadmap 1.11
 * and 4.10 add the month tip and the better-dates button here.
 */
export function DestWhen({ p }) {
  const { t, destination, water, monthPick, cheapMonths, festivals, monthList } = p;
  return (
    <>
      <Section id="when" title={t('dest.whenTitle')}>
        {destination.climate?.m && <ClimateStrip climate={destination.climate} month={monthPick} figures />}
        {cheapMonths && (
          <p className="xp-when-fact">{t('explore.whenCheapStay', { months: monthList(cheapMonths) })}</p>
        )}
        <CrowdCalendar destination={destination} t={t} />
        <BathingWater water={water} destination={destination} t={t} />
      </Section>

      {/* Festivals, led by when they happen. */}
      {festivals.length > 0 && (
        <Section id="festivals" title={t('dest.festivalsTitle')}>
          <ul className="destp-fests">
            {festivals.map((f) => (
              <li className="destp-fest" key={f.name}>
                <span className={`destp-fest-when ${f.months?.length ? '' : 'is-undated'}`}>
                  {f.months?.length ? monthList(f.months) : t('pdf.dateVaries')}
                </span>
                <span className="destp-fest-main">
                  <span className="destp-fest-name">
                    {safeUrl(f.url) ? (
                      <a href={safeUrl(f.url)} target="_blank" rel="noreferrer">{f.name}</a>
                    ) : f.name}
                  </span>
                  {f.what && <span className="destp-fest-what">{f.what}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
