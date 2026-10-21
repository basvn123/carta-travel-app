import { useCallback, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { usePaywall } from './usePaywall.jsx';

/**
 * The Download PDF door of an item page or a trip (T430, T431). The writer
 * (lib/itemPdf.js, on lib/pdfKit.js and jsPDF) is a lazy chunk with its
 * fonts, so a page that is never printed costs nothing. `ctx` carries what
 * the page computed and the PDF repeats (the country name, the facts, the
 * highlights), so the PDF never says something the page does not.
 */
export function useItemPdf(kind, item, ctx = {}) {
  const { t, lang } = useI18n();
  const [busy, setBusy] = useState(false);
  const paywall = usePaywall();
  // `model` is what the page shows, handed over by the page's shell
  // (DetailPage builds it from its own facts, reasons and rows), so the PDF
  // prints the page's words and never a second reading of the data.
  const onPdf = useCallback(async (model = null) => {
    if (!item || busy) return;
    // Every PDF comes with a Trip Pass (T488-a): the trail, beach, lake,
    // mountain, cycle and journey pages all print through this door, so the
    // gate stands here once. The sheet opens on the tap, before anything is
    // built, and the page stays as it was.
    if (!paywall.require('export')) return;
    setBusy(true);
    try {
      const mod = await import('../lib/itemPdf.js');
      await mod.downloadItemPdf(kind, item, { ...ctx, model: model && !model.nativeEvent ? model : null, t, lang });
    } catch (err) {
      console.error('PDF failed', err);
    } finally {
      setBusy(false);
    }
  }, [kind, item, ctx, t, lang, busy, paywall]);
  return { onPdf: item ? onPdf : null, pdfBusy: busy };
}
