import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, DialogSheet } from '../components/ui/index.js';

/**
 * S15 (G12 plan rethink, decision §3.2): "Plan a trip here" while a trip is
 * open. Before, a second wizard opened as a modal over the trip (E12); now
 * one short choice: add this place to the open trip (it becomes a stop, the
 * trip page's own Add stop) or start a new trip from it. Closing does
 * neither.
 *
 *   tripName   the open trip's name ("Lissabon")
 *   onAdd      App: a town becomes a stop; a country without a town opens
 *              the trip page's Add stop on that country to pick the town
 */
export function PlanHereChoice({ tripName = '', onAdd, onNew, onClose }) {
  const { t } = useI18n();
  return (
    <DialogSheet titleId="plan-here-h" title={t('planHere.title')} className="plan-here" onClose={onClose} closeLabel={t('receipt.sheetClose')}>
      <div className="plan-here-body">
        <Button variant="primary" block onClick={onAdd}>
          {tripName ? t('planHere.addTo', { trip: tripName }) : t('planHere.addOpen')}
        </Button>
        <Button variant="secondary" block onClick={onNew}>{t('planHere.new')}</Button>
      </div>
    </DialogSheet>
  );
}
