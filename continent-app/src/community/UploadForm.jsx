import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/index.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { CheckIcon, CloseIcon, UploadIcon } from '../components/Icons.jsx';
import { PRIVACY_RADIUS_M } from '../lib/gpxPrivacy.js';
import {
  LICENCES, CREDIT_MAX, PHOTO_MAX_BYTES, TRACK_MAX_BYTES, PHOTO_MIN_EDGE, UPLOAD_MOCK,
  preparePhoto, prepareTrack, submitUpload, uploadProblem,
} from './uploads.js';

const LIC_KEYS = {
  platform: ['upload.licPlatform', 'upload.licPlatformSub'],
  'cc-by-4.0': ['upload.licBy', 'upload.licBySub'],
  'cc-by-sa-4.0': ['upload.licBySa', 'upload.licBySaSub'],
};

/**
 * UploadForm, the door for a photo or a GPS track of one walk (T333).
 *
 * SHAPE. Closed, it is one secondary button inside "Where this comes from",
 * the fold that already names every photo's source, because an upload is one
 * more source. Open, it is a modal dialog with a scrim (carta-design, Modal
 * dialogs), so the form's send button is the one primary in view and the
 * trail page's own GPX button is behind the scrim. The dialog is portalled
 * to the body and runs its own focus trap on top of the page's.
 *
 * ORDER OF THE FORM follows what the uploader has to decide: what it is, the
 * file (prepared on the device at once, with a sentence saying what was
 * removed), who may reuse it, how to credit them, the separate OpenStreetMap
 * permission for a track, and the grant with its warranty. The grant is the
 * last thing ticked so it is read after the choices it covers.
 *
 * Signed out, the dialog says why an account is needed and offers nothing
 * else: the warranty and the indemnity need somebody to give them.
 */
