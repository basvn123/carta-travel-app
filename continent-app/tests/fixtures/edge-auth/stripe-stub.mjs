// T1164 (C10): a stand-in for `npm:stripe@17` in the Edge Function auth
// tests. webhooks.constructEventAsync checks the Stripe-Signature header the
// way Stripe documents it (t=<unix>, v1=HMAC-SHA256(secret, `${t}.${raw}`),
// five minutes of tolerance), so a forged, stale or missing signature is
// refused by the real handler code. Every other call is recorded in
// `world().log` and answered from `world().stripe`.
import { createHmac, timingSafeEqual } from 'node:crypto';

const world = () => globalThis.__edgeAuth;
const TOLERANCE_S = 300;

export function stripeSignature(raw, secret, t) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')}`;
}

const call = (path) => async (...args) => {
  world().log.push({ stripe: path, args });
  const answer = world().stripe[path];
  if (answer instanceof Error) throw answer;
  return typeof answer === 'function' ? answer(...args) : (answer ?? {});
};

export default class Stripe {
  constructor(secret) {
    this.secret = secret;
    this.webhooks = {
      constructEventAsync: async (raw, header, secret) => {
        const parts = Object.fromEntries(String(header).split(',').map((kv) => kv.split('=')));
        const t = Number(parts.t);
        if (!parts.v1 || !Number.isInteger(t)) throw new Error('No signatures found with expected scheme');
        const want = Buffer.from(createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex'));
        const got = Buffer.from(parts.v1);
        if (got.length !== want.length || !timingSafeEqual(got, want)) throw new Error('No signatures found matching the expected signature for payload');
        if (Math.abs(world().now() / 1000 - t) > TOLERANCE_S) throw new Error('Timestamp outside the tolerance zone');
        return JSON.parse(raw);
      },
    };
    this.billingPortal = { sessions: { create: call('billingPortal.sessions.create') } };
    this.checkout = { sessions: { create: call('checkout.sessions.create'), list: call('checkout.sessions.list'), retrieve: call('checkout.sessions.retrieve') } };
    this.subscriptions = { retrieve: call('subscriptions.retrieve'), update: call('subscriptions.update') };
    this.paymentIntents = { retrieve: call('paymentIntents.retrieve') };
  }
}
