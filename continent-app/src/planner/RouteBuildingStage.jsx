import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import {
  SearchIcon, StarIcon, RouteIcon, ClockIcon, CheckIcon,
} from '../components/Icons.jsx';

/**
 * RouteBuildingStage, what the chat planner shows while a day is being built.
 *
 * It replaces a three-dot typing bubble, which said only "something is
 * happening" for the ten to thirty seconds a build takes, and said it in the
 * vocabulary of a messaging app rather than of a routing engine.
 *
 * Two halves, both literal:
 *
 *   The survey. A route drawing itself across a faint grid, stop by stop, with
 *   the head of the line leading. It is the shape of the thing being made, not
 *   a decorative loader, so the wait previews the answer.
 *
 *   The log. The actual steps, in order, each one a real operation with real
 *   numbers in it: how many places were read, how many survived the answers,
 *   then the three passes the server runs (re-ordering the walk, timing the
 *   stops, trimming to the walking budget). Nothing here is invented progress:
 *   the first three lines are reported by the caller as they happen, and the
 *   last two only start once the sequencing request is genuinely in flight.
 *
 *   stages     [{ key, vars }] milestones reported so far by the caller
 *   reworking  true when this is a refinement of an existing route
 */

// The order the work actually happens in. `read` and `shortlist` are the
// client's own two passes; `route`, `time` and `fit` all happen inside the
// one plan-day call, so they advance on a cadence once that call goes out.
const ORDER = [
  { key: 'read', Icon: SearchIcon },
  { key: 'shortlist', Icon: StarIcon },
  { key: 'route', Icon: RouteIcon },
  { key: 'time', Icon: ClockIcon },
  { key: 'fit', Icon: CheckIcon },
];
// How long each server-side line holds the "running" state before the next
// one starts. Slow enough to read, fast enough that a 20-second build never
// looks stalled.
const SERVER_LINE_MS = 2100;

// The route the line draws, and the stops on it. Wide and shallow on purpose:
// a squarer canvas made the animation the tallest thing in the conversation,
// which is the wrong weight for something that exists to fill a wait.
const ROUTE_D = 'M28 92 C 56 66, 88 48, 120 40 S 180 60, 216 74 S 282 46, 320 32 S 400 52, 452 66';
const NODES = [
  { x: 28, y: 92 },
  { x: 120, y: 40 },
  { x: 216, y: 74 },
  { x: 320, y: 32 },
  { x: 452, y: 66 },
];
const DRAW_MS = 2800;

export function RouteBuildingStage({ stages = [], reworking = false }) {
  const { t } = useI18n();
  // Lines the caller has reported. The third ("route") means the request is
  // out, which is when the server-side cadence is allowed to start.
  const reported = Math.min(stages.length, 3);
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    if (reported < 3) return undefined;
    const id = setInterval(
      () => setExtra((n) => Math.min(ORDER.length - 3, n + 1)),
      SERVER_LINE_MS,
    );
    return () => clearInterval(id);
  }, [reported]);

  const shown = Math.min(ORDER.length, reported + extra);

  // The card grows a line at a time, including on its own timer, so it keeps
  // its own foot in view rather than sliding out of the scroller.
  const footRef = useRef(null);
  useEffect(() => {
    footRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [shown]);

  const varsFor = (key) => {
    const hit = stages.find((s) => s.key === key);
    if (hit) return hit.vars || {};
    // The walking budget is reported with the `route` line and reused by the
    // trim line, which is the same number doing the same job.
    if (key === 'fit') return stages.find((s) => s.key === 'route')?.vars || {};
    return {};
  };

  return (
    <div className="rbs" role="status" aria-live="polite">
      <div className="rbs-head">
        <span className="rbs-title">{t(reworking ? 'chat.reworking' : 'chat.building')}</span>
      </div>

      <div className="rbs-canvas">
        <svg viewBox="0 0 480 120" className="rbs-svg" aria-hidden="true">
          <defs>
            {/* The grid's colour is set on the pattern's own path, not on the
                rect that references it: pattern content takes its colour from
                the pattern's ancestors, so currentColor on the rect resolved
                to body ink and drew survey paper in navy. */}
            <pattern id="rbs-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path className="rbs-grid-line" d="M30 0 L0 0 0 30" fill="none" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="480" height="120" fill="url(#rbs-grid)" className="rbs-grid" />
          {/* The ghost is the whole corridor being considered; the live line is
              the route that won. */}
          <path id="rbs-path" className="rbs-ghost" d={ROUTE_D} fill="none" />
          <path className="rbs-line" pathLength="1" d={ROUTE_D} fill="none" />
          {/* Each stop lands as the line reaches it. The timing lives in its
              own keyframes rather than in an animation-delay: a delayed loop
              runs on its own phase, so late stops stayed lit through the next
              redraw. */}
          {NODES.map((n, i) => (
            <g key={i} className={`rbs-node rbs-node-${i}`}>
              <circle cx={n.x} cy={n.y} r="9" className="rbs-node-halo" />
              <circle cx={n.x} cy={n.y} r="5" className="rbs-node-dot" />
            </g>
          ))}
          {/* The head of the line, riding the same path the line draws. */}
          <circle r="4.5" className="rbs-head-dot">
            {/* Held at the last stop for the tail of the cycle, so the head
                and the drawn line finish together. */}
            <animateMotion dur={`${DRAW_MS}ms`} repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.86;1" calcMode="linear">
              <mpath href="#rbs-path" />
            </animateMotion>
          </circle>
        </svg>
      </div>

      <ol className="rbs-log">
        {/* Nothing measured yet, so nothing is claimed yet: the opening line
            carries no numbers rather than showing empty placeholders where
            the counts will land. */}
        {shown === 0 ? (
          <li className="rbs-line-row now">
            <span className="rbs-line-ico"><SearchIcon size={12} /></span>
            <span className="rbs-line-text">{t('chat.stagePrep')}</span>
          </li>
        ) : ORDER.slice(0, shown).map((line, i) => {
          const done = i < shown - 1;
          const Icon = line.Icon;
          return (
            <li key={line.key} className={`rbs-line-row${done ? ' done' : ' now'}`}>
              <span className="rbs-line-ico">
                {done ? <CheckIcon size={12} /> : <Icon size={12} />}
              </span>
              <span className="rbs-line-text">{t(`chat.stage${line.key[0].toUpperCase()}${line.key.slice(1)}`, varsFor(line.key))}</span>
            </li>
          );
        })}
      </ol>
      <div ref={footRef} />
    </div>
  );
}
