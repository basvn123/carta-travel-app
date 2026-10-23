import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import NotYet from '../components/NotYet.jsx';
import { swimSafetyRows } from '../lib/waterFacts.js';

/**
 * Swim safety, one block for every sheet that has water (T631). The lake and
 * beach sheets mount it now; the destination Practical tab mounts the same
 * component later (T632 reuses it, it does not rebuild it).
 *
 * Five slots that never disappear: the swimming rule, the water depth, the
 * currents, a swimming ban, and the lifeguards. A slot the wire cannot fill
 * shows the shared placeholder, because "not recorded" is not "safe": a
 * lake with no current on file is a lake nobody wrote a current down for.
 * Below the slots, the hazards the pipeline did record, in the words the lake
 * page already uses (lake.haz*).
 *
 *   rule       'yes' | 'limited' | 'no' | 'unknown' | null   (lake swim.rule)
 *   depthM     the deepest point in metres, or null
 *   hazards    hazard codes, e.g. ['cold_shock']  (lake hazards)
 *   lifeguard  true when a lifeguard is mapped, else null (never false)
 */
export function SwimSafety({ rule = null, depthM = null, hazards = [], lifeguard = null, headingLevel = 3 }) {
  const { t } = useI18n();
  const rows = swimSafetyRows({ rule, depthM, hazards, lifeguard });
  const Heading = `h${headingLevel}`;
  const lines = (hazards || [])
    .filter((code) => code !== 'currents')
    .map((code) => {
      const key = `lake.haz${code.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
      const line = t(key);
      return line && line !== key ? { code, line } : null;
    })
    .filter(Boolean);
  return (
    <div className="ss-block" data-testid="swim-safety">
      <Heading className="dsk-sub">{t('wx.ssHead')}</Heading>
      <dl className="ss-list">
        {rows.map((r) => (
          <div className="bpage-fact" key={r.key} data-testid={`ss-${r.key}`}>
            <dt>{t(r.label)}</dt>
            <dd>{r.value ? t(r.value.key, r.value.params) : <NotYet />}</dd>
          </div>
        ))}
      </dl>
      {lines.length > 0 && (
        <>
          <p className="bpage-note">{t('wx.ssHazards')}</p>
          <ul className="ss-hazards" data-testid="ss-hazards">
            {lines.map((h) => <li key={h.code}>{h.line}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

export default SwimSafety;
