// Mounts the AI proposal on its own, with a canned plan built from real Ghent
// catalogue rows (two of the photo URLs in that data are dead, on purpose: the
// fallback is part of what this harness checks).
//
// Served by the dev server at /scripts/ai/proposal_preview.html and driven by
// verify_ai_proposal.mjs. No account, no Edge Function, no AI quota.
import React from 'react';
import ReactDOM from 'react-dom/client';
import { I18nProvider } from '../../src/i18n/index.jsx';
import { AiPlanRoute } from '../../src/planner/AiPlanRoute.jsx';
import { stopPhaseLabels } from '../../src/planner/daySchedule.js';
import '../../src/styles.css';

const S = (name, lat, lon, arrive, img, why, extra = {}) => ({
  id: '1', name, lat, lon, arrive, dwellMin: 45, why, img, cat: 'sight',
  external: false, walkKmFromPrev: 0.4, walkMinFromPrev: 8, ...extra,
});

const STOPS = [
  S('Blandijnberg', 51.04565, 3.72484, '09:30',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Braemtzegel.png/640px-Braemtzegel.png',
    'Start your active day with a crisp morning walk up Ghent’s famous central hill.'),
  S('Boekentoren', 51.04503, 3.72586, '10:20',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/2021_Boekentoren_-_University_Library_of_Ghent.jpg/500px-2021_Boekentoren_-_University_Library_of_Ghent.jpg',
    'Pass by Henry van de Velde’s modernist tower on your route north into the city center.'),
  S('Saint Bavo Cathedral', 51.05297, 3.72716, '11:30',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Gent-Sint-Baafskathedraal_vom_Belfried_aus_gesehen.jpg/500px-Gent-Sint-Baafskathedraal_vom_Belfried_aus_gesehen.jpg',
    'Step inside this majestic cathedral to view its world famous gothic architecture.'),
  S('Belfort', 51.05366, 3.72479, '12:40',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Belfry_of_Ghent_%28DSCF0247%2CDSCF0249%29.jpg/640px-Belfry_of_Ghent_%28DSCF0247%2CDSCF0249%29.jpg',
    'Climb the steep medieval tower steps for outstanding views across Ghent.'),
  S('Gravensteen', 51.05718, 3.72076, '13:50',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Gent%2C_Het_Gravensteen_oeg25890_vanaf_de_Hoofdbrug_IMG_0431_2021-08-13_18.28.jpg/500px-Gent%2C_Het_Gravensteen_oeg25890_vanaf_de_Hoofdbrug_IMG_0431_2021-08-13_18.28.jpg',
    'Explore the cool stone corridors and shaded ramparts of this medieval castle.'),
  S('Huis van Alijn', 51.05622, 3.72389, '15:10', '',
    'Enjoy an engaging indoor retreat through Ghent’s rich cultural history.',
    { cat: 'town' }),
  S('Zwembad Van Eyck', 51.04905, 3.73155, '16:30', '',
    'Cool off at Ghent’s oldest indoor swimming pool during the afternoon heat.',
    { id: null, external: true }),
  S('De Graslei', 51.05494, 3.72099, '17:40',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Gent%2C_de_Graslei_vanaf_de_Korenlei_met_oeg24758tm61%2B25159_IMG_0447_2021-08-13_18.37.jpg/640px-Gent%2C_de_Graslei_vanaf_de_Korenlei_met_oeg24758tm61%2B25159_IMG_0447_2021-08-13_18.37.jpg',
    'Conclude your day with an energetic waterfront walk along the picturesque harbor.'),
];

function Harness() {
  return (
    <div className="day-saved-card ai-plan-card" style={{ margin: '20px auto' }}>
      <p className="ai-plan-proposal-tag">Proposal 1, not on your map yet</p>
      <p className="ai-plan-lead">
        This active walk leads you from Ghent&apos;s highest hill through iconic medieval towers
        to shaded indoor cultural highlights, finishing along the lively waterfront.
      </p>
      <AiPlanRoute stops={STOPS} phases={stopPhaseLabels(STOPS)} />
      <p className="ai-plan-note">About 3.7 km on foot, done around 18:17.</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <I18nProvider><Harness /></I18nProvider>
);
