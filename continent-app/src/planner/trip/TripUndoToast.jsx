import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { CloseIcon } from '../../components/Icons.jsx';
import { UNDO_MS } from '../../auth/mytrips/parts.jsx';

const KEY = {
  stopRemoved: 'tp.undo.removed', stopAdded: 'tp.undo.added', stopsMoved: 'tp.undo.moved',
  stopSwapped: 'tp.undo.swapped', nights: 'tp.undo.nights', balanced: 'tp.undo.dates', dates: 'tp.undo.dates',
  people: 'tp.undo.people', from: 'tp.undo.from', other: 'tp.undo.other',
};

/** The message for a change, or '' for one that needs none (the name). */
function changeText(t, change, cityOf) {
  if (!change || !KEY[change.kind]) return '';
  return t(KEY[change.kind], { city: change.id ? cityOf(change.id) : '' });
}

/**
 * The trip page's Undo message (T835, carta-design "Bottom slot and undo"):
 * what just changed and Undo, for six seconds, in the shell's one bottom
 * slot. A `note` (what a changed setting did, T731) replaces the change's
 * own words. Undo here and the lasting Undo button are the same step.
 */
export function TripUndoToast({ change, note = '', cityOf, onUndo, onClose }) {
  const { t } = useI18n();
  const text = note || changeText(t, change, cityOf);
  useEffect(() => {
    if (!text) return undefined;
    const id = window.setTimeout(onClose, UNDO_MS);
    return () => window.clearTimeout(id);
  }, [change?.seq, change?.at, text, onClose]);
  if (!text) return null;
  const node = (
    <div className="undo-toast tpg-undo" role="status">
      <span className="undo-toast-text">{text}</span>
      {change && onUndo && <Button size="sm" onClick={onUndo}>{t('saved.undo')}</Button>}
      <IconButton label={t('a11y.close')} onClick={onClose}><CloseIcon size={16} /></IconButton>
    </div>
  );
  const slot = typeof document !== 'undefined' ? document.querySelector('.bottom-slot') : null;
  return slot ? createPortal(node, slot) : node;
}
