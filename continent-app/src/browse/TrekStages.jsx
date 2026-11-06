import React from 'react';
import { ChevronRightIcon } from '../components/Icons.jsx';
import { trekTotals } from '../lib/treks.js';
import { Stages } from './RouteParts.jsx';
import { Button } from '../components/ui/index.js';

/**
 * One multi-stage trek on a trail page (T1184, ROADMAP D24): the whole walk
 * as a list of its published stages in order, with the totals a traveller
 * plans a multi-day trip by. Shown on every stage's page, where it says
 * which stage this is, and on the trek's own published parent row.
 *
 * The record is pipeline/trails/treks.py's: `stages` are only the stages
 * Carta publishes, so the count is "published stages", never a claim about
 * the whole path, and a gap in the numbering is said out loud.
 *
 * Renders through the shared Stages list (RouteParts.jsx), so it reads as
 * the same kind of list as the relation's own Stages block; a stage opens
 * its page when its country file is loaded, else it is a plain line.
 */
export function TrekStages({ trek, currentId = null, t, lang = 'en', onOpenStage = null, canOpen = () => false, onOpenWhole = null }) {
  if (!trek || !Array.isArray(trek.stages) || trek.stages.length < 2) return null;
  const tot = trekTotals(trek);
  const nf = (v) => Math.round(v).toLocaleString(lang);
  const here = trek.stages.find((s) => String(s.id) === String(currentId));
  const byId = new Map(trek.stages.map((s) => [String(s.id), s]));
  const isHere = (id) => Boolean(here) && String(id) === String(here.id);
  // Under each stage's name: its distance and climb, and "this stage" on
  // the one being read.
  const stageSub = (s) => [
    Number.isFinite(s.km) ? t('trek.km', { km: s.km.toLocaleString(lang) }) : '',
    Number.isFinite(s.up) && s.up > 0 ? t('trek.up', { m: nf(s.up) }) : '',
    isHere(s.id) ? t('trek.here') : '',
  ].filter(Boolean).join(', ');
  const totalLine = [
    t('trek.stages', { n: tot.n }),
    tot.km > 0 ? t('trek.km', { km: nf(tot.km) }) : '',
    tot.up > 0 ? t('trek.up', { m: nf(tot.up) }) : '',
  ].filter(Boolean).join(', ');
  return (
    <div className="pt-block" data-testid="trek-stages" data-trek={trek.id}>
      <h3 className="pt-block-title">{trek.name}</h3>
      <p className="pt-muted" data-testid="trek-total">
        {here ? `${t('trek.thisStage', { i: here.i })}. ` : ''}
        {totalLine}. {t('trek.days', { n: tot.days })}
      </p>
      <div aria-label={t('trek.listLabel', { name: trek.name })} role="group">
        <Stages
          stages={trek.stages.map((s) => ({ id: s.id, i: s.i, name: s.name, sub: stageSub(s) }))}
          t={t}
          canOpen={(id) => !isHere(id) && Boolean(onOpenStage) && canOpen(byId.get(String(id)))}
          onOpenRoute={onOpenStage ? (id) => onOpenStage(byId.get(String(id))) : null}
        />
      </div>
      {onOpenWhole && (
        <Button variant="quiet" size="sm" onClick={onOpenWhole} iconEnd={<ChevronRightIcon size={12} />}
          data-testid="trek-whole">
          {t('trek.openWhole')}
        </Button>
      )}
      {tot.missing.length > 0 && (
        <p className="pt-muted" data-testid="trek-missing">
          {t('trek.missing', { list: tot.missing.join(', ') })}
        </p>
      )}
    </div>
  );
}
