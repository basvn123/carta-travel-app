// A worktree's public/ is sparse (CLAUDE.md "Shared checkout and disk"), so a
// dev server there 404s on most data files. With CARTA_DATA_MIRROR set to a
// full public/ folder (the main checkout's), a JSON file the server's own
// public/ lacks is answered from the mirror, read only. Unset, nothing is
// routed and the script tests the server as it is.
//
//   CARTA_DATA_MIRROR=".../Travel App/continent-app/public" node scripts/verify_x.mjs
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const MIRROR = process.env.CARTA_DATA_MIRROR || '';
const OWN = path.resolve('public');

/** Routes a Playwright page or context's local JSON requests to the mirror. */
export async function mirrorData(target) {
  if (!MIRROR) return;
  await target.route(/\/\/(127\.0\.0\.1|localhost):\d+\/[^?#]*\.json(\?|#|$)/, (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname);
    const mine = path.join(OWN, rel);
    const theirs = path.join(MIRROR, rel);
    if (existsSync(mine) || !existsSync(theirs)) return route.continue();
    return route.fulfill({ status: 200, contentType: 'application/json', body: readFileSync(theirs) });
  });
}
