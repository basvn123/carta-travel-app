import React, { useRef } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { useI18n } from '../i18n/index.jsx';
import { backKey } from '../lib/passMoments.js';
import { CheckIcon } from './Icons.jsx';
import { Button } from './ui/index.js';
import '../styles/71-pass.css';

/**
 * The way back from Stripe (W1-L1, J-5, EN-10): shown once when the pass has
 * landed, in the sheet the buyer left, saying what the gate that blocked
 * them is now open. The page behind it is the one they left (the checkout
 * returns to it), so the button they pressed is there to press again.
 */
export function PassBack({ reason = '', onClose }) {
  const { t } = useI18n();
  const cardRef = useRef(null);
  const doneRef = useRef(null);
  useFocusTrap(cardRef, onClose, { initialFocusRef: doneRef });
  return (
    <div className="pass-overlay shell-scrim" onClick={onClose}>
      <div className="pass-sheet shell-dialog" ref={cardRef} role="dialog" aria-modal="true" aria-labelledby="pass-back-title" onClick={(e) => e.stopPropagation()}>
        <div className="pass-head">
          <h2 className="pass-title" id="pass-back-title"><CheckIcon size={18} /> {t('pass.backTitle')}</h2>
        </div>
        <p className="pass-sub">{t(backKey(reason))}</p>
        <Button ref={doneRef} variant="primary" block onClick={onClose}>{t('pass.backDone')}</Button>
      </div>
    </div>
  );
}
