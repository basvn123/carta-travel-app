import { MapPinIcon, PersonIcon, CalendarIcon, CarIcon, RouteIcon, BedIcon } from '../../components/Icons.jsx';
import { PlaneIcon } from '../../components/TransportIcons.jsx';
import { cityLabel } from '../../lib/placeName.js';
import { fmtDate } from '../../lib/dates.js';
import { nightsText } from './wizardSteps.js';
import { TRAVEL_MODE_LABEL } from '../../lib/transportLinks.js';

export function wizardRecapChips({
  arrivalDest, booked, dateMode, endDate, flexMonth, flexNights, groupSize, includedIds, months,
  originPlace, selectedCountries, startDate, stayStyle, step, stepName, stepNo, t, totalNights,
  travelValues,
}) {
  const recapChips = [];
  if (step > 1) {
    if (originPlace) {
      recapChips.push({ Icon: MapPinIcon, text: t('wizard.fromPlaceRecap', { place: originPlace.name }), to: stepNo('From') || stepNo('Getting') });
    }
    recapChips.push({
      Icon: PersonIcon,
      text: groupSize === 1 ? t('receipt.onePerson') : t('receipt.nPeople', { n: groupSize }),
      to: stepNo('Booked'),
    });
    if (selectedCountries.length) {
      recapChips.push({
        Icon: MapPinIcon,
        text: selectedCountries.map((c) => c.country).slice(0, 3).join(', ')
          + (selectedCountries.length > 3 ? ` +${selectedCountries.length - 3}` : ''),
        to: stepNo('Where'),
      });
    }
    if (booked.travel && arrivalDest) {
      recapChips.push({ Icon: PlaneIcon, text: t('wizard.arrivingIn', { city: cityLabel(arrivalDest.city) }), to: stepNo('From') });
    }
    if (dateMode === 'exact' && startDate && endDate) {
      recapChips.push({ Icon: CalendarIcon, text: t('plan.dateRange', { a: fmtDate(startDate, true), b: fmtDate(endDate, true) }), to: stepNo('When') });
    } else if (dateMode === 'flex') {
      recapChips.push({ Icon: CalendarIcon, text: `${nightsText(t, flexNights)}, ${flexMonth ? months.find((m) => m.key === flexMonth)?.label || flexMonth : t('wizard.anyMonth')}`, to: stepNo('When') });
    }
    // How they get there is their own answer now, so the recap repeats it back
    // rather than naming an airport Carta chose.
    if (travelValues.out?.mode && !travelValues.out?.guessed) {
      recapChips.push({
        Icon: travelValues.out.mode === 'car' ? CarIcon : RouteIcon,
        text: t(TRAVEL_MODE_LABEL[travelValues.out.mode]),
        to: stepNo('Getting'),
      });
    }
    if ((stepName === 'Stay' || stepName === 'Finish') && stayStyle === 'single') {
      recapChips.push({ Icon: BedIcon, text: t('wizard.oneHomeBaseChip'), to: stepNo('Stay') });
    }
    if (includedIds.length && stepName === 'Finish') {
      recapChips.push({
        Icon: RouteIcon,
        text: t('wizard.staysNights', { stays: t(includedIds.length === 1 ? 'wizard.staysOne' : 'wizard.staysMany', { n: includedIds.length }), nights: nightsText(t, totalNights) }),
        to: stepNo('Stay') || stepNo('Stays') || stepNo('Trips'),
      });
    }
  }
  return { recapChips };
}
