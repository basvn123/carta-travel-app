import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { Segmented, Figure } from '../../components/ui/index.js';
import { formatMoney } from '../../lib/money.js';
import { priceDay } from '../../lib/price/index.js';
import { placeRow, flightFiles } from '../../lib/settings/ways.js';
import { homePoint } from '../../lib/travelWay.js';
import { partyOf } from '../../lib/party.js';
import { destCityLabel } from '../../lib/placeName.js';
import { usePlaceLocalName } from '../../lib/search/localNames.js';
import { ChoiceTiles, wayIcon, nightsText } from './settingsBits.jsx';

const WAYS = ['any', 'plane', 'train', 'bus', 'car'];

/** Getting there (G12 Settings): Best way, Plane, Train, Bus, Car. */
export function WayStep({ model, onChange }) {
  const { t } = useI18n();
  return (
    <div className="set-step set-way">
      <ChoiceTiles
        label={t('settings.sheet.row.way')}
        className="set-ways"
        value={model.way.mode}
        onChange={(m) => { model.way.setMode(m); onChange(); }}
        options={WAYS.map((w) => ({ value: w, label: t(`settings.sheet.way.${w}`), icon: wayIcon(w) }))}
      />
    </div>
  );
}

/** The place the example prices: the best scored place with a day figure,
 *  a real row from the catalogue, never a made-up one. */
function examplePlace(destinations, request) {
  let best = null;
  for (const d of Object.values(destinations || {})) {
    const score = Number(d?.rating?.score);
    if (!d?.city || !Number.isFinite(score)) continue;
    if (best && (score < best.score || (score === best.score && (d.geonames?.population || 0) <= (best.d.geonames?.population || 0)))) continue;
    const day = priceDay(d, request, destinations);
    if (!Number.isFinite(day?.dayEur) || !Number.isFinite(day?.stayEur) || !Number.isFinite(day?.foodEur)) continue;
    best = { d, score };
  }
  return best?.d || null;
}

/**
 * Prices shown (G12 Settings, APPROVED): two switches (A day or The whole
 * trip; Each person or The group, the group greyed, not hidden, for one
 * traveller) and a live example on a real place: its figure as the list
 * will show it, with the bed and the food under it, and the whole trip for
 * the group. No sentence, no formula.
 */
