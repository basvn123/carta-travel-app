import React, { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip } from '../../components/ui/index.js';
import { useTogether, togetherActions } from '../useTogether.js';
import { nameOf } from '../parts.jsx';

/** A new kring (G16): a name, then the friends to ask, then create. The
 *  friend picker is NewGroup's (GroupTrips.jsx). Only accepted friends are
 *  offered, which is also the rule in 078's insert policy. */
export function NewCircle({ back, headRef, onCreated }) {
  const { t } = useI18n();
  const s = useTogether();
  const friends = s.links.filter((l) => l.kind === 'friend');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState(() => new Set());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setPicked((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const create = async (e) => {
    e.preventDefault();
    if (!name.trim() || !picked.size) return;
    setBusy(true);
    try { onCreated(await togetherActions.createCircle(name.trim(), [...picked])); } catch { setError(t('friends.unavailable')); } finally { setBusy(false); }
  };
  return (
    <div className="tg-page vr-page">
      <div className="vr-head is-sub">{back}<h1 className="vr-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('vr.newCircle')}</h1></div>
      <form className="vr-form" onSubmit={create}>
        <label className="vr-field">
          <span>{t('vr.circleName')}</span>
          <input type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="vr-pick">
          <legend>{t('vr.pickFriends')}</legend>
          <div className="tg-pick">
            {friends.map((l) => (
              <Chip key={l.userId} selected={picked.has(l.userId)} onClick={() => toggle(l.userId)}>{nameOf(l)}</Chip>
            ))}
          </div>
        </fieldset>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <div><Button type="submit" variant="primary" loading={busy} disabled={!name.trim() || !picked.size}>{t('tg.create')}</Button></div>
      </form>
    </div>
  );
}
