import React, { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button } from '../components/ui/index.js';
import { HouseIcon } from '../components/HouseIcons.jsx';
import { useTogether, togetherActions } from './useTogether.js';
import { openVrienden } from './openVrienden.js';

/**
 * "Stel voor in kring" on a place (G16, build-spec block 6): shown only when
 * you are in a kring. One kring proposes at once; with several, the kringen
 * are offered as buttons. The note after it opens that kring's vote.
 */
export function ProposeInCircle({ destId }) {
  const { t } = useI18n();
  const s = useTogether();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(null);
  const circles = (s.circles || []).filter((c) => c.myStatus === 'joined');
  if (!s.signedIn || s.circlesMissing || !circles.length || !destId) return null;
  const propose = (c) => {
    togetherActions.propose(c.id, destId).then(() => { setDone(c); setOpen(false); }).catch(() => {});
  };
  return (
    <div className="vr-propose-in">
      {done ? (
        <Button variant="quiet" className="vr-lnk" onClick={() => openVrienden('circlevote', done.id)}>{t('vr.proposed', { name: done.name })}</Button>
      ) : circles.length === 1 ? (
        <Button variant="secondary" iconStart={<HouseIcon.people size={18} />} onClick={() => propose(circles[0])}>{t('vr.proposeIn')}</Button>
      ) : (
        <>
          <Button variant="secondary" iconStart={<HouseIcon.people size={18} />} aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t('vr.proposeIn')}</Button>
          {open && (
            <span className="vr-propose-list">
              {circles.map((c) => <Button key={c.id} variant="quiet" onClick={() => propose(c)}>{c.name}</Button>)}
            </span>
          )}
        </>
      )}
    </div>
  );
}
