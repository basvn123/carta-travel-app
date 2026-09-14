import React, { useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { usePaywall } from '../hooks/usePaywall.jsx';
import { SparkIcon, UploadIcon } from '../components/Icons.jsx';
import {
  filesToPayload, requestBookingImport, IMPORT_ACCEPT, MAX_IMPORT_FILES,
} from './bookingImport.js';

/**
 * MagicImportZone, the one dropzone behind every "Carta reads it for you"
 * surface: the trip overview's bookings block and the day planner's import
 * drawer. Files (drag, browse), pasted text, or a link; the parse-booking
 * Edge Function does the reading, the PARENT decides what the answer means
 * (fill booking rows, stage activities) via onResult and reports back the
 * counts for the status line.
 *
 * Props:
 *   onResult(result) -> { filled, staged }  fold the parse into the plan
 *   importContext                            trip shape for the server prompt
 *   leadKey                                  i18n key for the lead line
 */
export function MagicImportZone({ onResult, importContext, leadKey = 'extras.importLead' }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState({ phase: 'idle' }); // idle | busy | done | error
  const [dragOver, setDragOver] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const fileRef = useRef(null);
  const paywall = usePaywall();

  // Files, pasted text and links all end up here, so this is the only place
  // the gate has to stand. Reading a booking runs parse-booking, which costs
  // real money per call, which is why it was the one free surface with a bill
  // attached to it.
  const run = async (payloadPart) => {
    if (!paywall.require('import')) { setState({ phase: 'idle' }); return; }
    setState({ phase: 'busy' });
    const res = await requestBookingImport({
      ...payloadPart,
      context: importContext,
      lang,
    });
    if (!res.ok) {
      setState({ phase: 'error', code: res.code });
      return;
    }
    const counts = onResult(res.result) || {};
    setState({ phase: 'done', ...counts, left: res.result?.pass?.plansLeft ?? null });
  };

  const handleFiles = async (fileList) => {
    if (!fileList || !fileList.length || state.phase === 'busy') return;
    setState({ phase: 'busy' });
    const payload = await filesToPayload(fileList);
    if (payload.error) {
      setState({ phase: 'error', code: `file_${payload.error}`, name: payload.name || '' });
      return;
    }
    await run({ files: payload.files, text: '' });
  };

  // Pasting a confirmation email straight onto the zone skips the file dance.
  const handlePaste = (e) => {
    const text = e.clipboardData?.getData('text') || '';
    if (text.trim().length < 40 || state.phase === 'busy') return;
    // A pasted URL is a link, not a document: route it to the URL path.
    e.preventDefault();
    if (/^https?:\/\/\S+$/i.test(text.trim())) {
      setUrlValue(text.trim());
      run({ files: [], text: '', url: text.trim() });
      return;
    }
    run({ files: [], text: text.slice(0, 20000) });
  };

  const handleUrl = () => {
    const u = urlValue.trim();
    if (!/^https?:\/\//i.test(u) || state.phase === 'busy') return;
    run({ files: [], text: '', url: u });
  };

  const errorText = (code, name) => {
    if (code === 'file_type') return t('extras.importBadType', { name });
    if (code === 'file_size' || code === 'file_total') return t('extras.importTooBig', { name: name || '' });
    if (code === 'file_count') return t('extras.importTooMany', { n: MAX_IMPORT_FILES });
    if (code === 'no_auth_config' || code === 'no_ai') return t('extras.importUnavailable');
    if (code === 'auth') return t('extras.importSignIn');
    if (code === 'user_cap' || code === 'global_cap') return t('extras.importCap');
    if (code === 'nothing_found' || code === 'nothing_to_parse') return t('extras.importNothing');
    if (code === 'url_unreachable' || code === 'url_empty' || code === 'url_too_big') return t('extras.importBadUrl');
    return t('extras.importError');
  };

  return (
    <div
      className={`extras-dropzone ${dragOver ? 'over' : ''} ${state.phase === 'busy' ? 'busy' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer?.files);
      }}
      onPaste={handlePaste}
    >
      <input
        ref={fileRef}
        type="file"
        accept={IMPORT_ACCEPT}
        multiple
        hidden
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />
      {state.phase === 'busy' ? (
        <div className="extras-drop-busy">
          <span className="extras-drop-spinner" aria-hidden="true" />
          {t('extras.importBusy')}
        </div>
      ) : (
        <>
          <div className="extras-drop-lead">
            <span className="extras-drop-glyph"><UploadIcon size={15} /><SparkIcon size={10} /></span>
            {t(leadKey)}
          </div>
          <div className="extras-drop-actions">
            <button type="button" className="extras-add-btn" onClick={() => fileRef.current?.click()}>
              {t('extras.importBrowse')}
            </button>
            <span className="extras-drop-hint">{t('extras.importHint')}</span>
          </div>
          {/* A link is a document too: a blog's "one day in Salzburg", a
              shared Google Doc export, a tour page. */}
          <form
            className="extras-drop-url"
            onSubmit={(e) => { e.preventDefault(); handleUrl(); }}
          >
            <input
              type="url"
              value={urlValue}
              placeholder={t('extras.importUrlPlaceholder')}
              aria-label={t('extras.importUrlLabel')}
              onChange={(e) => setUrlValue(e.target.value)}
            />
            <button type="submit" className="extras-add-btn" disabled={!/^https?:\/\//i.test(urlValue.trim())}>
              {t('extras.importUrlGo')}
            </button>
          </form>
          {state.phase === 'done' && (
            <div className="extras-drop-status ok">
              {t('extras.importDone', { filled: state.filled || 0, staged: state.staged || 0 })}
              {state.left != null && ` ${t('extras.importLeft', { left: state.left })}`}
            </div>
          )}
          {state.phase === 'error' && (
            <div className="extras-drop-status err">{errorText(state.code, state.name)}</div>
          )}
        </>
      )}
    </div>
  );
}
