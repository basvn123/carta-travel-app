import { useCallback, useState, useRef, useMemo, useEffect } from 'react';
import { fromDraft } from '../flow/tripSettings.js';
import { plannerStore } from '../plannerStore.js';
import { syncWhen, syncParty } from '../flow/appSync.js';
import { useEditHistory } from './useEditHistory.js';
import { carAdvice } from '../../lib/transport.js';
import { budgetCheck } from '../flow/budget.js';
import { formatMoney } from '../../lib/money.js';

export function useTripHistory({ app, countryInsights, lang, saveTripSet, t, tp, tripSet, wizardOpen }) {
  const histState = {
    ...tp.editState,
    set: { when: tripSet.when, party: tripSet.party, from: tripSet.from || null, name: tripSet.trip?.name || '', budget: tripSet.guide?.budget || null },
  };
  const restoreEdit = tp.restoreEdit;
  const restoreHist = useCallback((st) => {
    restoreEdit(st);
    const cur = fromDraft(plannerStore.getState());
    const fromMoved = JSON.stringify(cur.from || null) !== JSON.stringify(st.set.from || null);
    saveTripSet({
      ...cur, when: st.set.when, party: st.set.party, from: st.set.from, trip: { ...cur.trip, name: st.set.name },
      guide: st.set.budget ? { ...cur.guide, budget: st.set.budget } : cur.guide,
    });
    syncWhen(app, st.set.when);
    syncParty(app, st.set.party);
    if (fromMoved && st.set.from) app?.setFrom?.({ name: st.set.from.name, lat: st.set.from.lat, lon: st.set.from.lng });
  }, [restoreEdit, saveTripSet, app]);
  const hist = useEditHistory({
    state: histState,
    restore: restoreHist,
    enabled: tp.planned && tp.stops.length > 0 && !wizardOpen,
    resetKey: tp.planId || tp.deviceKey || 'draft',
  });
  // The Undo message for the newest step (not for a name being typed), or a
  // note on what a changed setting did.
  const [toast, setToast] = useState(null);
  // A chip's note on what its change did (From: "Flights are now priced
  // from Ghent."), shown with that change's Undo.
  const noteRef = useRef(null);
  // T846: a change that takes the trip over its budget says so on its Undo
  // message ("€120 over your budget"), so it can be taken back at once.
  const headCount = Math.max(1, tp.groupSize + tp.children + tp.babies);
  // T873: the car advice, one row on the trip page's route (Review's block before).
  const carDests = tp.stopDetails.map((x) => x.dest).filter(Boolean);
  const carKey = carDests.map((d) => d.id).join('|');
  const carTip = useMemo(
    () => (tp.tripHasCar || tp.transportPref === 'owncar' ? null : carAdvice(carDests, headCount, countryInsights)),
    [carKey, headCount, countryInsights, tp.tripHasCar, tp.transportPref], // eslint-disable-line react-hooks/exhaustive-deps -- carKey stands for the stops
  );
  // T887: what the advised hire car does to the total (two quotes, so memoised).
  const quoteDelta = tp.quoteDelta;
  const carDelta = useMemo(
    () => (carTip && carTip.verdict !== 'no' ? quoteDelta?.({ transportPref: 'car' }) ?? null : null),
    [carTip, quoteDelta],
  );
  const budgetNow = tp.stops.length ? budgetCheck(tp.priced, tripSet.guide?.budget, { party: headCount, nights: tp.plannedNights }) : null;
  const overRef = useRef(null);
  useEffect(() => {
    const was = overRef.current;
    overRef.current = budgetNow ? budgetNow.over : null;
    if (!hist.last || hist.last.kind === 'name') return;
    const crossed = budgetNow?.over && was === false;
    const note = crossed
      ? t('tp.bud.nowOver', { price: formatMoney(budgetNow.gap, { precision: 'whole', locale: lang }) })
      : noteRef.current && noteRef.current.kind === hist.last.kind ? noteRef.current.text : '';
    noteRef.current = null;
    setToast({ change: hist.last, note });
  }, [hist.last?.seq, hist.last?.at]); // eslint-disable-line react-hooks/exhaustive-deps -- a new step, not a new object
  useEffect(() => {
    if (overRef.current == null && budgetNow) overRef.current = budgetNow.over;
  });
  return { hist, toast, setToast, noteRef, headCount, carTip, carDelta };
}
