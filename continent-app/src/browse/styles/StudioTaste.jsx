import React, { Suspense, lazy, useEffect, useState } from 'react';
import { getTasteInputs, subscribeTasteInputs } from '../../auth/mytrips/tasteInputs.js';

const TasteChips = lazy(() => import('../../auth/mytrips/TasteChips.jsx').then((m) => ({ default: m.TasteChips })));

/**
 * Jouw smaak in the Style Studio (G12 decision 7): the same TasteChips,
 * the same verdict store and sync, on the saves and trips My trips last
 * published (auth/mytrips/tasteInputs.js).
 */
export function StudioTaste({ destinations }) {
  const [inputs, setInputs] = useState(getTasteInputs);
  useEffect(() => subscribeTasteInputs(setInputs), []);
  if (!destinations) return null;
  return (
    <div className="sst-taste">
      <Suspense fallback={null}>
        <TasteChips saves={inputs.saves} trips={inputs.trips} destinations={destinations} userId={inputs.userId} />
      </Suspense>
    </div>
  );
}
