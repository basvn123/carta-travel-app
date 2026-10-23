import React from 'react';
import { Button } from '../components/ui/index.js';
import { DownloadIcon } from '../components/Icons.jsx';
import { loadTrail } from '../lib/trails.js';
import { loadCycleRoute, gpxCredit } from '../lib/cycling.js';
import {
  trailGpx, trailFileBase, trailShareUrl, cycleGpx, cycleFileBase, lineParts,
  shareOrDownloadFile,
} from '../lib/trailExport.js';
import { routePageUrlHere } from '../lib/routeLinks.js';

/**
 * One-click GPX for every route the destination sheet lists (T632), in the
 * "Take {city} with you" block next to the PDF. The route is fetched on the
 * click, not with the page: a destination lists up to a dozen routes and
 * the geometry is the heavy part. Peaks, lakes and beaches have no route
 * line on the wire, so there is nothing to export for them.
 */
const CAP = 12;

async function gpxFor(activity, row) {
  if (activity === 'cycling') {
    const route = await loadCycleRoute(row.id);
    const parts = lineParts(route?.osm?.geometry);
    if (!parts.length) return null;
    const name = route.name || route.osm?.name || row.name;
    return {
      text: cycleGpx({
        name, tracks: [{ name, lines: parts }], credit: gpxCredit(route),
        link: routePageUrlHere('cycling', row),
      }),
      base: cycleFileBase(name, route.id),
      name,
    };
  }
  const detail = await loadTrail(row.id);
  if (!detail?.geometry) return null;
  return {
    text: trailGpx(detail, detail, { link: trailShareUrl({ id: detail.id, country: row.cc }) }),
    base: trailFileBase(detail),
    name: detail.name || row.name,
  };
}

export function DestRouteGpx({ routes, t }) {
  const [busy, setBusy] = React.useState(null);
  const [msg, setMsg] = React.useState(null);
  const rows = [
    ...(routes?.hiking || []).map((r) => ({ activity: 'hiking', r })),
    ...(routes?.cycling || []).map((r) => ({ activity: 'cycling', r })),
  ].filter(({ r }) => Number.isInteger(Number(r.id)) && r.name).slice(0, CAP);

  const go = async (activity, r) => {
    const key = `${activity}:${r.id}`;
    setBusy(key);
    setMsg(null);
    try {
      const got = await gpxFor(activity, r);
      if (!got) { setMsg(t('dest.gpxFailed')); return; }
      const how = await shareOrDownloadFile(got.base, got.text, 'gpx', got.name);
      if (how !== 'shared') setMsg(t('trails.savedGpx'));
    } catch {
      setMsg(t('dest.gpxFailed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dov-gpx" data-testid="dest-gpx">
      <h3 className="destp-subhead">{t('dest.gpxTitle')}</h3>
      {rows.length > 0 && (
        <ul className="ddo-list">
          {rows.map(({ activity, r }) => (
            <li key={`${activity}:${r.id}`}>
              <Button variant="quiet" block className="ddo-list-row" data-testid="dest-gpx-btn"
                onClick={() => go(activity, r)} loading={busy === `${activity}:${r.id}`}
                iconStart={<DownloadIcon size={16} />}
                aria-label={t('dest.gpxFor', { name: r.name })}>
                {r.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="xp-source" role="status">{msg || t('dest.gpxNote')}</p>
    </div>
  );
}
