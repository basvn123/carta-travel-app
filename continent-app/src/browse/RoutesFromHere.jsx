import React from 'react';
import { RouteIcon, BikeIcon, TrainIcon, ChevronRightIcon } from '../components/Icons.jsx';

/**
 * "Routes from here": the long paths and cycle routes that pass this town.
 *
 * Every number here was measured in the lab to the NEAREST POINT ON THE LINE
 * (pipeline/trails/attach.py), which is the whole reason this block exists
 * separately from "Around here". A route is a line, and the join it replaced
 * placed each one by the centre of its bounding box: Rome's page showed a
 * variant of the Via Francigena at "9.3 km" when the walk itself passes
 * 28.5 km away, and showed it under the name of one stage of it.
 *
 * So a row is named for the PATH and says which stretch of it passes. The row
 * opens that stretch, because the stretch is the thing with a GPX, a profile
 * and a page; the path is a name the reader recognises.
 */

const KM = (km) => (km < 10 ? km.toFixed(1) : String(Math.round(km)));

// The labels the trail page already uses, so a grade reads the same word in
// both places. Codes the catalogue does not name simply do not render.
const GRADE_KEY = {
  easy: 'trails.gradeEasy', moderate: 'trails.gradeModerate',
  hard: 'trails.gradeHard', very_hard: 'trails.gradeVeryHard',
  alpine: 'trails.gradeAlpine',
};
const SHAPE_KEY = {
  loop: 'trails.shapeLoop', out_back: 'trails.shapeOutBack',
  point: 'trails.shapePoint', figure8: 'trails.shapeFigure8',
};

function Row({ row, t, onOpen }) {
  const dir = t(`dir.${row.dir}`);
  return (
    <li>
      <button
        type="button"
        className="drh-row"
        onClick={() => onOpen?.(row.activity === 'cycling' ? 'cycling' : 'trails', row)}
        disabled={!onOpen}
      >
        <span className="drh-main">
          <span className="drh-name">{row.name}</span>
          <span className="drh-facts">
            <span className="mono">{t('dest.routesPasses', { km: `${KM(row.km)} km`, dir })}</span>
            {row.km_len != null && <span className="mono">{KM(row.km_len)} km</span>}
            {row.ascent_m != null && <span className="mono">{row.ascent_m} m</span>}
            {GRADE_KEY[row.grade] && <span>{t(GRADE_KEY[row.grade])}</span>}
            {SHAPE_KEY[row.shape] && <span>{t(SHAPE_KEY[row.shape])}</span>}
            {row.way && <span className="drh-way">{t('trails.waymarkedShort')}</span>}
          </span>
          {/* The stretch that actually passes, named, so the path and the
              piece of it are never confused for one another. */}
          {row.stage?.name && (
            <span className="drh-stage">{t('dest.routesStretch', { name: row.stage.name })}</span>
          )}
          {row.car_free && (
            <span className="drh-carfree">
              <TrainIcon size={13} />
              {row.access?.name
                ? t('dest.routesAccess', { name: row.access.name })
                : t('dest.routesCarFree')}
            </span>
          )}
        </span>
        <span className="drh-go"><ChevronRightIcon size={12} /></span>
      </button>
    </li>
  );
}

/**
 * Node-network cycling, where the riding is a numbered mesh rather than a
 * set of routes (ROUTES.md R8). The catalogue publishes none of its signed
 * edges as routes, and it is right not to: each is a two kilometre connector
 * between two posts. But a reader in Maastricht shown nothing would conclude
 * there is nothing, so the measurement gets a sentence of its own.
 */
function NodeNetwork({ nn, t }) {
  if (!nn?.km) return null;
  return (
    <div className="drh-nodenet" data-testid="route-nodenet">
      <h4 className="drh-head"><BikeIcon size={14} /> {t('route.nodeNetTitle')}</h4>
      <p className="drh-nn-line">
        {t('route.nodeNetLine', { km: nn.km, radius: nn.radius_km, n: nn.junctions })}
      </p>
      <p className="drh-nn-how">{t('route.nodeNetHow')}</p>
      {nn.nearest?.ref && (
        <p className="drh-nn-how">
          {t('route.nodeNetNearest', { ref: nn.nearest.ref, km: nn.nearest.km })}
        </p>
      )}
    </div>
  );
}

export default function RoutesFromHere({ routes, t, onOpen }) {
  const groups = [
    ['hiking', 'dest.routesHiking', RouteIcon],
    ['cycling', 'dest.routesCycling', BikeIcon],
  ].filter(([k]) => (routes?.[k] || []).length > 0);
  if (!groups.length && !routes?.node_network?.km) return null;

  return (
    <div className="drh">
      {groups.map(([key, label, Icon]) => (
        <div className="drh-group" key={key}>
          <h4 className="drh-head"><Icon size={14} /> {t(label)}</h4>
          <ul className="drh-list">
            {routes[key].map((row) => (
              <Row key={`${key}|${row.id}`} row={row} t={t} onOpen={onOpen} />
            ))}
          </ul>
        </div>
      ))}
      <NodeNetwork nn={routes?.node_network} t={t} />
      {/* Said out loud, because a short list here means thin mapping rather
          than a thin country, and the reader cannot tell those apart. */}
      <p className="drh-note">{t('dest.routesCoverage')}</p>
      <p className="drh-credit">{t('dest.routesCredit')}</p>
    </div>
  );
}
