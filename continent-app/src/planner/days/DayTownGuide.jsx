import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import NotYet from '../../components/NotYet.jsx';
import { BedIcon, BulbIcon, CalendarIcon, ChevronDownIcon, InfoIcon, MusicIcon, SparkIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { formatEst } from '../../lib/money.js';
import { formatRange } from '../../lib/format.js';
import { cityLabel } from '../../lib/placeName.js';
import { loadDossier } from '../../lib/dossier.js';
import { townGuide, townPhotos } from './townGuide.js';
import { tipText } from '../../browse/destParts.js';

const ICON = { vibe: SparkIcon, sleep: BedIcon, when: CalendarIcon, getting: PlaneIcon, know: BulbIcon, on: MusicIcon, tip: InfoIcon };

/**
 * The town's own page head on a day (T673), after the Polarsteps place page
 * and its guide list: the photograph (nothing on it), the flag and country,
 * the town's name and its one line, a strip of more photographs, then the
 * guide as questions that open in place (the vibe, where to sleep, the best
 * time, how to get there, good to know, what is on, an insider tip). A
 * question the data cannot answer yet keeps its row with the placeholder.
 * `showHead` is the first day in a town; later days keep only the guide.
 *
 * `folded` (T898, the owner's plan days board): the guide is about the town,
 * not the day, so on a day it closes into one "About {town}" block at the
 * end, without the photograph, and the questions the data cannot answer
 * yet are left out instead of saying "Not available yet".
 */
export function DayTownGuide({ dest, destId, month = null, showHead = true, folded = false }) {
  const { t, lang } = useI18n();
  const [dossier, setDossier] = useState(undefined);
  useEffect(() => {
    let live = true;
    setDossier(undefined);
    if (!destId) { setDossier(null); return undefined; }
    loadDossier(destId).then((d) => { if (live) setDossier(d || null); }, () => { if (live) setDossier(null); });
    return () => { live = false; };
  }, [destId]);
  const rows = useMemo(() => townGuide(dossier, { month }), [dossier, month]);
  const photos = useMemo(() => townPhotos(dossier, dest), [dossier, dest]);
  const monthName = (m) => new Intl.DateTimeFormat(lang, { month: 'short' }).format(new Date(2026, m - 1, 1));
  const est = (v) => formatEst(v, t('money.est'), { precision: 'whole', locale: lang });
  const city = cityLabel(dest?.city || '');

  const body = (key, items) => {
    if (!items.length) return <NotYet line as="p" className="dtg-notyet" />;
    if (key === 'vibe') return <p className="dtg-text">{items[0].text}</p>;
    if (key === 'sleep') {
      return (
        <ul className="dtg-list">
          {items.map((n) => (
            <li key={n.text}>
              <span>{n.text}</span>
              {n.eur != null && <span className="dtg-fig">{t('dtg.aNight', { price: est(n.eur) })}</span>}
            </li>
          ))}
        </ul>
      );
    }
    if (key === 'when') {
      return (
        <ul className="dtg-list">
          {items.map((w, i) => (w.months ? (
            <li key={`m${i}`}><span>{t('dtg.bestIn', { months: bestRange(w.months, monthName) })}</span></li>
          ) : (
            <li key={`c${i}`}><span>{t(`dtg.crowd.${w.crowd ?? 'x'}`, { label: w.label })}</span></li>
          )))}
        </ul>
      );
    }
    if (key === 'getting') {
      return (
        <ul className="dtg-list">
          {items.map((g, i) => {
            if (g.airport) return <li key={i}><span>{t('dtg.airport', { code: g.airport })}</span></li>;
            if (g.transit) return <li key={i}><span>{t(`dtg.transit.${g.transit}`, { word: g.transit })}</span></li>;
            return <li key={i}><span>{t(g.carNeeded ? 'dtg.carHelps' : 'dtg.noCar')}</span></li>;
          })}
        </ul>
      );
    }
    if (key === 'know') {
      return (
        <ul className="dtg-list">
          {items.map((k, i) => (k.text
            ? <li key={i}><span>{k.text}</span></li>
            : <li key={i}><span>{t('dtg.bookAhead', { list: k.bookAhead.join(', ') })}</span></li>))}
        </ul>
      );
    }
    if (key === 'on') {
      return (
        <ul className="dtg-list">
          {items.map((e) => (
            <li key={e.text} className="dtg-event">
              <span className="dtg-strong">{e.text}</span>
              {e.what && <span className="dtg-sub">{e.what}</span>}
            </li>
          ))}
        </ul>
      );
    }
    if (key === 'tip') {
      const tr = Object.assign((k, a) => t(k, a), { lang });
      return (
        <ul className="dtg-list">
          {items.map((x) => <li key={x.tip.code}><span>{tipText(x.tip, tr)}</span></li>)}
        </ul>
      );
    }
    return <NotYet line as="p" className="dtg-notyet" />;
  };

  if (folded) {
    const known = dossier ? rows.filter((r) => r.items.length) : [];
    if (!known.length) return null;
    return (
      <details className="dtg dtg-fold">
        <summary className="dtg-fold-sum">
          <span>{t('dtg.about', { city })}</span>
          <ChevronDownIcon size={16} className="dtg-q-chev" />
        </summary>
        <dl className="dtg-fold-rows">
          {known.map((r) => (
            <div key={r.key} className="dtg-fold-row">
              <dt>{t(`dtg.q.${r.key}`)}</dt>
              <dd>{body(r.key, r.items)}</dd>
            </div>
          ))}
        </dl>
      </details>
    );
  }

  return (
    <section className="dtg" aria-label={t('dtg.label', { city })}>
      {showHead && (
        <div className="dtg-head">
          {photos[0] && <HeroImage url={photos[0]} city={city} iso2={dest?.iso2} className="dtg-photo" ratio={[16, 9]} maxWidth={960} />}
          <p className="dtg-country"><CountryFlag country={dest?.iso2} size={14} /> {dest?.country || ''}</p>
          <h2 className="dtg-city">{city}</h2>
          {rows[0].items[0]?.text && <p className="dtg-line">{rows[0].items[0].text}</p>}
          {photos.length > 1 && (
            <ul className="dtg-strip" aria-label={t('dtg.photos', { city })}>
              {photos.slice(1).map((u) => (
                <li key={u}><HeroImage url={u} city={city} className="dtg-thumb" ratio={[1, 1]} maxWidth={240} /></li>
              ))}
            </ul>
          )}
        </div>
      )}
      {dossier === undefined ? (
        <div className="dtg-loading" aria-busy="true"><span className="sr-only">{t('ready.loading')}</span></div>
      ) : (
        <ul className="dtg-rows">
          {rows.filter((r) => !(showHead && r.key === 'vibe')).map((r) => {
            const Icon = ICON[r.key];
            return (
              <li key={r.key}>
                <details className="dtg-q">
                  <summary>
                    <span className="dtg-q-icon" aria-hidden="true"><Icon size={20} /></span>
                    <span className="dtg-q-text">{t(`dtg.q.${r.key}`)}</span>
                    <ChevronDownIcon size={16} className="dtg-q-chev" />
                  </summary>
                  <div className="dtg-a">{body(r.key, r.items)}</div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** "Jun to Sep" for a run of months, else the months listed. */
function bestRange(months, name) {
  const ms = [...months].sort((a, b) => a - b);
  const run = ms.every((m, i) => i === 0 || m === ms[i - 1] + 1);
  if (run && ms.length > 2) return formatRange(name(ms[0]), name(ms[ms.length - 1]), (x) => x);
  return ms.map(name).join(', ');
}
