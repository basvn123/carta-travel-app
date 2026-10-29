import React, { useState } from 'react';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { useSettings } from '../../components/SettingsLine.jsx';
import { FromPanel, fromPoint } from '../../components/FromPicker.jsx';
import { DateField } from '../../components/DateField.jsx';
import { Button, Segmented } from '../../components/ui/index.js';
import { PartyEditor } from '../PartyEditor.jsx';
import { useBcp47 } from '../flow/flowHooks.js';
import { addDaysUTC, nightsBetween } from '../../lib/tripDates.js';
import { datesOptions } from '../../lib/tripBalance.js';
import { Balance } from './Balance.jsx';

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The trip's dates: a start and an end on one calendar, then, when the
 *  stops no longer fill them, where the difference goes. */
function DatesBody({ trip, onSave, quoteDelta }) {
  const { t } = useI18n();
  const app = useSettings();
  const bcp47 = useBcp47();
  const [start, setStart] = useState(trip.tripStart || '');
  const [end, setEnd] = useState(trip.tripEnd || '');
  const [pickEnd, setPickEnd] = useState('start');
  const [choice, setChoice] = useState(0);
  const min = app?.dateBounds?.min || todayISO();
  const max = app?.dateBounds?.max;
  const short = (iso) => (iso ? new Intl.DateTimeFormat(bcp47, { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`)) : t('pf.when.set'));
  const length = nightsBetween(start, end) || trip.plannedNights || 1;
  const pick = (iso) => {
    if (pickEnd === 'start') {
      setStart(iso);
      setEnd(addDaysUTC(iso, length));
      setPickEnd('end');
    } else if (start && iso > start) {
      setEnd(iso);
    }
    setChoice(0);
  };
  const options = datesOptions(trip.stops, start, end);
  const planned = trip.plannedNights;
  const windowN = nightsBetween(start, end);
  const nights = (n) => t(n === 1 ? 'plan.nightsOne' : 'plan.nightsMany', { n });
  const deltaOf = (o) => quoteDelta?.({
    tripStart: start,
    tripEnd: o.kind === 'keep' ? o.end : end,
    stops: o.kind === 'stop' ? trip.stops.map((s, i) => (i === o.index ? { ...s, nights: o.nights } : s)) : trip.stops,
  });
  return (
    <div className="tpe">
      <Segmented
        block
        size="sm"
        label={t('tp.ed.datesTitle')}
        value={pickEnd}
        onChange={setPickEnd}
        options={[
          { value: 'start', label: t('pf.when.startOn', { date: short(start) }) },
          { value: 'end', label: t('pf.when.endOn', { date: short(end) }) },
        ]}
      />
      <DateField
        inline
        value={pickEnd === 'start' ? start : end}
        rangeStart={start || null}
        rangeEnd={end || null}
        min={pickEnd === 'end' && start ? addDaysUTC(start, 1) : min}
        max={max}
        onChange={pick}
      />
      {options.length > 0 && (
        <Balance
          question={t('tp.bal.datesQ', { window: nights(windowN), planned: nights(planned) })}
          options={options}
          more={windowN < planned}
          stops={trip.stopDetails}
          value={choice}
          onPick={setChoice}
          delta={quoteDelta ? deltaOf : null}
        />
      )}
      <Button variant="primary" block disabled={!start || !end} onClick={() => onSave({ start, end, option: options[choice] || null })}>
        {t('tp.ed.save')}
      </Button>
    </div>
  );
}

function PeopleBody({ trip, onSave }) {
  const { t } = useI18n();
  const [party, setParty] = useState(trip.party);
  return (
    <div className="tpe">
      <PartyEditor value={party} onChange={setParty} />
      <Button variant="primary" block onClick={() => onSave(party)}>{t('tp.ed.save')}</Button>
    </div>
  );
}

function FromBody({ onSave }) {
  const { t } = useI18n();
  const app = useSettings();
  const [picked, setPicked] = useState(null);
  const current = picked || fromPoint(app);
  return (
    <div className="tpe">
      <div className="pf-from">
        <FromPanel data={app?.data} current={current} autoFocus={false} onPick={setPicked} />
      </div>
      <Button variant="primary" block disabled={!picked} onClick={() => onSave(picked)}>{t('tp.ed.save')}</Button>
    </div>
  );
}

const TITLE = { dates: 'tp.ed.datesTitle', people: 'tp.ed.peopleTitle', from: 'tp.ed.fromTitle' };

/**
 * A chip's own editor (T836, owner board panels 1 and 2): Dates, People or
 * From, hung under the chip from 1024 px and a sheet below it (SheetShell
 * does both). Save hands the answer up; the trip page applies it, so the
 * change is one Undo step.
 *
 *   kind       'dates' | 'people' | 'from'
 *   trip       { tripStart, tripEnd, stops, stopDetails, plannedNights, party }
 *   onSave     dates: { start, end, option }, people: party, from: a point
 */
export function ChipEditor({ kind, anchorRef, trip, onSave, onClose, quoteDelta = null }) {
  const { t } = useI18n();
  const save = (v) => { onSave(v); onClose(); };
  return (
    <SheetShell title={t(TITLE[kind])} onClose={onClose} anchorRef={anchorRef} width={kind === 'dates' ? 400 : 360}
      className={`tpe-sheet is-${kind}`} labelId={`tpe-${kind}-title`}>
      {kind === 'dates' && <DatesBody trip={trip} onSave={save} quoteDelta={quoteDelta} />}
      {kind === 'people' && <PeopleBody trip={trip} onSave={save} />}
      {kind === 'from' && <FromBody onSave={save} />}
    </SheetShell>
  );
}