export function UploadForm({ layer, itemId, initialKind = 'photo', openKey = 'upload.open' }) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const signedIn = UPLOAD_MOCK || !!user;
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(initialKind);
  const [prepared, setPrepared] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [preview, setPreview] = useState('');
  const [licence, setLicence] = useState('platform');
  const [credit, setCredit] = useState('');
  const [osm, setOsm] = useState(false);
  const [grant, setGrant] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const fileRef = useRef(null);
  const uid = useId();
  const ids = {
    title: `${uid}-title`,
    file: `${uid}-file`,
    fileHint: `${uid}-file-hint`,
    credit: `${uid}-credit`,
    creditHint: `${uid}-credit-hint`,
    osmHint: `${uid}-osm-hint`,
    err: `${uid}-err`,
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    setErr('');
    if (sent) {
      setSent(false);
      setPrepared(null);
      setGrant(false);
      setOsm(false);
    }
  };
  useFocusTrap(dialogRef, close, { initialFocusRef: closeRef, enabled: open });

  // The account's own name is the likeliest credit. Filled in when the
  // dialog opens with the field empty, never while the uploader is typing.
  const metaName = user?.user_metadata?.full_name || '';
  const openDialog = () => {
    if (!credit && metaName) setCredit(metaName.slice(0, CREDIT_MAX));
    setOpen(true);
  };

  // One object URL for the prepared photo, released when it changes.
  useEffect(() => {
    if (!prepared || prepared.kind !== 'photo') { setPreview(''); return undefined; }
    const url = URL.createObjectURL(prepared.blob);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [prepared]);

  const nf = (v, d = 0) => new Intl.NumberFormat(lang, { maximumFractionDigits: d }).format(v);
  const size = (b) => (b >= 1024 * 1024 ? `${nf(b / (1024 * 1024), 1)} MB` : `${nf(Math.max(1, Math.round(b / 1024)))} KB`);

  const errFor = (code) => {
    switch (code) {
      case 'no_file': return t('upload.errNoFile');
      case 'too_big': return t('upload.errTooBig', { mb: (kind === 'photo' ? PHOTO_MAX_BYTES : TRACK_MAX_BYTES) / (1024 * 1024) });
      case 'too_small': return t('upload.errTooSmall', { px: PHOTO_MIN_EDGE });
      case 'unreadable':
      case 'unsupported':
      case 'corrupt': return t('upload.errUnreadable');
      case 'not_clean': return t('upload.errNotClean');
      case 'not_gpx': return t('upload.errNotGpx');
      case 'no_points': return t('upload.errNoPoints');
      case 'too_short': return t('upload.errTooShort');
      case 'bad_credit': return t('upload.errCredit', { max: CREDIT_MAX });
      case 'no_grant': return t('upload.errGrant');
      case 'too_many': return t('upload.errTooMany');
      case 'not_signed_in': return t('upload.errSignedOut');
      default: return t('upload.errGeneric');
    }
  };

  const pickKind = (k) => {
    if (k === kind) return;
    setKind(k);
    setPrepared(null);
    setErr('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    setPrepared(null);
    setErr('');
    if (!file) return;
    setPreparing(true);
    try {
      setPrepared(kind === 'photo' ? await preparePhoto(file) : await prepareTrack(file));
    } catch (x) {
      setErr(errFor(x?.code));
      if (fileRef.current) fileRef.current.value = '';
    }
    setPreparing(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy || preparing) return;
    const problem = uploadProblem({ prepared, licence, credit, grant });
    if (problem) { setErr(errFor(problem)); return; }
    setBusy(true);
    setErr('');
    try {
      await submitUpload({ layer, itemId, prepared, licence, credit, osm, grant });
      setSent(true);
    } catch (x) {
      setErr(errFor(x?.code));
    }
    setBusy(false);
  };

  const cleanLine = () => {
    if (!prepared) return '';
    if (prepared.kind === 'photo') {
      return t(prepared.hadLocation ? 'upload.photoCleanGps' : 'upload.photoClean', { size: size(prepared.bytes) });
    }
    return t('upload.trackClean', { m: nf(PRIVACY_RADIUS_M), kept: nf(prepared.kept), total: nf(prepared.total) });
  };

  const body = () => {
    if (!signedIn) {
      return (
        <>
          <p className="upl-lede">{t('upload.signedOut')}</p>
          <div className="upl-actions">
            <button type="button" className="upl-btn" onClick={close}>{t('upload.close')}</button>
          </div>
        </>
      );
    }
    if (sent) {
      return (
        <>
          <div className="upl-done" role="status">
            <CheckIcon size={16} />
            <p>{t('upload.sent')}</p>
          </div>
          <div className="upl-actions">
            <button type="button" className="upl-btn" onClick={close}>{t('upload.close')}</button>
          </div>
        </>
      );
    }
    return (
      <form className="upl-form" onSubmit={submit} noValidate>
        <p className="upl-lede">{t('upload.lede')}</p>

        <fieldset className="upl-set">
          <legend className="upl-legend">{t('upload.kindLegend')}</legend>
          <div className="upl-kinds">
            {['photo', 'track'].map((k) => (
              <label key={k} className={`upl-kind ${kind === k ? 'is-on' : ''}`}>
                <input type="radio" name={`${uid}-kind`} value={k} checked={kind === k} onChange={() => pickKind(k)} />
                <span>{t(k === 'photo' ? 'upload.kindPhoto' : 'upload.kindTrack')}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="upl-field">
          <label className="upl-label" htmlFor={ids.file}>
            {t(kind === 'photo' ? 'upload.filePhoto' : 'upload.fileTrack')}
          </label>
          <input
            ref={fileRef}
            id={ids.file}
            className="upl-file"
            type="file"
            accept={kind === 'photo' ? 'image/jpeg,image/png' : '.gpx,application/gpx+xml'}
            aria-describedby={ids.fileHint}
            onChange={onFile}
            disabled={preparing || busy}
          />
          <p className="upl-hint" id={ids.fileHint}>
            {t(kind === 'photo' ? 'upload.photoHint' : 'upload.trackHint', { px: PHOTO_MIN_EDGE })}
          </p>
          <p className="upl-status" role="status">
            {preparing ? t('upload.working') : cleanLine()}
          </p>
          {preview && <img className="upl-preview" src={preview} alt="" />}
        </div>

        <fieldset className="upl-set">
          <legend className="upl-legend">{t('upload.licenceLegend')}</legend>
          {LICENCES.map((l) => (
            <label key={l} className={`upl-lic ${licence === l ? 'is-on' : ''}`}>
              <input type="radio" name={`${uid}-lic`} value={l} checked={licence === l} onChange={() => setLicence(l)} />
              <span className="upl-lic-text">
                <span className="upl-lic-name">{t(LIC_KEYS[l][0])}</span>
                <span className="upl-lic-sub">{t(LIC_KEYS[l][1])}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="upl-field">
          <label className="upl-label" htmlFor={ids.credit}>{t('upload.creditLabel')}</label>
          <input
            id={ids.credit}
            className="upl-input"
            type="text"
            autoComplete="name"
            maxLength={CREDIT_MAX}
            aria-describedby={ids.creditHint}
            value={credit}
            onChange={(e) => { setCredit(e.target.value); setErr(''); }}
          />
          <p className="upl-hint" id={ids.creditHint}>{t('upload.creditHint')}</p>
        </div>

        {kind === 'track' && (
          <div className="upl-tick-wrap">
            <label className="upl-tick">
              <input type="checkbox" checked={osm} onChange={(e) => setOsm(e.target.checked)} aria-describedby={ids.osmHint} />
              <span>{t('upload.osmTick')}</span>
            </label>
            <p className="upl-hint" id={ids.osmHint}>{t('upload.osmHint')}</p>
          </div>
        )}

        <div className="upl-tick-wrap">
          <label className="upl-tick">
            <input type="checkbox" checked={grant} onChange={(e) => { setGrant(e.target.checked); setErr(''); }} />
            <span>{t('upload.grantTick')}</span>
          </label>
          <a className="upl-terms" href="?legal=terms" target="_blank" rel="noopener noreferrer">{t('upload.readTerms')}</a>
        </div>

        {err && <p className="upl-error" id={ids.err} role="alert">{err}</p>}

        <div className="upl-actions">
          <button type="submit" className="upl-send" disabled={busy || preparing}>
            {busy ? t('account.pleaseWait') : t('upload.send')}
          </button>
          <button type="button" className="upl-btn" onClick={close} disabled={busy}>{t('upload.cancel')}</button>
        </div>
      </form>
    );
  };

  return (
    <>
      <button type="button" className="upl-open" onClick={openDialog} aria-haspopup="dialog">
        <UploadIcon size={15} />
        <span>{t(openKey)}</span>
      </button>
      {open && createPortal(
        <div className="upl-scrim" onClick={close}>
          <div
            className="upl-dialog"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={ids.title}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="upl-head">
              <h2 className="upl-title" id={ids.title}>{t('upload.title')}</h2>
              <button ref={closeRef} type="button" className="upl-x" onClick={close} aria-label={t('upload.close')}>
                <CloseIcon size={15} />
              </button>
            </div>
            {body()}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
