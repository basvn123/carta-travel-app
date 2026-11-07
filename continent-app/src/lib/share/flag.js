/**
 * The flag that puts "Share the receipt" in a saved trip's menu (T1175, K7).
 *
 * Off by default. On with any of:
 *   ?receipt=1 in the page URL (remembered; ?receipt=0 turns it off again)
 *   localStorage "carta.shareReceipt" = "1"
 *   VITE_SHARE_RECEIPT=1 at build time
 * Turning it on for everyone is register row T1175-a: the owner looks at the
 * image on a phone and a desktop, then the default flips here.
 */
export const SHARE_RECEIPT_KEY = 'carta.shareReceipt';

export function shareReceiptOn() {
  try {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('receipt') : null;
    if (q === '1' || q === '0') {
      try { window.localStorage.setItem(SHARE_RECEIPT_KEY, q); } catch { /* private mode */ }
      return q === '1';
    }
  } catch { /* no window */ }
  try {
    if (typeof window !== 'undefined' && window.localStorage.getItem(SHARE_RECEIPT_KEY) === '1') return true;
  } catch { /* storage blocked */ }
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  return env.VITE_SHARE_RECEIPT === '1';
}
