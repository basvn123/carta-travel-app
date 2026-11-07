import { deviceSaveDecision, loadDeviceTrip, newDeviceKey, saveDeviceTrip, deviceMeetsAccount, clearDeviceTrip } from '../deviceTripStore.js';
import { trackFunnel } from '../../lib/funnelCounts.js';
import { fetchTripPlans } from '../../auth/tripPlanStorage.js';
import { useEffect } from 'react';

export function useTripSave({
  deviceTrip, keepChoice, migrating, paywall, pendingMove, setDeviceError, setDeviceTrip,
  setKeepChoice, setPendingCountry, setPendingDestId, setPendingMove, setSaveError,
  setSaveNotice, setSelectedStop, t, tp, user,
}) {
  const handlePendingCountry = (c) => {
    setPendingCountry(c);
    setPendingDestId(''); // city choice no longer valid once the country changes
  };

  const notify = (msg) => {
    setSaveNotice(msg);
    window.setTimeout(() => setSaveNotice(''), 3500);
  };

  // Without an account the first trip is kept on this device (T473, T500):
  // "Save trip" writes it to carta.deviceTrip.v1 and says so. A second trip
  // asks for the pass, as a second account trip does; a browser that keeps
  // nothing (a private window, a full store) says so and offers sign-in.
  const saveOnDevice = () => {
    if (deviceSaveDecision(loadDeviceTrip(), tp.deviceKey) === 'second') {
      paywall.require('save');
      return;
    }
    const key = tp.deviceKey || newDeviceKey();
    if (!saveDeviceTrip({ key, trip: { ...tp.snapshot, planBeds: tp.planBeds } })) {
      setDeviceError(true);
      return;
    }
    tp.setDeviceKey(key);
    setDeviceTrip(loadDeviceTrip());
    setDeviceError(false);
    notify(t('trip.savedDeviceNotice'));
    trackFunnel('trip_saved');
  };

  const handleSave = async () => {
    setSaveError('');
    if (!user) { saveOnDevice(); return; }
    const wasUpdate = Boolean(tp.planId);
    const fromEdit = !tp.planned;
    // A free traveller keeps one trip. The second one is somebody who came
    // back, which is the person worth asking. Saving over an existing trip is
    // never gated, and the count is only fetched when it can change the
    // answer, so a pass holder never pays for the round trip.
    if (!wasUpdate && !paywall.paid) {
      let existing = [];
      try { existing = await fetchTripPlans(user.id); } catch { existing = []; }
      if (existing.length >= 1 && !paywall.require('save')) return;
    }
    try {
      await tp.savePlan(user.id);
      trackFunnel('trip_saved');
      notify(wasUpdate ? t('trip.updatedNotice') : t('trip.savedNotice'));
      if (fromEdit && wasUpdate) {
        // Done editing an existing trip: hand the traveller back to the Trip
        // planner's start page (the trip itself is safe under Saved trips).
        tp.clearPlan();
        setSelectedStop(null);
      }
    } catch (e) {
      // The service's own text ("JWT expired", a constraint name) is for the
      // console; the traveller gets what failed and what to do (T193).
      console.warn('trip save failed', e);
      setSaveError(t('state.tripSaveFailed'));
    }
  };

  // A trip kept on the device follows its edits, as a day plan does: once
  // kept, it stays "Saved on this device" without a second press.
  const keptHere = !user && Boolean(tp.deviceKey) && deviceTrip?.key === tp.deviceKey;
  useEffect(() => {
    if (!keptHere || !tp.stops.length) return;
    if (!saveDeviceTrip({ key: tp.deviceKey, trip: { ...tp.snapshot, planBeds: tp.planBeds } })) setDeviceError(true);
  }, [tp.snapshot]); // eslint-disable-line react-hooks/exhaustive-deps -- written when the trip changes, not when the key is first set (saveOnDevice already wrote it)

  // Signing in with a trip on the device (T490-f). With room on the account
  // (no trip yet, or a pass) the trip moves across; on the free plan with a
  // trip already there, the traveller chooses which one to keep.
  useEffect(() => {
    if (!user || migrating.current) return;
    const stored = loadDeviceTrip();
    if (!stored) return;
    migrating.current = true;
    (async () => {
      let existing;
      try { existing = await fetchTripPlans(user.id); } catch { migrating.current = false; return; }
      const how = deviceMeetsAccount(stored, existing.length, paywall.paid);
      if (how === 'move') setPendingMove({ stored, asPlanId: null });
      else if (how === 'choose') setKeepChoice({ stored, account: existing[0] });
    })();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps -- once per sign-in

  // The move itself waits one render: the device trip is put on the planner
  // first, then saved, so savePlan reads the trip it is saving.
  useEffect(() => {
    if (!pendingMove || !user) return;
    const { stored, asPlanId } = pendingMove;
    if (tp.deviceKey !== stored.key) { tp.loadSnapshot(stored.trip, stored.key); return; }
    setPendingMove(null);
    tp.savePlan(user.id, { asPlanId }).then(() => {
      clearDeviceTrip();
      setDeviceTrip(null);
      notify(t('trip.savedNotice'));
    }).catch((e) => {
      console.warn('device trip move failed', e);
      setSaveError(t('state.tripSaveFailed'));
    });
  }, [pendingMove, tp.deviceKey, user]); // eslint-disable-line react-hooks/exhaustive-deps -- tp is a fresh object every render

  const keepDeviceTrip = () => {
    const c = keepChoice;
    setKeepChoice(null);
    if (c) setPendingMove({ stored: c.stored, asPlanId: c.account.id });
  };
  const keepAccountTrip = () => {
    const c = keepChoice;
    setKeepChoice(null);
    clearDeviceTrip();
    setDeviceTrip(null);
    if (!c) return;
    tp.loadPlan(c.account.id).then(() => { tp.setPlanned(true); setSelectedStop(null); })
      .catch(() => setSaveError(t('trip.openFailed')));
  };
  return { handlePendingCountry, handleSave, keptHere, keepDeviceTrip, keepAccountTrip };
}
