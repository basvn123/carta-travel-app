// T1164 (C10): the shared state behind the Edge Function stubs, and the
// loader that imports a real Edge Function (supabase/functions/<name>/index.ts)
// under Node with `Deno.serve` captured. Node 22 strips the TypeScript types.
import { register } from 'node:module';

register(new URL('./loader.mjs', import.meta.url));

export const JWT_SECRET = 'test-jwt-secret-not-a-real-one-0123456789';
export const ENV = {
  SUPABASE_URL: 'https://stub.supabase.local',
  SUPABASE_ANON_KEY: 'anon-key-stub',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-stub',
  STRIPE_SECRET_KEY: 'sk_test_stub',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_stub',
  STRIPE_PRICE_WEEK: 'price_week', STRIPE_PRICE_MONTH: 'price_month', STRIPE_PRICE_YEAR: 'price_year',
  GEMINI_API_KEY: 'gemini-stub',
  NOTIFY_SECRET: 'notify-secret-stub-0123456789',
  RESEND_API_KEY: 're_stub', NOTIFY_FROM: 'Carta <hello@example.test>',
  UPLOADS_SCAN_SECRET: 'uploads-secret-stub-0123456789',
};

export function resetWorld() {
  globalThis.__edgeAuth = {
    jwtSecret: JWT_SECRET,
    env: { ...ENV },
    now: () => Date.now(),
    users: {},
    tables: {},
    rpc: {},
    stripe: {},
    log: [],
    clients: [],
    fetches: [],
  };
  return globalThis.__edgeAuth;
}

const handlers = {};
let loading = null;

globalThis.Deno = {
  serve(a, b) {
    const h = typeof a === 'function' ? a : b;
    handlers[loading] = h;
    return { finished: Promise.resolve(), shutdown: async () => {} };
  },
  env: { get: (k) => globalThis.__edgeAuth?.env[k] },
};

// Outbound calls (Gemini, Resend, a scanner) never leave the process.
globalThis.fetch = async (input, init = {}) => {
  globalThis.__edgeAuth.fetches.push({ url: String(input?.url || input), headers: init.headers || {} });
  return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
};

export async function loadEdge(name) {
  if (handlers[name]) return handlers[name];
  if (!globalThis.__edgeAuth) resetWorld();
  loading = name;
  await import(new URL(`../../../../supabase/functions/${name}/index.ts`, import.meta.url).href);
  loading = null;
  if (!handlers[name]) throw new Error(`${name} did not call Deno.serve`);
  return handlers[name];
}
