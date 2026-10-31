import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, Field, Switch } from '../components/ui/index.js';
import { cleanPayLink } from '../auth/groupExpenses.js';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { useTogether, togetherActions } from './useTogether.js';
import { Block } from './parts.jsx';

/**
 * "Friends see" (T932, migration 056): one switch per kind of sharing, read
 * by the friend projections on the server. Trips stay chosen one by one in
 * My trips, as since 011. Saves are off until switched on. What a trip cost
 * is never shown to friends, so there is no switch for it (owner, T937).
 */
const ROWS = [
  ['showCountries', 'tg.seeCountries'],
  ['showSaves', 'tg.seeSaves'],
  ['showTips', 'tg.seeTips'],
  ['showMeet', 'tg.plansMeet'],
];

export function FriendsSee({ onOpenSaved }) {
  const { t } = useI18n();
  const s = useTogether();
  const [error, setError] = useState('');
  const flip = (key, on) => {
    setError('');
    togetherActions.setVisibility({ [key]: on }).catch(() => setError(t('friends.unavailable')));
  };
  return (
    <Block id="tg-see-h" title={t('tg.friendsSee')}>
      <div className="tg-toggles">
        <div className="tg-trow">
          <b>{t('tg.seeTrips')}</b>
          {onOpenSaved && (
            <Button variant="quiet" size="sm" iconEnd={<ChevronRightIcon size={16} />} onClick={onOpenSaved}>{t('tg.perTrip')}</Button>
          )}
        </div>
        {ROWS.map(([key, label]) => (
          <Switch key={key} label={t(label)} checked={!!s.visibility[key]} onChange={(on) => flip(key, on)} />
        ))}
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
    </Block>
  );
}

/**
 * Your payment link for group trips (T940, migration 058): an https address
 * (Tikkie, bunq.me, a Revolut link) shown only to the members of your group
 * trips, on Settle up, where they owe you. Not drawn before 058.
 */
export function PayLink() {
  const { t } = useI18n();
  const s = useTogether();
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  if (s.payLinkMissing) return null;
  const value = draft ?? s.payLink ?? '';
  const save = (e) => {
    e.preventDefault();
    const url = cleanPayLink(value);
    if (url === null) { setError(t('tg2.payLinkBad')); return; }
    setError('');
    togetherActions.setPayLink(url)
      .then(() => { setDraft(null); setSaved(true); })
      .catch(() => setError(t('friends.unavailable')));
  };
  return (
    <Block id="tg-paylink-h" title={t('tg2.payLink')}>
      <form className="tg-new" onSubmit={save}>
        <Field label={t('tg2.payLinkLabel')} type="url" inputMode="url" value={value} maxLength={300}
          error={error || undefined} onChange={(e) => { setDraft(e.target.value); setSaved(false); }} />
        <div><Button type="submit" variant="secondary" size="sm" disabled={draft === null}>{t('tg.save')}</Button></div>
        {saved && <p className="tg-muted" role="status">{t('tg2.payLinkSaved')}</p>}
      </form>
    </Block>
  );
}

/** Your link as a QR code, drawn by qrcode-generator, loaded on first use. */
export function QrCode({ url, label }) {
  const [cells, setCells] = useState(null);
  useEffect(() => {
    let live = true;
    if (!url) return undefined;
    import('qrcode-generator').then((m) => {
      const make = m.default || m;
      const code = make(0, 'M');
      code.addData(url);
      code.make();
      const n = code.getModuleCount();
      const rects = [];
      for (let r = 0; r < n; r += 1) {
        let c = 0;
        while (c < n) {
          if (!code.isDark(r, c)) { c += 1; continue; }
          let e = c;
          while (e < n && code.isDark(r, e)) e += 1;
          rects.push([c, r, e - c]);
          c = e;
        }
      }
      if (live) setCells({ n, rects });
    }).catch(() => { if (live) setCells(false); });
    return () => { live = false; };
  }, [url]);
  if (cells === false) return null;
  if (!cells) return <span className="tg-qr-wait" aria-hidden="true" />;
  return (
    <span className="tg-qr">
      <svg viewBox={`-1 -1 ${cells.n + 2} ${cells.n + 2}`} role="img" aria-label={label} shapeRendering="crispEdges">
        {cells.rects.map(([x, y, w]) => <rect key={`${x}:${y}`} x={x} y={y} width={w + 0.02} height={1.02} />)}
      </svg>
    </span>
  );
}
