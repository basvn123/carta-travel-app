import React from 'react';
import {
  StarIcon, PersonIcon, BedIcon, MapPinIcon, TrainIcon, BusIcon, CarIcon, FerryIcon,
  BikeIcon, BootIcon, PencilIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { eur } from '../lib/format.js';
import { useI18n } from '../i18n/index.jsx';
import { crewLabel } from './tripCrew.js';
import { SPEND_CATS, spendSummary, spendPerPerson } from './pastTripMemory.js';

/**
 * TripMemoryView, a logged trip read back.
 *
 * Everything the traveller typed, in the order it was asked for, and nothing
 * that was left blank: an empty section is not an empty state here, it is a
 * question that did not apply. The spend is set as a receipt, the same shape
 * the app uses to justify any other total, because a trip you took is the one
 * total that needs no justifying at all.
 */

const MODE_ICONS = {
  fly: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon,
  ferry: FerryIcon, bike: BikeIcon, walk: BootIcon,
};
const MODE_LABEL = {
  fly: 'trip.modeFly', train: 'trip.modeTrain', bus: 'trip.modeBus', car: 'trip.modeCar',
  ferry: 'trip.modeFerry', bike: 'saved.pastModeBike', walk: 'saved.pastModeWalk',
};

function Leg({ mode, t }) {
  const Icon = MODE_ICONS[mode];
  if (!Icon) return <span className="memo-leg is-plain" aria-hidden="true" />;
  return (
    <span className="memo-leg" title={t(MODE_LABEL[mode])}>
      <Icon size={12} />
    </span>
  );
}

export function TripMemoryView({ memory, onEdit }) {
  const { t, lang } = useI18n();
  if (!memory) return null;

  const places = memory.places || [];
  const legs = memory.legs || [];
  // Inline images only, mirroring the SQL projection's filter (migration
  // 011). This view also renders FOREIGN payloads (a friend's trip, a share),
  // and a remote src would make the viewer's browser call it: a tracking
  // pixel reporting who looked. A data: URL cannot phone home.
  const photos = (memory.photos || []).filter(
    (p) => typeof p?.src === 'string' && p.src.startsWith('data:image/'),
  );
  const highlights = (memory.highlights || []).filter(Boolean);
  const crewLine = crewLabel(memory.crew, lang);
  const adults = Number(memory.travellers?.adults) || 0;
  const children = Number(memory.travellers?.children) || 0;
  const heads = adults + children;
  const spend = spendSummary(memory);
  const perHead = spendPerPerson(memory);

  return (
    <div className="memo">
      {photos.length > 0 && (
        <div className="memo-photos">
          {photos.map((p) => (
            <figure className="memo-photo" key={p.id}>
              <img src={p.src} alt={p.caption || ''} loading="lazy" />
              {p.caption && <figcaption>{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      {(memory.rating != null || memory.story?.trim()) && (
        <div className="memo-block">
          {memory.rating != null && (
            <span className="memo-rating">
              <StarIcon size={12} />
              <b>{memory.rating}</b>
              <small>/ 10</small>
            </span>
          )}
          {memory.story?.trim() && <p className="memo-story">{memory.story}</p>}
        </div>
      )}

      {highlights.length > 0 && (
        <div className="memo-block">
          <span className="memo-title">{t('saved.pastHighlights')}</span>
          <ul className="memo-list">
            {highlights.map((h, i) => <li key={`h${i}`}>{h}</li>)}
          </ul>
        </div>
      )}

      {places.length > 0 && (
        <div className="memo-block">
          <span className="memo-title">{t('saved.pastRoute')}</span>
          <div className="memo-route">
            {places.map((p, i) => (
              <div className="memo-stop" key={`p${i}`}>
                <Leg mode={legs[i]?.mode} t={t} />
                <span className="memo-stop-mark">
                  {p.country ? <CountryFlag country={p.country} size={12} /> : <MapPinIcon size={12} />}
                </span>
                <span className="memo-stop-city">{p.city}</span>
                {p.nights > 0 && (
                  <span className="memo-stop-nights">
                    {t(p.nights === 1 ? 'saved.pastNights1' : 'saved.pastNightsN', { n: p.nights })}
                  </span>
                )}
                {(p.stay?.name || p.stay?.kind) && (
                  <span className="memo-stop-stay">
                    <BedIcon size={11} />
                    {p.stay.name || t(`saved.pastStay_${p.stay.kind}`)}
                  </span>
                )}
              </div>
            ))}
            {legs[places.length]?.mode && (
              <div className="memo-stop">
                <Leg mode={legs[places.length].mode} t={t} />
                <span className="memo-stop-city is-home">{t('saved.pastHome')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {(heads > 1 || crewLine) && (
        <div className="memo-block">
          <span className="memo-title">{t('saved.pastWho')}</span>
          <p className="memo-line">
            <PersonIcon size={12} />
            {t(heads === 1 ? 'saved.pastTraveller1' : 'saved.pastTravellerN', { n: heads })}
            {children > 0 && ` (${t(children === 1 ? 'saved.pastChild1' : 'saved.pastChildN', { n: children })})`}
            {crewLine && `, ${crewLine}`}
          </p>
        </div>
      )}

      {spend.any && (
        <div className="memo-block">
          <span className="memo-title">{t('saved.pastCost')}</span>
          <div className="memo-receipt">
            {SPEND_CATS.filter((c) => spend.byCat[c]).map((c) => (
              <div className="memo-recline" key={c}>
                <span>{t(`saved.pastSpend_${c}`)}</span>
                <b>{spend.currency === 'EUR' ? eur(spend.byCat[c]) : `${spend.byCat[c].toFixed(2)} ${spend.currency}`}</b>
              </div>
            ))}
            <div className="memo-recline is-total">
              <span>{t('saved.pastTotal')}</span>
              <b>{eur(spend.total)}</b>
            </div>
            {heads > 1 && perHead != null && (
              <div className="memo-recline is-each">
                <span>{t('saved.pastPerPersonLabel')}</span>
                <b>{eur(perHead)}</b>
              </div>
            )}
          </div>
          {spend.foreign && <p className="memo-note">{t('saved.pastRateNote')}</p>}
        </div>
      )}

      {onEdit && (
        <button className="memo-edit" onClick={onEdit}>
          <PencilIcon size={13} /> {t('saved.pastEditTrip')}
        </button>
      )}
    </div>
  );
}
