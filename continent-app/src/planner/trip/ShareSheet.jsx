import React, { useState } from 'react';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { ChevronRightIcon, DownloadIcon, LinkIcon, CalendarIcon } from '../../components/Icons.jsx';
import { usePaywall } from '../../hooks/usePaywall.jsx';
import { buildTripShareUrl } from '../../lib/shareLink.js';
import { VisibilityChoice } from '../flow/VisibilityChoice.jsx';

/**
 * Share this trip (T847, owner board panel 10, kept): who can see it (the
 * same three chips as Create trip), Copy link (the phone's own share sheet
 * where there is one), Download PDF behind the pass like before, and
 * Calendar and maps, which opens the route's export block. Who can see it
 * left the trip settings for here, so the settings hold only what the trip
 * is made of.
 *
 *   visibility, onVisibility(v)
 *   sharePayload   the trip as a share link carries it
 *   onPdf()        the trip's PDF;  onMore()   the route's export block
 */
export function ShareSheet({ anchorRef = null, title, visibility, onVisibility, sharePayload, onPdf, onMore, onClose }) {
  const { t } = useI18n();
  const paywall = usePaywall();
  const [note, setNote] = useState('');
  const copy = async () => {
    const url = await buildTripShareUrl(sharePayload);
    if (!url) return;
    if (typeof navigator !== 'undefined' && navigator.share && window.matchMedia?.('(pointer: coarse)').matches) {
      try { await navigator.share({ title, url }); return; } catch (e) { if (e?.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNote(t('export.linkCopied'));
    } catch {
      setNote(t('export.linkFailed'));
    }
  };
  return (
    <SheetShell title={t('tp.sh.title')} onClose={onClose} anchorRef={anchorRef} width={420} className="tpsh-sheet" labelId="tpsh-title">
      <div className="tpsh">
        <section className="tpsh-sec" aria-labelledby="tpsh-who">
          <h3 className="tpsh-h" id="tpsh-who">{t('pf.create.visibility')}</h3>
          <VisibilityChoice value={visibility} onChange={onVisibility} />
        </section>
        <Button variant="secondary" block iconStart={<LinkIcon size={18} />} onClick={copy} disabled={!sharePayload}>
          {t('tp.sh.copy')}
        </Button>
        {note && <p className="tpsh-note" role="status">{note}</p>}
        <ul className="tpsh-rows">
          <li>
            <Button variant="quiet" className="tpsh-row" iconStart={<DownloadIcon size={18} />} iconEnd={<ChevronRightIcon size={16} />}
              onClick={() => { if (paywall.require('export')) onPdf?.(); }}>
              {t('tp.sh.pdf')}
            </Button>
          </li>
          <li>
            <Button variant="quiet" className="tpsh-row" iconStart={<CalendarIcon size={18} />} iconEnd={<ChevronRightIcon size={16} />}
              onClick={() => { onClose(); onMore?.(); }}>
              {t('tp.sh.more')}
            </Button>
          </li>
        </ul>
      </div>
    </SheetShell>
  );
}