export function PricesStep({ model, onChange }) {
  const { t, lang } = useI18n();
  const { prices, s } = model;
  const alone = prices.party <= 1;
  const destinations = model.data?.destinations || null;
  // The place is chosen once per open, so it never changes under a switch.
  const [place] = React.useState(() => examplePlace(destinations, s?.priceRequest));
  const [touched, setTouched] = React.useState(false);
  // Named in the UI language, as search names it (Rom, not Rome).
  const localName = usePlaceLocalName(place, lang);

  const setSpan = (v) => { prices.setSpan(v); setTouched(true); onChange(); };
  const setView = (v) => { prices.setView(v); setTouched(true); onChange(); };

  // The model's figure for this place in the current settings (Lane 3,
  // priceFigure over the engine's day answer and the way there its card
  // has): the amount, its unit and its bed and food parts in the same span
  // and view. Without the way the whole trip would say "not known yet" for
  // a place whose card shows a fare.
  const data = model.data;
  const request = s?.priceRequest;
  const wayMode = s?.transportMode || 'any';
  const row = React.useMemo(() => {
    if (!place) return null;
    const day = priceDay(place, request, destinations);
    return placeRow({
      id: place.id, day, destinations, files: flightFiles(data), request, mode: wayMode,
      home: homePoint({ drive_home: s?.fromPlace, origin: s?.origin }, data),
      party: partyOf({ group_size: s?.party, children: s?.children, babies: s?.babies }),
    }) || day;
  }, [place, request, destinations, data, wayMode, s?.fromPlace, s?.origin, s?.party, s?.children, s?.babies]);
  const fig = row ? model.figure(row) : null;
  const shown = fig && Number.isFinite(fig.eur) ? fig.eur : null;
  const unit = fig ? t(fig.unit[0], fig.unit[1]) : '';
  const bed = fig?.parts?.bed;
  const food = fig?.parts?.food;
  // On the whole trip the way there is the third part, so the parts add
  // up to the figure (flow-B M2).
  const way = prices.span === 'trip' && Number.isFinite(fig?.parts?.way) ? fig.parts.way : null;
  const WayIcon = wayIcon(fig?.parts?.wayMode || model.way.mode);
  const wayName = t(`settings.sheet.way.${fig?.parts?.wayMode || model.way.mode}`);
  // The whole trip for the group beside it, unless that is what shows.
  const both = prices.span === 'trip' && prices.view === 'group';
  const groupTrip = row && !both && !alone ? model.figure(row, { priceSpan: 'trip', priceView: 'total' }) : null;
  const wayLine = (f) => (f?.missing?.includes('way') ? t(`settingsSum.notKnown.${f.parts.wayMode || model.way.mode}`) : '');

  return (
    <div className="set-step set-prices">
      <h3 className="set-label" id="set-span-label">{t('settings.sheet.spanLabel')}</h3>
      <Segmented
        label={t('settings.sheet.spanLabel')}
        block
        value={prices.span}
        onChange={setSpan}
        options={[
          { value: 'day', label: t('settings.sheet.span.day') },
          { value: 'trip', label: t('settings.sheet.span.trip'), disabled: !prices.canSpan },
        ]}
      />
      <h3 className="set-label" id="set-view-label">{t('settings.sheet.viewLabel')}</h3>
      <Segmented
        label={t('settings.sheet.viewLabel')}
        block
        value={prices.view}
        onChange={setView}
        options={[
          { value: 'person', label: t('settings.sheet.view.person') },
          { value: 'group', label: t('settings.sheet.view.group'), disabled: alone },
        ]}
      />

      {place && (
        <section className="set-example" aria-labelledby="set-example-title">
          <h3 className="set-example-title" id="set-example-title">{t('settings.sheet.example', { place: localName || destCityLabel(place) })}</h3>
          <div className="set-example-top">
            {/* The figure rolls when a switch changes it; the sheet's one
                status line speaks, so the roll stays silent. */}
            <span className="set-example-fig" aria-hidden="true">
              {Number.isFinite(shown) ? <Figure value={shown} mine={touched} still={!touched} /> : t('price.notMeasured')}
            </span>
            <span className="sr-only">{Number.isFinite(shown) ? formatMoney(shown) : t('price.notMeasured')}</span>
            <span className="set-example-unit">
              {prices.span === 'trip' && fig ? t('settings.sheet.unitNights', { unit, nights: nightsText(t, fig.parts.nights) }) : unit}
            </span>
          </div>
          {wayLine(fig) && <p className="set-example-unit">{wayLine(fig)}</p>}
          {Number.isFinite(bed) && Number.isFinite(food) && (
            <>
              <div className="sst-bar set-example-bar" aria-hidden="true">
                <i className="sst-bar-bed" style={{ flexGrow: bed }} />
                <i className="sst-bar-food" style={{ flexGrow: food }} />
                {way != null && <i className="set-bar-way" style={{ flexGrow: way }} />}
              </div>
              <p className="set-example-parts">
                <span><HouseIcon.bed size={16} aria-hidden="true" />{t('settings.sheet.bed', { amount: formatMoney(bed) })}</span>
                <span><HouseIcon.food size={16} aria-hidden="true" />{t('settings.sheet.food', { amount: formatMoney(food) })}</span>
                {way != null && (
                  <span><WayIcon size={16} aria-hidden="true" />{t('settings.sheet.wayPart', { way: wayName, amount: formatMoney(way) })}</span>
                )}
              </p>
            </>
          )}
          {groupTrip && (
            <p className="set-example-trip">
              <span className="set-example-trip-label">{t('settingsSum.prices.tripGroup')}</span>
              <b className="set-example-trip-fig">{Number.isFinite(groupTrip.eur) ? formatMoney(groupTrip.eur) : t('price.notMeasured')}</b>
              <span className="set-example-unit">
                {t('settings.sheet.unitNights', { unit: t(groupTrip.unit[0], groupTrip.unit[1]), nights: nightsText(t, groupTrip.parts.nights) })}
              </span>
              {wayLine(groupTrip) && <span className="set-example-unit set-example-way">{wayLine(groupTrip)}</span>}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
