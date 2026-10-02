import React, { useId, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { InfoIcon } from './Icons.jsx';

/* Two structured values for the journey facts list. Both keep the long prose
   out of the row and put it behind the same small info button the month strip
   uses (.mstrip-info), so a fact stays a fact. */

function InfoToggle({ label, children }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        className="mstrip-info"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <InfoIcon size={16} />
      </button>
      <div id={panelId} className="mstrip-panel fmeter-panel" hidden={!open}>
        {children}
      </div>
    </>
  );
}

/* Five segments, filled up to `level`, then "Active 3/5" in mono. The note
   opens from the info button. */
export function DifficultyMeter({ level, label, note }) {
  const { t } = useI18n();
  const n = Math.max(0, Math.min(5, Math.round(Number(level) || 0)));
  return (
    <div className="fmeter">
      <div className="fmeter-row">
        {n > 0 && (
          <span
            className="fmeter-segs"
            role="img"
            aria-label={t('journey.diffMeter', { n })}
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <span key={i} className={`fmeter-seg${i <= n ? ' is-on' : ''}`} />
            ))}
          </span>
        )}
        <span className="fmeter-text mono">{n > 0 ? `${label} ${n}/5` : label}</span>
        {note && <InfoToggle label={t('journey.diffWhy')}>{note}</InfoToggle>}
      </div>
    </div>
  );
}

/* One line per airport: code in mono, name, then the transfer. `more` is the
   original text, shown behind the info button when the rows alone would lose
   something. */
export function GatewayList({ rows, more }) {
  const { t } = useI18n();
  return (
    <div className="fgate">
      <ul className="fgate-rows">
        {rows.map((r, i) => (
          <li key={`${r.code}-${i}`} className="fgate-row">
            <span className="fgate-code mono">{r.code}</span>
            <span className="fgate-name">{r.name}</span>
            {r.detail && <span className="fgate-detail mono">{r.detail}</span>}
          </li>
        ))}
      </ul>
      {more && <InfoToggle label={t('journey.gatewayMore')}>{more}</InfoToggle>}
    </div>
  );
}
