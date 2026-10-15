import { useCallback, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';

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
  // `model` is what the page shows, handed over by the page's shell
  // (DetailPage builds it from its own facts, reasons and rows), so the PDF
  // prints the page's words and never a second reading of the data.
  const onPdf = useCallback(async (model = null) => {
    if (!item || busy) return;
    setBusy(true);
    try {
      const mod = await import('../lib/itemPdf.js');
      await mod.downloadItemPdf(kind, item, { ...ctx, model: model && !model.nativeEvent ? model : null, t, lang });
    } catch (err) {
      console.error('PDF failed', err);
    } finally {
      setBusy(false);
    }
  }, [kind, item, ctx, t, lang, busy]);
  return { onPdf: item ? onPdf : null, pdfBusy: busy };
}
