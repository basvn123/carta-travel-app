import React from 'react';
import { Button } from '../../components/ui/index.js';
import { CheckIcon } from '../../components/Icons.jsx';

/**
 * The step list beside a question from 1100 px (T893, the owner's plan
 * flow studio board 2026-10-30): the steps in named groups, a tick and the
 * answer under each one done, the one in hand marked. A step with an
 * onClick opens it; the others wait their turn. Named steps rather than a
 * bar: a steady progress bar does not keep people in a questionnaire
 * (Villar, Callegaro and Yang 2013), knowing what is next does.
 *
 *   groups   [{ key, label, items: [{ id, n, label, answer, done, now, onClick }] }]
 */
export function FlowRail({ groups, label }) {
  return (
    <nav className="pf-rail-in" aria-label={label}>
      {groups.map((g) => (
        <div className="pf-rail-g" key={g.key}>
          {g.label && <p className="pf-rail-h">{g.label}</p>}
          <ol className="pf-rail-list">
            {g.items.map((it) => (
              <li key={it.id}>
                <Button
                  variant="quiet"
                  className={`pf-rail-step${it.now ? ' is-now' : it.done ? ' is-done' : ''}`}
                  aria-current={it.now ? 'step' : undefined}
                  disabled={!it.onClick && !it.now}
                  onClick={it.onClick || undefined}
                >
                  <span className="pf-rail-dot" aria-hidden="true">{it.done && !it.now ? <CheckIcon size={12} /> : it.n}</span>
                  <span className="pf-rail-txt">
                    <span className="pf-rail-name">{it.label}</span>
                    {it.answer && <span className="pf-rail-ans">{it.answer}</span>}
                  </span>
                </Button>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </nav>
  );
}
