import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { PlusIcon, TrashIcon, ReceiptIcon, TicketIcon } from '../../components/Icons.jsx';
import { useUndo, UndoToast } from '../DayPlanPanel.jsx';
import {
  listFiles, addFiles, readFile, deleteFile, filesAvailable, fmtBytes, MAX_FILE_BYTES,
} from '../dayFileStore.js';

const ACCEPT = 'application/pdf,image/*';

/** An image document earns a real thumbnail; a PDF or anything else its mark. */
function Thumb({ id, type, name }) {
  const [url, setUrl] = useState('');
  const isImage = (type || '').startsWith('image/');
  useEffect(() => {
    if (!isImage) return undefined;
    let dead = false;
    let made = '';
    readFile(id).then((blob) => {
      if (dead || !blob) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [id, isImage]);
  if (url) return <img className="tnt-thumb" src={url} alt="" loading="lazy" decoding="async" />;
  const pdf = (type || '').includes('pdf') || (name || '').toLowerCase().endsWith('.pdf');
  return (
    <span className={`tnt-thumb is-mark${pdf ? ' is-pdf' : ''}`} aria-hidden="true">
      {pdf ? <ReceiptIcon size={18} /> : <TicketIcon size={18} />}
      {pdf && <small>PDF</small>}
    </span>
  );
}

/**
 * The trip page's Notes tab (T1015, owner: "it doesn't work; simple, clean,
 * with uploaded documents"). After a research round (TripIt's Documents
 * section with one +, Google Wallet's private on-device documents, the
 * Rick Steves and Fodor's threads on what travellers keep: bookings, a
 * passport scan, insurance, tickets, emergency contacts, addresses):
 *
 *   Notes      one field that saves as it is typed, with the plan's synced
 *              extras (small, useful on every device)
 *   Documents  one Add (on a phone it offers the camera or a file), then a
 *              row per file: its thumbnail or PDF mark, its name, its size;
 *              a tap opens it, the bin removes it (with Undo). The files stay
 *              in this browser (dayFileStore: IndexedDB, never uploaded), and
 *              one quiet line says so.
 *
 *   planId     the plan the files belong to
 *   notes      the trip's notes text;  onNotes(text)
 */
export function TripNotes({ planId, notes = '', onNotes }) {
  const { t } = useI18n();
  const [files, setFiles] = useState([]);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState('');
  const [hidden, setHidden] = useState(() => new Set());
  const inputRef = useRef(null);
  const { pending, offer, undo } = useUndo();

  const refresh = useCallback(async () => { setFiles(await listFiles(planId)); }, [planId]);
  useEffect(() => {
    let dead = false;
    filesAvailable().then((ok) => { if (!dead) setReady(ok); });
    refresh();
    return () => { dead = true; };
  }, [refresh]);

  const take = async (list) => {
    if (!list?.length || busy) return;
    setBusy(true);
    setProblem('');
    const { rejected } = await addFiles(planId, list);
    if (rejected.length) {
      const r = rejected[0];
      setProblem(r.code === 'size'
        ? t('dayws.fileTooBig', { name: r.name, mb: Math.round(MAX_FILE_BYTES / (1024 * 1024)) })
        : r.code === 'full' ? t('dayws.fileFull') : t('dayws.fileFailed', { name: r.name }));
    }
    await refresh();
    setBusy(false);
  };

  const open = async (f) => {
    const blob = await readFile(f.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank', 'noopener');
    if (!w) {
      // A blocked pop-up still gets the file: it saves instead.
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const drop = (f) => {
    const unhide = () => setHidden((s) => { const n = new Set(s); n.delete(f.id); return n; });
    setHidden((s) => new Set(s).add(f.id));
    offer(t('dayws.fileDeleted'), unhide, async () => { await deleteFile(f.id); await refresh(); unhide(); });
  };
  const shown = files.filter((f) => !hidden.has(f.id));

  return (
    <div className="tnt">
      <section className="tnt-block" aria-labelledby="tnt-notes-h">
        <h2 className="tnt-h" id="tnt-notes-h">{t('tp.notes.title')}</h2>
        <textarea
          className="tnt-notes"
          value={notes}
          onChange={(e) => onNotes?.(e.target.value)}
          placeholder={t('tp.notes.hint')}
          rows={5}
          aria-labelledby="tnt-notes-h"
        />
      </section>

      <section
        className={`tnt-block tnt-docs${over ? ' is-over' : ''}`}
        aria-labelledby="tnt-docs-h"
        onDragOver={ready ? (e) => { e.preventDefault(); setOver(true); } : undefined}
        onDragLeave={() => setOver(false)}
        onDrop={ready ? (e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); } : undefined}
      >
        <div className="tnt-head">
          <h2 className="tnt-h" id="tnt-docs-h">
            {t('tp.docs.title')}
            {shown.length > 0 && <span className="tnt-count">{shown.length}</span>}
          </h2>
          {ready && (
            <Button variant="primary" size="sm" className="tnt-add" iconStart={<PlusIcon size={16} />}
              onClick={() => inputRef.current?.click()} disabled={busy}>
              {t('tp.docs.add')}
            </Button>
          )}
          <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden
            onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
        </div>

        {!ready && <p className="tnt-quiet">{t('dayws.filesUnavailable')}</p>}
        {problem && <p className="tnt-problem" role="alert">{problem}</p>}

        {ready && shown.length === 0 && (
          <button type="button" className="tnt-empty" onClick={() => inputRef.current?.click()} disabled={busy}>
            <span className="tnt-empty-ic" aria-hidden="true"><PlusIcon size={20} /></span>
            <span className="tnt-empty-text">
              <b>{t('tp.docs.emptyTitle')}</b>
            </span>
          </button>
        )}

        {shown.length > 0 && (
          <ul className="tnt-list">
            {shown.map((f) => (
              <li key={f.id} className="tnt-row">
                <button type="button" className="tnt-open" onClick={() => open(f)} aria-label={t('tp.docs.open', { name: f.name })}>
                  <Thumb id={f.id} type={f.type} name={f.name} />
                  <span className="tnt-info">
                    <span className="tnt-name">{f.name}</span>
                    <span className="tnt-meta">{fmtBytes(f.size)}</span>
                  </span>
                </button>
                <IconButton tone="plain" className="tnt-del" label={t('tp.docs.delete', { name: f.name })} onClick={() => drop(f)}>
                  <TrashIcon size={18} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}

        {/* T1016 (owner): no line about where the files are kept. */}
      </section>
      {pending && <UndoToast pending={pending} onUndo={undo} />}
    </div>
  );
}
