/**
 * parse-booking/fetchGuard.mjs, the SSRF guard for URL ingestion (T1211,
 * register row T1164-m; ASVS 5.0 V1.3.6, V13.2.4, V15.3.2).
 *
 * The function fetches whatever link a traveller pastes, so every request it
 * makes must land on a public address. `safeFetchUrl` (logic.mjs) checks the
 * URL text: scheme, length and host name rules. This module adds the two
 * checks a name alone cannot give:
 *
 *  1. The address. The host name is resolved (A and AAAA) and the fetch is
 *     refused when ANY address is non-public, or when nothing resolves. A
 *     public-looking name that points at 10.0.0.5 or 169.254.169.254 (DNS
 *     rebinding, or just a hostile zone) is caught here.
 *  2. Every redirect hop. Redirects are followed by hand (`redirect:
 *     'manual'`, at most MAX_REDIRECTS), and each Location, resolved against
 *     the current URL, runs the whole check again: URL rules, then DNS.
 *
 * Residual risk, stated plainly: this is a time-of-check to time-of-use gap.
 * fetch() performs its own DNS lookup after ours, and Deno's fetch offers no
 * way to pin the connection to the address we checked (no custom resolver or
 * connect hook in the Edge runtime). A name with a near-zero TTL that answers
 * a public address to our lookup and a private one to fetch's lookup a few
 * milliseconds later can still get through. The window is small and the
 * attacker needs their own authoritative DNS, but it is not closed. Closing
 * it needs an egress proxy that checks the address it actually connects to,
 * or a fetch that accepts a pinned IP.
 *
 * Pure apart from what is injected: the caller passes `fetch` and a
 * `resolveDns(host, 'A' | 'AAAA')` (Deno.resolveDns in the function, a stub
 * in continent-app/tests/parseBookingSsrf.test.mjs), so it runs under Node.
 */
import { safeFetchUrl } from './logic.mjs';

export const MAX_REDIRECTS = 3;

/** Dotted-quad text to four numbers, or null when it is not one. */
function parseV4(s) {
  const parts = String(s).split('.');
  if (parts.length !== 4) return null;
  const out = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

/** IPv6 text (zone id and brackets allowed) to eight 16-bit groups, or null. */
function parseV6(s) {
  let t = String(s).trim().toLowerCase();
  if (t.startsWith('[') && t.endsWith(']')) t = t.slice(1, -1);
  const pct = t.indexOf('%');
  if (pct >= 0) t = t.slice(0, pct);
  if (!t.includes(':')) return null;
  // An embedded IPv4 tail (::ffff:10.0.0.1) becomes two groups.
  const lastColon = t.lastIndexOf(':');
  const tail = t.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = parseV4(tail);
    if (!v4) return null;
    t = `${t.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = t.split('::');
  if (halves.length > 2) return null;
  const split = (h) => (h === '' ? [] : h.split(':'));
  const head = split(halves[0]);
  const back = halves.length === 2 ? split(halves[1]) : [];
  const missing = 8 - head.length - back.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...back];
  const out = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

/** True when an IPv4 address (four numbers) is not a public unicast address. */
function v4NotPublic([a, b, c]) {
  return a === 0 // 0.0.0.0/8 "this network"
    || a === 10 // RFC 1918
    || a === 127 // loopback
    || (a === 100 && b >= 64 && b <= 127) // CGNAT 100.64.0.0/10
    || (a === 169 && b === 254) // link-local, incl. metadata 169.254.169.254
    || (a === 172 && b >= 16 && b <= 31) // RFC 1918
    || (a === 192 && b === 168) // RFC 1918
    || (a === 192 && b === 0 && (c === 0 || c === 2)) // IETF protocol, TEST-NET-1
    || (a === 198 && (b === 18 || b === 19)) // benchmarking
    || (a === 198 && b === 51 && c === 100) // TEST-NET-2
    || (a === 203 && b === 0 && c === 113) // TEST-NET-3
    || a >= 224; // multicast 224/4, reserved 240/4, broadcast 255.255.255.255
}

/**
 * True when `ip` (IPv4 or IPv6 text) is anything but a public unicast
 * address. Text that does not parse as an address counts as not public.
 */
export function isPrivateAddress(ip) {
  const v4 = parseV4(ip);
  if (v4) return v4NotPublic(v4);
  const g = parseV6(ip);
  if (!g) return true;
  const v4tail = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255];
  const zeros = (n) => g.slice(0, n).every((x) => x === 0);
  if (zeros(8)) return true; // :: unspecified
  if (zeros(7) && g[7] === 1) return true; // ::1 loopback
  if (zeros(5) && g[5] === 0xffff) return v4NotPublic(v4tail); // ::ffff:a.b.c.d mapped
  if (zeros(6)) return true; // ::a.b.c.d compatible (deprecated): never fetch
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4NotPublic(v4tail); // NAT64
  if (g[0] === 0x2002) return v4NotPublic([g[1] >> 8, g[1] & 255, g[2] >> 8, g[2] & 255]); // 6to4
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo tunnels to an embedded v4
  return false;
}

/** The URL's host as a bare IP literal, or '' when it is a name. */
function literalHost(hostname) {
  const h = hostname.replace(/^\[|\]$/g, '');
  return parseV4(h) || parseV6(h) ? h : '';
}

/**
 * The whole check for one URL: the text rules of safeFetchUrl, then the
 * address. Resolves to the normalised href, or '' when the URL must not be
 * fetched (including when DNS fails or answers nothing).
 */
export async function checkFetchTarget(raw, resolveDns) {
  const href = safeFetchUrl(raw);
  if (!href) return '';
  const host = new URL(href).hostname;
  const lit = literalHost(host);
  if (lit) return isPrivateAddress(lit) ? '' : href;
  if (typeof resolveDns !== 'function') return '';
  const answers = await Promise.allSettled([resolveDns(host, 'A'), resolveDns(host, 'AAAA')]);
  const addrs = answers.flatMap((r) => (r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : []));
  if (!addrs.length) return '';
  return addrs.some((a) => isPrivateAddress(String(a))) ? '' : href;
}

/**
 * Fetch a traveller's link with every hop checked. Resolves to
 * `{ response, url }` for the final non-redirect answer, or `{ error }` with
 * 'blocked' (a hop failed the check) or 'too_many_redirects'.
 * `timeoutMs` applies per hop, as the function did before T1211.
 */
export async function fetchPublic(raw, { fetch: doFetch, resolveDns, headers = {}, timeoutMs = 12_000, maxRedirects = MAX_REDIRECTS }) {
  let target = await checkFetchTarget(raw, resolveDns);
  if (!target) return { error: 'blocked' };
  for (let hop = 0; ; hop++) {
    const response = await doFetch(target, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    });
    const loc = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && loc) {
      try { await response.body?.cancel(); } catch { /* already closed */ }
      if (hop >= maxRedirects) return { error: 'too_many_redirects' };
      let nextRaw;
      try { nextRaw = new URL(loc, target).href; } catch { return { error: 'blocked' }; }
      const next = await checkFetchTarget(nextRaw, resolveDns);
      if (!next) return { error: 'blocked' };
      target = next;
      continue;
    }
    return { response, url: target };
  }
}
