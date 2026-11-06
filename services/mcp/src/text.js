// Every free-text field that leaves the server goes through here. The wire
// data is first-party but holds scraped and harvested text; an MCP client
// feeds tool output to a model, so instruction-shaped sentences are taken out
// with the same scanner the app's AI functions use (aiGuard.scrubData), and
// the length is capped.
import { scrubData } from '../../../continent-app/functions/_lib/aiGuard.js';

export function safeText(value, max = 300) {
  if (value == null) return null;
  const s = String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ');
  const out = scrubData(s, max).text.trim();
  return out || null;
}
