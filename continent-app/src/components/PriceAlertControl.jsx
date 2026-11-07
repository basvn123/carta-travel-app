import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { Button, Segmented } from './ui/index.js';
import {
  alertsOn, listAlerts, saveAlert, deleteAlert, SHARES, DEFAULT_SHARE,
} from '../lib/priceAlerts.js';
import '../styles/97-price-alert.css';

/**
 * The save-alert control (T1205, ROADMAP I17), under the destination page's
 * price card. A signed-in traveller picks the share the total must fall by
 * (5, 10 or 20 percent), ticks the consent box (never pre-ticked) and saves.
 * The first save asks the price-alerts function for the one confirmation
 * email of the double opt-in; the control says so. An alert that exists
 * shows its share and a Remove.
 *
 * Hidden when the flag is off (lib/priceAlerts alertsOn), when nobody is
 * signed in, when the card cannot describe the alert (spec null) and when
 * migration 073 is missing.
 *
 *   refId   'dest:LIS'
 *   label   the place's name, the email's subject
 *   spec    lib/priceAlerts placeSpec(...)
 */
export function PriceAlertControl({ refId, label, spec, kind = 'place' }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const on = alertsOn() && !!user?.id && !!spec;
  const uid = React.useId();
  const [state, setState] = React.useState('idle'); // idle | open | busy | missing
  const [existing, setExisting] = React.useState(null);
  const [share, setShare] = React.useState(DEFAULT_SHARE);
  const [consent, setConsent] = React.useState(false);
  const [msg, setMsg] = React.useState('');

  React.useEffect(() => {
    if (!on) return undefined;
    let live = true;
    listAlerts(user.id).then((res) => {
      if (!live) return;
      if (res.state === 'missing') { setState('missing'); return; }
      if (res.state === 'ok') {
        setExisting(res.alerts.find((a) => a.kind === kind && a.ref === refId && !a.fired_at) || null);
      }
    });
    return () => { live = false; };
  }, [on, user?.id, kind, refId]);

  if (!on || state === 'missing') return null;

  const pct = (s) => new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(Number(s));

  const save = async () => {
    setState('busy');
    const res = await saveAlert({ kind, ref: refId, label, spec, share, lang });
    if (res.state === 'missing') { setState('missing'); return; }
    if (res.state !== 'ok') { setState('open'); setMsg(t('alerts.error')); return; }
    setExisting({ id: res.id, kind, ref: refId, drop_share: share });
    setConsent(false);
    setState('idle');
    setMsg(res.confirmed ? t('alerts.saved', { pct: pct(share) })
      : res.mailed ? t('alerts.confirmSent') : t('alerts.confirmPending'));
  };

  const remove = async () => {
    setState('busy');
    const res = await deleteAlert(existing.id);
    setState('idle');
    if (res.state === 'ok') { setExisting(null); setMsg(t('alerts.removed')); } else setMsg(t('alerts.error'));
  };

  return (
    <section className="palert" aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`} className="palert-title">{t('alerts.title')}</h3>
      {existing && state !== 'open' ? (
        <div className="palert-row">
          <p className="palert-text">{t('alerts.active', { pct: pct(existing.drop_share) })}</p>
          <Button variant="quiet" size="sm" onClick={remove} loading={state === 'busy'}>{t('alerts.remove')}</Button>
        </div>
      ) : state === 'idle' ? (
        <Button variant="secondary" size="sm" onClick={() => { setMsg(''); setState('open'); }}>{t('alerts.cta')}</Button>
      ) : (
        <div className="palert-form">
          <p className="palert-text">{t('alerts.lead')}</p>
          <Segmented
            label={t('alerts.shareLabel')}
            size="sm"
            value={share}
            onChange={setShare}
            options={SHARES.map((s) => ({ value: s, label: pct(s) }))}
          />
          <label className="palert-consent" htmlFor={`${uid}-c`}>
            <input id={`${uid}-c`} type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>{t('alerts.consent')}</span>
          </label>
          <p className="palert-note">{t('alerts.note')}</p>
          <div className="palert-row">
            <Button variant="primary" size="sm" onClick={save} disabled={!consent} loading={state === 'busy'}>{t('alerts.save')}</Button>
            <Button variant="quiet" size="sm" onClick={() => setState('idle')}>{t('alerts.cancel')}</Button>
          </div>
        </div>
      )}
      {msg && <p className="palert-msg" role="status">{msg}</p>}
    </section>
  );
}
