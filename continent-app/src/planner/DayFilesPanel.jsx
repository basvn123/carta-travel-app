import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import {
  UploadIcon, DownloadIcon, TrashIcon, TicketIcon, ReceiptIcon, CameraIcon,
  InfoIcon, LockIcon,
} from '../components/Icons.jsx';
import {
  listFiles, addFiles, readFile, deleteFile, filesAvailable, fmtBytes, MAX_FILE_BYTES,
} from './dayFileStore.js';

/** A glyph that says what kind of document this is at a glance. */
function FileGlyph({ type, name }) {
  const n = (name || '').toLowerCase();
  if ((type || '').startsWith('image/')) return <CameraIcon size={15} />;
  if ((type || '').includes('pdf') || n.endsWith('.pdf')) return <ReceiptIcon size={15} />;
  return <TicketIcon size={15} />;
}

/** Image documents earn a real thumbnail: a photographed ticket is found by
 *  its picture far faster than by "IMG_4417.jpg". */
function FileShot({ id, type }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!(type || '').startsWith('image/')) return undefined;
    let dead = false;
    let made = '';
    readFile(id).then((blob) => {
      if (dead || !blob) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => { dead = true; if (made) URL.revokeObjectURL(made); };
  }, [id, type]);
  if (!url) return null;
  return <img className="dayf-shot" src={url} alt="" loading="lazy" decoding="async" />;
}

/**
 * Tab 3 of the day workspace: the paperwork.
 *
 * Two different things live here on purpose. FILES are the traveller's own
 * documents (boarding passes, the hotel confirmation, a museum ticket) and
 * they stay in this browser: no upload, no bucket, nobody else holding a scan
 * of somebody's passport. The panel says that in plain words rather than
 * letting anyone assume otherwise. NOTES are three lines about a door code or
 * who is booking dinner, they are small and everyone on the trip wants them on
 * every device, so they ride the plan's synced extras instead.
 */
export function DayFilesPanel({ planId, notes, onNotes, importBlock }) {
  const { t } = useI18n();
  const [files, setFiles] = useState([]);
  const [ready, setReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [problem, setProblem] = useState('');
  const inputRef = useRef(null);

  const refresh = useCallback(async () => {
    setFiles(await listFiles(planId));
  }, [planId]);

  useEffect(() => {
    let dead = false;
    filesAvailable().then((ok) => { if (!dead) setReady(ok); });
    refresh();
    return () => { dead = true; };
  }, [refresh]);

  const take = async (fileList) => {
    if (!fileList?.length || busy) return;
    setBusy(true);
    setProblem('');
    const { rejected } = await addFiles(planId, fileList);
    if (rejected.length) {
      const first = rejected[0];
      setProblem(first.code === 'size'
        ? t('dayws.fileTooBig', { name: first.name, mb: Math.round(MAX_FILE_BYTES / (1024 * 1024)) })
        : first.code === 'full'
          ? t('dayws.fileFull')
          : t('dayws.fileFailed', { name: first.name }));
    }
    await refresh();
    setBusy(false);
  };

  const save = async (f) => {
    const blob = await readFile(f.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  const drop = async (f) => {
    await deleteFile(f.id);
    await refresh();
  };

  return (
    <div className="dayf">
      <section className="dayf-block">
        <div className="dayf-head">
          <h3>{t('dayws.filesTitle')}</h3>
          {files.length > 0 && <span className="dayf-count">{files.length}</span>}
        </div>

        {ready ? (
          <div
            className={`dayf-drop${dragOver ? ' over' : ''}${busy ? ' busy' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); take(e.dataTransfer?.files); }}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => { take(e.target.files); e.target.value = ''; }}
            />
            <span className="dayf-drop-glyph" aria-hidden="true"><UploadIcon size={17} /></span>
            <p className="dayf-drop-lead">{t('dayws.filesLead')}</p>
            <button className="dayf-browse" onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? t('dayws.filesAdding') : t('dayws.filesBrowse')}
            </button>
          </div>
        ) : (
          <p className="dayf-note">{t('dayws.filesUnavailable')}</p>
        )}

        {problem && <p className="dayf-problem">{problem}</p>}

        {files.length > 0 && (
          <ul className="dayf-list">
            {files.map((f) => (
              <li className="dayf-row" key={f.id}>
                <span className="dayf-glyph" aria-hidden="true">
                  <FileShot id={f.id} type={f.type} />
                  <FileGlyph type={f.type} name={f.name} />
                </span>
                <span className="dayf-info">
                  <span className="dayf-name">{f.name}</span>
                  <span className="dayf-meta">{fmtBytes(f.size)}</span>
                </span>
                <button className="dayf-act" onClick={() => save(f)} title={t('dayws.fileSave')} aria-label={t('dayws.fileSave')}>
                  <DownloadIcon size={14} />
                </button>
                <button className="dayf-act dayf-act-del" onClick={() => drop(f)} title={t('dayws.fileDelete')} aria-label={t('dayws.fileDelete')}>
                  <TrashIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="dayf-note">
          <LockIcon size={11} /> {t('dayws.filesPrivate')}
        </p>
      </section>

      <section className="dayf-block">
        <div className="dayf-head">
          <h3>{t('dayws.notesTitle')}</h3>
        </div>
        <p className="dayf-sub">{t('dayws.notesSub')}</p>
        <textarea
          className="dayf-notes"
          value={notes}
          rows={5}
          maxLength={4000}
          placeholder={t('dayws.notesPlaceholder')}
          onChange={(e) => onNotes(e.target.value)}
        />
        <p className="dayf-note"><InfoIcon size={11} /> {t('dayws.notesSynced')}</p>
      </section>

      {importBlock && (
        <section className="dayf-block">
          <div className="dayf-head">
            <h3>{t('day.importTitle')}</h3>
          </div>
          {importBlock}
        </section>
      )}
    </div>
  );
}
