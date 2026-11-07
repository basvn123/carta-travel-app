import React from 'react';
import { DialogSheet } from './ui/DialogSheet.jsx';
import { Button } from './ui/index.js';
import { ShareIcon, DownloadIcon } from './Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { formatMoney } from '../lib/money.js';
import { drawOps, paletteFromCss } from '../lib/share/draw.js';
import { receiptModel, receiptOps, checkReceipt, RECEIPT_W, RECEIPT_H } from '../lib/share/receipt.js';

/**
 * The shareable trip receipt (T1175, ROADMAP K7): a saved trip drawn as a
 * 1080 x 1350 image (lib/share/receipt.js) on a canvas, previewed here, then
 * shared through the system share sheet (Web Share with a file, where the
 * browser can) or saved as a PNG. Behind the flag in lib/share/flag.js.
 *
 * The image is drawn when the sheet opens, so the Share press calls
 * navigator.share inside the tap (iOS refuses a share after an await). The
 * numbers check runs before anything is offered: if a printed figure does
 * not match the trip's price (lib/myTrips.js tripFigure), the sheet says the
 * image could not be made and offers nothing.
 *
 * props: plan (a saved trip), data (the catalogue), stayTier, lifestyle, onClose
 */
function fileName(title) {
  const slug = String(title || 'trip').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'trip';
  return `carta-${slug}.png`;
}

export function ShareReceiptSheet({ plan, data, stayTier = 'home', lifestyle = null, onClose }) {
  const { t, lang } = useI18n();
  const [state, setState] = React.useState({ status: 'drawing' });
  const urlRef = React.useRef(null);

  React.useEffect(() => {
    let live = true;
    (async () => {
      const opts = { data, stayTier, lifestyle };
      const model = receiptModel(plan, opts);
      if (!model) { if (live) setState({ status: 'failed' }); return; }
      const money = (v) => formatMoney(v, { locale: lang });
      const day = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' });
      const full = new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      const at = (iso) => new Date(`${iso}T12:00:00Z`);
      const dateText = (a, b) => (a && b ? t('plan.dateRange', { a: day.format(at(a)), b: full.format(at(b)) }) : '');
      const pricedOn = full.format(new Date());
      const ops = receiptOps(model, { t, money, dateText, pricedOn });
      const problems = checkReceipt(ops, model, plan, opts, money);
      if (problems.length) {
        if (live) setState({ status: 'failed', problems });
        return;
      }
      const root = document.documentElement;
      const family = getComputedStyle(root).getPropertyValue('--ui').trim() || 'sans-serif';
      try { await Promise.all([500, 600, 700, 800].map((w) => document.fonts?.load(`${w} 32px ${family}`))); } catch { /* the fallback face draws */ }
      const canvas = document.createElement('canvas');
      canvas.width = RECEIPT_W;
      canvas.height = RECEIPT_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) { if (live) setState({ status: 'failed' }); return; }
      const pal = paletteFromCss(root);
      ctx.fillStyle = pal['umber-800'] || 'black';
      ctx.fillRect(0, 0, RECEIPT_W, RECEIPT_H);
      drawOps(ctx, ops, { pal, family });
      const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
      if (!live) return;
      if (!blob) { setState({ status: 'failed' }); return; }
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const file = typeof File !== 'undefined' ? new File([blob], fileName(model.title), { type: 'image/png' }) : null;
      const canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
      setState({ status: 'ready', url, file, canShare, model, alt: t('share.receiptAlt', { title: model.title, price: money(Math.round(model.total)), n: model.nights }) });
    })();
    return () => {
      live = false;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [plan, data, stayTier, lifestyle, lang, t]);

  const share = () => {
    if (state.status !== 'ready' || !state.canShare) return;
    navigator.share({ files: [state.file], title: state.model.title }).catch(() => { /* cancelled */ });
  };
  const save = () => {
    if (state.status !== 'ready') return;
    const a = document.createElement('a');
    a.href = state.url;
    a.download = state.file?.name || 'carta-trip.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <DialogSheet titleId="share-receipt-h" title={t('share.receiptTitle')} onClose={onClose} closeLabel={t('share.receiptClose')} className="share-receipt-sheet">
      <div className="frr-sheet-body" data-share-receipt={state.status}>
        <p className="frr-sub">{t('share.receiptHint')}</p>
        {state.status === 'drawing' && <p role="status">{t('share.receiptMaking')}</p>}
        {state.status === 'failed' && <p role="alert">{t('share.receiptFailed')}</p>}
        {state.status === 'ready' && (
          <>
            <img src={state.url} alt={state.alt} width={RECEIPT_W} height={RECEIPT_H} className="share-receipt-img" style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-card)' }} />
            <div className="mt-next-actions">
              {state.canShare && (
                <Button variant="primary" iconStart={<ShareIcon size={18} />} onClick={share}>{t('share.receiptShare')}</Button>
              )}
              <Button variant={state.canShare ? 'secondary' : 'primary'} iconStart={<DownloadIcon size={18} />} onClick={save}>{t('share.receiptSave')}</Button>
            </div>
          </>
        )}
      </div>
    </DialogSheet>
  );
}
