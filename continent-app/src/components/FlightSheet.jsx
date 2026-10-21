import React from 'react';
import { createPortal } from 'react-dom';
import { laterISO, useToday } from '../lib/dates.js';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { OriginPicker } from './OriginPicker.jsx';
import { Button } from './Button.jsx';
import { CloseIcon } from './Icons.jsx';
import { IconButton } from './ui/IconButton.jsx';

/* Moved out of the retired FirstRunReceipt.jsx (T502, row T484-b): the
 * receipt itself left the app; this sheet stays, opened by the destination
 * page's price card and the trip page's price card on one store key. */

/** "Your flight": where the airport is asked, once (FIRST_RUN_RESULT.md,
 *  "the door opens one sheet"). Prefilled from the remembered airport and the
 *  fare this receipt already holds. A modal with a scrim, a focus trap that
 *  sits above the page's own, and Escape that closes only the sheet.
 *  Exported for the destination page's price card (T429), which opens the
 *  same sheet on the same store key, so a fare typed on either survives. */
export function FlightSheet({ fare, origin, data, setOrigin, from, to, people, onSave, onRemove, onClose, t }) {
  const today = useToday();
  const panelRef = React.useRef(null);
  const closeRef = React.useRef(null);
  const [airline, setAirline] = React.useState(fare?.airline || '');
  const [paid, setPaid] = React.useState(fare?.costTotal ? String(fare.costTotal) : '');
  const [outDate, setOutDate] = React.useState(fare?.outDate || from || '');
  const [retDate, setRetDate] = React.useState(fare?.retDate || to || '');
  // An open airport list keeps its own Escape.
  const skip = React.useCallback(() => !!panelRef.current?.querySelector('.origin-pop'), []);
  useFocusTrap(panelRef, onClose, { initialFocusRef: closeRef, skipEscapeWhen: skip });

  const amount = Math.round(Number(String(paid).replace(',', '.')) * 100) / 100;
  const valid = Number.isFinite(amount) && amount > 0 && amount <= 99999;
  const save = (e) => {
    e.preventDefault();
    if (!valid) return;
    onSave({
      costTotal: amount, airline: airline.trim().slice(0, 60), origin: origin || null,
      outDate: outDate || null, retDate: retDate || null,
    });
  };

  return createPortal(
    <div className="frr-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="frr-sheet" role="dialog" aria-modal="true" aria-labelledby="frr-sheet-h" ref={panelRef}>
        <div className="frr-sheet-head">
          <h2 id="frr-sheet-h">{t('extras.ownFlight')}</h2>
          <IconButton label={t('receipt.sheetClose')} onClick={onClose} ref={closeRef}>
            <CloseIcon size={16} />
          </IconButton>
        </div>
        <form className="frr-sheet-body" onSubmit={save}>
          <div className="frr-field">
            <span className="frr-field-label">{t('receipt.sheetFrom')}</span>
            <OriginPicker data={data} origin={origin} onChangeOrigin={setOrigin} />
          </div>
          <label className="frr-field">
            <span className="frr-field-label">{t('trip.airlineAria')}</span>
            <input
              type="text"
              value={airline}
              maxLength={60}
              placeholder={t('trip.airlinePlaceholder')}
              onChange={(e) => setAirline(e.target.value)}
            />
          </label>
          <label className="frr-field">
            <span className="frr-field-label">{t('receipt.sheetPaid', { people })}</span>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              max="99999"
              step="0.01"
              value={paid}
              placeholder="117.96"
              className="mono"
              onChange={(e) => setPaid(e.target.value)}
            />
          </label>
          <div className="frr-field-pair">
            <label className="frr-field">
              <span className="frr-field-label">{t('wizard.ownFlightOutLabel')}</span>
              <input
                type="date"
                className="mono"
                min={today}
                value={outDate}
                onChange={(e) => setOutDate(e.target.value ? laterISO(e.target.value, today) : '')}
              />
            </label>
            <label className="frr-field">
              <span className="frr-field-label">{t('wizard.ownFlightRetLabel')}</span>
              <input
                type="date"
                className="mono"
                min={laterISO(outDate, today)}
                value={retDate}
                onChange={(e) => setRetDate(e.target.value ? laterISO(e.target.value, laterISO(outDate, today)) : '')}
              />
            </label>
          </div>
          <div className="frr-sheet-actions">
            <Button variant="primary" type="submit" disabled={!valid}>{t('receipt.sheetSave')}</Button>
            {fare && <Button variant="secondary" onClick={onRemove}>{t('trip.removeOwnFare')}</Button>}
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
