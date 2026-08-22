import React from 'react';
import { flagUrl, isoToFlag } from '../lib/tripGuide.js';
import { fmtMonths } from '../lib/dates.js';
import { eur } from '../lib/format.js';
import { BAND_KEY } from '../lib/costIndex.js';
import { useI18n } from '../i18n/index.jsx';
import {
  CheckIcon, PlusIcon, BedIcon, DiningIcon, CalendarIcon, StarIcon, InfoIcon, MapPinIcon,
} from '../components/Icons.jsx';

/**
 * One country, opened.
 *
 * The wizard's country grid answers "which of these do I fancy" with a
 * photograph and one price. This panel answers the four questions that decide
 * it, in the order a person asks them:
 *
 *   what does a day cost   a bed and a day of eating out, per person, in euros
 *   what is there to visit named places, with the reason they are named
 *   what would I do there  how many beach towns, mountain bases, art cities
 *   when should I go       the months, and why those months
 *
 * It is deliberately not a booking surface and carries no fare: transport is
 * chosen and paid for outside Carta now, and a flight price on this panel
 * would be a fact about a date rather than about the country (see
 * lib/countryBrief.js for the whole argument).
 *
 * Rendered inline beside the grid rather than as a floating layer: the wizard
 * sits inside a transformed, blurred shell, and a fixed panel inside one of
 * those is the app's oldest layout trap.
 */

function Flag({ iso2 }) {
  const url = flagUrl(iso2, 40);
  if (!url) return <span className="cbrief-flag">{isoToFlag(iso2)}</span>;
  return <img className="cbrief-flag" src={url} srcSet={`${flagUrl(iso2, 80)} 2x`} alt="" loading="lazy" />;
}

/** One measured euro figure with what it measures under it. */
function Figure({ icon: Icon, value, label, sub }) {
  return (
    <div className="cbrief-fig">
      <span className="cbrief-fig-label">{Icon && <Icon size={11} />} {label}</span>
      <b className="cbrief-fig-val">{value}</b>
      {sub && <small className="cbrief-fig-sub">{sub}</small>}
    </div>
  );
}

export function CountryBrief({ brief, picked, onToggle, onClose }) {
  const { t } = useI18n();
  if (!brief) return null;
  const band = brief.dayBand != null ? t(BAND_KEY[brief.dayBand]) : null;

  return (
    <aside className="cbrief" aria-label={brief.country}>
      <div className="cbrief-head">
        <Flag iso2={brief.iso2} />
        <h3 className="cbrief-title">{brief.country}</h3>
        <button className="cbrief-close" onClick={onClose} aria-label={t('wizard.close')}>×</button>
      </div>

      <div className="cbrief-body">
        {/* What a day costs. The headline figure is the two measured baskets
            added up, because that is the number a traveller budgets with. */}
        <section className="cbrief-sect">
          {brief.dayEur != null ? (
            <>
              <div className="cbrief-day">
                <b className="cbrief-day-val">{eur(Math.round(brief.dayEur))}</b>
                <span className="cbrief-day-label">
                  {t('brief.aDayPerPerson')}
                  {band && <em className={`cbrief-band b${brief.dayBand}`}>{band}</em>}
                </span>
              </div>
              <div className="cbrief-figs">
                <Figure
                  icon={BedIcon}
                  label={t('brief.bed')}
                  value={eur(Math.round(brief.stayEur))}
                  sub={t('brief.aNight')}
                />
                <Figure
                  icon={DiningIcon}
                  label={t('brief.eatingOut')}
                  value={eur(Math.round(brief.foodEur))}
                  sub={t('brief.aDay')}
                />
              </div>
            </>
          ) : (
            <p className="cbrief-note">{t('brief.noPrices')}</p>
          )}
          <p className="cbrief-note">
            {brief.priced === brief.nPlaces
              ? t('brief.pricedAll', { n: brief.priced })
              : t('brief.pricedFrom', { n: brief.priced, total: brief.nPlaces })}
            {brief.guideRange && ` ${t('brief.guideSays', { lo: brief.guideRange[0], hi: brief.guideRange[1] })}`}
          </p>
        </section>

        {/* What to visit. */}
        {brief.visit.length > 0 && (
          <section className="cbrief-sect">
            <h4 className="cbrief-h">{t('brief.toVisit')}</h4>
            <ul className="cbrief-list">
              {brief.visit.slice(0, 6).map((v) => (
                <li className="cbrief-place" key={`${v.name}-${v.id || ''}`}>
                  {/* A hand-written must-see that the catalogue does not hold
                      has no photograph of its own. A pin says "a place, no
                      picture"; six empty grey rectangles said nothing. */}
                  {v.img
                    ? <img className="cbrief-thumb" src={v.img} alt="" loading="lazy" />
                    : (
                      <span className="cbrief-thumb cbrief-thumb-none" aria-hidden="true">
                        <MapPinIcon size={14} />
                      </span>
                    )}
                  <span className="cbrief-place-text">
                    <b>
                      {v.name}
                      {v.rating != null && (
                        <span className="cbrief-rate"><StarIcon size={9} /> {v.rating.toFixed(1)}</span>
                      )}
                    </b>
                    {v.why && <small>{v.why}</small>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* What to do, as counts of places rather than adjectives. */}
        {brief.themes.length > 0 && (
          <section className="cbrief-sect">
            <h4 className="cbrief-h">{t('brief.toDo')}</h4>
            <div className="cbrief-chips">
              {brief.themes.slice(0, 6).map((th) => (
                <span className="cbrief-chip" key={th.key}>
                  <b>{th.n}</b> {t(th.labelKey)}
                </span>
              ))}
            </div>
            {brief.eat.length > 0 && (
              <p className="cbrief-line"><DiningIcon size={11} /> {brief.eat.slice(0, 3).join(', ')}</p>
            )}
            {brief.events.length > 0 && (
              <p className="cbrief-line"><CalendarIcon size={11} /> {brief.events.slice(0, 2).join(', ')}</p>
            )}
          </section>
        )}

        {/* When. */}
        {(brief.bestMonths.length > 0 || brief.bestTimeNote) && (
          <section className="cbrief-sect">
            <h4 className="cbrief-h">{t('brief.whenToGo')}</h4>
            {brief.bestMonths.length > 0 && (
              <p className="cbrief-line"><CalendarIcon size={11} /> <b>{fmtMonths(brief.bestMonths)}</b></p>
            )}
            {brief.bestTimeNote && <p className="cbrief-note">{brief.bestTimeNote}</p>}
          </section>
        )}

        {brief.tips.length > 0 && (
          <section className="cbrief-sect">
            <h4 className="cbrief-h">{t('brief.worthKnowing')}</h4>
            <ul className="cbrief-tips">
              {brief.tips.slice(0, 2).map((tip, i) => (
                <li key={i}><InfoIcon size={11} /> <span>{tip}</span></li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="cbrief-foot">
        <button
          className={`cbrief-add ${picked ? 'on' : ''}`}
          onClick={() => onToggle(brief.country)}
          aria-pressed={picked}
        >
          {picked
            ? <><CheckIcon size={13} /> {t('brief.onYourList')}</>
            : <><PlusIcon size={13} /> {t('brief.addCountry', { country: brief.country })}</>}
        </button>
      </div>
    </aside>
  );
}
