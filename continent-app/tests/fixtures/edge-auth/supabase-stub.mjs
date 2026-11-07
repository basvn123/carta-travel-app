// T1164 (C10): a stand-in for `npm:@supabase/supabase-js@2` in the Edge
// Function auth tests. auth.getUser() behaves like Supabase Auth for the
// cases the tests need: it verifies an HS256 JWT against the test secret,
// refuses a bad signature, `alg: none`, an expired token and the anon key
// (a JWT with no user), and answers the user only for a valid token. Table
// and RPC calls are recorded in `world().log` and answered from
// `world().tables` / `world().rpc`, so a test can assert what a refused
// request never reached.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const world = () => globalThis.__edgeAuth;

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function signJwt(payload, secret, header = { alg: 'HS256', typ: 'JWT' }) {
  const h = b64u(JSON.stringify(header));
  const p = b64u(JSON.stringify(payload));
  const sig = header.alg === 'none' ? '' : b64u(createHmac('sha256', secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

const NO_USER = (message) => ({ data: { user: null }, error: { name: 'AuthApiError', status: 401, message } });

export function verifyJwt(bearer, secret, now = Date.now()) {
  const m = /^Bearer (\S+)$/.exec(bearer || '');
  if (!m) return NO_USER('missing token');
  const parts = m[1].split('.');
  if (parts.length !== 3) return NO_USER('malformed');
  let header; let payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
  } catch { return NO_USER('malformed'); }
  if (header.alg !== 'HS256') return NO_USER('bad alg');
  const want = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  const got = Buffer.from(parts[2], 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return NO_USER('invalid signature');
  if (!(typeof payload.exp === 'number' && payload.exp * 1000 > now)) return NO_USER('token is expired');
  if (payload.role !== 'authenticated' || !payload.sub) return NO_USER('not a user token');
  const user = world().users[payload.sub];
  if (!user) return NO_USER('user not found');
  return { data: { user: { id: payload.sub, email: user.email, aud: 'authenticated', app_metadata: payload.app_metadata || {} } }, error: null };
}

function query(role, table) {
  const ops = [];
  const settle = () => {
    world().log.push({ role, table, ops });
    const answer = world().tables[table];
    const out = typeof answer === 'function' ? answer(ops, role) : answer;
    return out ?? { data: null, error: null };
  };
  const q = new Proxy({}, {
    get(_, name) {
      if (name === 'then') return (res, rej) => Promise.resolve(settle()).then(res, rej);
      return (...args) => {
        ops.push([name, ...args]);
        if (name === 'maybeSingle' || name === 'single') return Promise.resolve(settle());
        return q;
      };
    },
  });
  return q;
}

export function createClient(url, key, opts = {}) {
  const w = world();
  const role = key && key === w.env.SUPABASE_SERVICE_ROLE_KEY ? 'service' : 'anon';
  const authz = opts?.global?.headers?.Authorization ?? '';
  w.clients.push({ role, authz });
  return {
    auth: {
      getUser: async (jwt) => {
        w.log.push({ role, auth: 'getUser' });
        return verifyJwt(jwt ? `Bearer ${jwt}` : authz, w.jwtSecret, w.now());
      },
    },
    from: (table) => query(role, table),
    rpc: async (fn, args) => {
      w.log.push({ role, rpc: fn, args });
      const answer = w.rpc[fn];
      return (typeof answer === 'function' ? answer(args, role) : answer) ?? { data: null, error: null };
    },
    storage: {
      from: (bucket) => new Proxy({}, {
        get: (_, name) => async (...args) => { w.log.push({ role, storage: bucket, op: name, args }); return { data: null, error: null }; },
      }),
    },
  };
}
