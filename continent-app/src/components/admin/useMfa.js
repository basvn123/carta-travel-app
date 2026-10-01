import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient.js';

// The second factor in front of delete and ban. Migration 032 makes both
// RPCs refuse any token that is not aal2, so the page steps the session up
// before it offers the button: enrol a TOTP factor once, then type a code
// from the authenticator app. challengeAndVerify swaps the session for an
// aal2 one, and every later RPC carries it. The database stays the gate;
// this only makes the gate passable from the page.
// supabase-js hands back the QR as 'data:image/svg+xml;utf-8,<svg ...>' with
// the markup unencoded, so a '#' in a colour ends the URL as a fragment and
// the image breaks. Re-encode the markup.
const SVG_PREFIX = 'data:image/svg+xml;utf-8,';
const qrSrc = (qr) => (qr.startsWith(SVG_PREFIX)
  ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr.slice(SVG_PREFIX.length))}`
  : qr);

export function useMfa() {
  const [level, setLevel] = useState(null);       // 'aal1' | 'aal2' | null while loading
  const [factorId, setFactorId] = useState(null); // a verified TOTP factor, if any
  const [enrolment, setEnrolment] = useState(null); // { factorId, qr, secret } while enrolling
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);    // { kind: 'enrol' | 'code', message }

  const refresh = useCallback(async () => {
    if (!supabase) return;
    const [{ data: aal }, { data: factors }] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    setLevel(aal?.currentLevel || 'aal1');
    setFactorId(factors?.totp?.[0]?.id || null);
  }, []);

  useEffect(() => { refresh().catch(() => setLevel('aal1')); }, [refresh]);

  const startEnrol = async () => {
    setBusy(true); setErr(null);
    try {
      // An enrolment abandoned halfway leaves an unverified factor behind,
      // and Supabase refuses a second one with the same name.
      const { data: factors } = await supabase.auth.mfa.listFactors();
      for (const f of factors?.all || []) {
        if (f.factor_type === 'totp' && f.status !== 'verified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp', friendlyName: 'Carta admin',
      });
      if (error) throw error;
      setEnrolment({ factorId: data.id, qr: qrSrc(data.totp.qr_code), secret: data.totp.secret });
      setCode('');
    } catch (e) {
      setErr({ kind: 'enrol', message: e?.message || '' });
    }
    setBusy(false);
  };

  const verify = async () => {
    const id = enrolment?.factorId || factorId;
    if (!id || code.trim().length !== 6) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: code.trim() });
      if (error) throw error;
      setEnrolment(null); setCode('');
      await refresh();
    } catch {
      setErr({ kind: 'code', message: '' });
    }
    setBusy(false);
  };

  return {
    level, stepped: level === 'aal2', factorId, enrolment,
    code, setCode: (v) => { setCode(v.replace(/[^0-9]/g, '').slice(0, 6)); setErr(null); },
    busy, err, startEnrol, verify,
  };
}
