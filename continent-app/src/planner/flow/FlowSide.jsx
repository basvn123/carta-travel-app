import React, { createContext, useId, useMemo, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { ChevronDownIcon } from '../../components/Icons.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { personaFit, personaMatches, picksOf } from '../../lib/recommend/persona.js';

/**
 * Your trip so far (T894, the owner's plan flow studio board 2026-10-30):
 * every answer of the trip in one column beside the question from 1100 px,
 * each a way back to its step, and once travellers are picked how many
 * places fit them with the three that fit best, moving as they are ticked
 * (Kayak's live map, Zillow's count on the button). Below 1100 px the same
 * column folds behind one button over the question (SideFold).
 *
 * The persona screen reports its picks before Continue through
 * PersonaDraft, so the count moves on every tick.
 */
export const PersonaDraft = createContext(null);

/** The places that fit the persona answer, the best three with the pick each fits most. */
export function usePersonaFit(spec) {
  const ctx = useFirstRun();
  const destinations = ctx?.data?.destinations;
  const key = JSON.stringify(spec);
  return useMemo(() => {
    const m = destinations ? personaMatches(spec, destinations, { n: 3 }) : null;
    if (!m) return null;
    const picks = picksOf(spec);
    const top = m.top.map((x) => {
      const by = picks
        .map((p) => ({ id: p.id, v: personaFit(p.id, x.id, destinations) ?? 0 }))
        .sort((a, b) => b.v - a.v)[0]?.id || null;
      return { ...x, d: destinations[x.id], by: picks.length > 1 ? by : null };
    }).filter((x) => x.d);
    return { count: m.count, top };
  }, [key, destinations]); // eslint-disable-line react-hooks/exhaustive-deps -- the spec is read through its key
}

/**
 *   rows   [{ id, label, answer, now, onClick }]
 *   fit    usePersonaFit() or null
 */
export function FlowSide({ rows, fit = null, heading = true }) {
  const { t, lang } = useI18n();
  const nf = useMemo(() => new Intl.NumberFormat(lang), [lang]);
  return (
    <div className="pf-side-in">
      {heading && <h2 className="pf-side-h">{t('pf.side.title')}</h2>}
      <dl className="pf-side-rows">
        {rows.map((r) => (
          <div key={r.id} className={`pf-side-row${r.now ? ' is-now' : ''}`}>
            <dt>{r.label}</dt>
            <dd>
              {r.onClick ? (
                <Button variant="quiet" size="sm" className={`pf-side-val${r.answer ? '' : ' is-none'}`} onClick={r.onClick}>
                  {r.answer || t('pf.side.notYet')}
                </Button>
              ) : (
                <span className={`pf-side-val${r.answer ? '' : ' is-none'}`}>{r.answer || t('pf.side.notYet')}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {fit && (
        <div className="pf-fit" aria-live="polite">
          <p className="pf-fit-n"><b>{nf.format(fit.count)}</b> <span>{t('pf.side.fitUnit')}</span></p>
          {fit.top.length > 0 && (
            <>
              <p className="pf-fit-h">{t('pf.side.lead')}</p>
              <ul className="pf-fit-top">
                {fit.top.map((x) => (
                  <li key={x.id} className="pf-fit-place">
                    <HeroImage url={x.d.image?.url} city={x.d.city} iso2={x.d.iso2} className="pf-fit-img" ratio={[1, 1]} maxWidth={120} />
                    <span className="pf-fit-txt">
                      <b>{x.d.city}</b>
                      {x.by && <small>{t('pf.side.fits', { name: t(`pf.persona.${x.by}`) })}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Your trip so far below 1100 px: one button over the question, the column under it when open. */
export function SideFold({ summary, children }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="pf-fold">
      <Button variant="secondary" className="pf-fold-btn" aria-expanded={open} aria-controls={id}
        iconEnd={<ChevronDownIcon size={16} />} onClick={() => setOpen((v) => !v)}>
        <span className="pf-fold-t">{t('pf.side.title')}</span>
        {summary && <span className="pf-fold-s">{summary}</span>}
      </Button>
      {open && <div className="pf-fold-body" id={id}>{children}</div>}
    </div>
  );
}
