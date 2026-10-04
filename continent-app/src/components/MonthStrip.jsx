import React, { useId, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { InfoIcon } from './Icons.jsx';

/* The twelve-month strip. One cell per month, January to December:
     good     filled, the months to go
     avoid    struck through, the months to skip
     neutral  plain
   A month in both lists counts as good (the avoid text was about part of it).
   `info` is the prose that used to sit under the strip; it opens from the
   small info button, so the strip reads in half a second and the reasoning is
   one tap away. `price` (T103) adds a second aligned row under the weather
   one: { states: 12 of cheap | mid | dear, place, km, both: month numbers that
   are good and cheap }. `price` null means "looked, nothing measured" and
   says so; undefined means the screen does not ask (one row, as before).
   Shared by journeys now and by beaches, lakes and mountains in
   P7, so it takes plain month numbers and knows nothing about trips. */

const NO_MONTHS = [];

export function MonthStrip({ good = NO_MONTHS, avoid = NO_MONTHS, info = null, price, className = '' }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  const cells = useMemo(() => {
    const goodSet = new Set(good);
    const avoidSet = new Set(avoid);
    let initial;
    let full;
    try {
      initial = new Intl.DateTimeFormat(lang, { month: 'narrow' });
      full = new Intl.DateTimeFormat(lang, { month: 'long' });
    } catch {
      initial = new Intl.DateTimeFormat('en', { month: 'narrow' });
      full = new Intl.DateTimeFormat('en', { month: 'long' });
    }
    return Array.from({ length: 12 }, (_, i) => {
      const n = i + 1;
      const d = new Date(Date.UTC(2026, i, 15));
      const state = goodSet.has(n) ? 'good' : avoidSet.has(n) ? 'avoid' : 'neutral';
      return {
        n,
        state,
        initial: initial.format(d).toLocaleUpperCase(lang),
        name: full.format(d),
      };
    });
  }, [good, avoid, lang]);

  const two = price !== undefined;
  const priceMark = { cheap: '−', mid: '', dear: '+' };
  const priceWord = { cheap: t('monthStrip.priceCheap'), mid: '', dear: t('monthStrip.priceDear') };

  const stateLabel = { good: t('monthStrip.good'), avoid: t('monthStrip.avoid'), neutral: '' };

  return (
    <div className={`mstrip ${two ? 'has-price' : ''} ${className}`.trim()}>
      {two && <span className="mstrip-cap">{t('monthStrip.rowWeather')}</span>}
      <div className="mstrip-row">
        <ol className="mstrip-cells" aria-label={t('monthStrip.label')}>
          {cells.map((c) => (
            <li
              key={c.n}
              className={`mstrip-cell is-${c.state}`}
              aria-label={`${c.name}${stateLabel[c.state] ? `, ${stateLabel[c.state]}` : ''}`}
            >
              <span aria-hidden="true">{c.initial}</span>
            </li>
          ))}
        </ol>
        {info && (
          <button
            type="button"
            className="mstrip-info"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={t('monthStrip.why')}
            onClick={() => setOpen((v) => !v)}
          >
            <InfoIcon size={16} />
          </button>
        )}
      </div>
      {two && (
        <>
          <span className="mstrip-cap">{t('monthStrip.rowPrice')}</span>
          {price ? (
            <>
              <div className="mstrip-row">
                <ol className="mstrip-cells" aria-label={t('monthStrip.priceLabel')}>
                  {cells.map((c) => (
                    <li
                      key={c.n}
                      className={`mstrip-cell is-price-${price.states[c.n - 1]}`}
                      aria-label={`${c.name}${priceWord[price.states[c.n - 1]] ? `, ${priceWord[price.states[c.n - 1]]}` : ''}`}
                    >
                      <span aria-hidden="true">{priceMark[price.states[c.n - 1]]}</span>
                    </li>
                  ))}
                </ol>
                {info && <span className="mstrip-gap" aria-hidden="true" />}
              </div>
              <p className="mstrip-note">
                {price.both.length > 0 && (
                  <>{t('monthStrip.priceBoth', { months: price.both.map((n) => cells[n - 1].name).join(', ') })} </>
                )}
                {price.km < 5
                  ? t('monthStrip.priceNear', { place: price.place })
                  : t('monthStrip.priceSource', { place: price.place, km: price.km })}
              </p>
            </>
          ) : (
            <p className="mstrip-note">{t('monthStrip.priceNone')}</p>
          )}
        </>
      )}
      {info && (
        <div id={panelId} className="mstrip-panel" hidden={!open}>
          {info}
        </div>
      )}
    </div>
  );
}
