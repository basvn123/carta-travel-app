import React from 'react';
import { loadCoverage } from '../lib/regions.js';
import { useI18n } from '../i18n/index.jsx';
import {
  coverageFacts, coverageSentence, kindCounts, checkedMonth,
} from '../lib/footers.js';

/* The two honest footers (T160). Both are one plain paragraph in the quiet
   credit voice; they say what is true of the data on screen and stop. */

/** Listing footer: what we publish here, what we know of beyond it, and why
 *  some of it is not on the map. Renders nothing until the audit loads, and
 *  nothing when the audit has no row for this layer and country. */
export function CoverageFooter({ layer, cc, countryName }) {
  const { t, lang } = useI18n();
  const [coverage, setCoverage] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    loadCoverage().then((c) => { if (live) setCoverage(c); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const text = React.useMemo(() => {
    const facts = coverageFacts(coverage, layer, cc || '');
    return coverageSentence(t, layer, facts, cc ? (countryName ? countryName(cc) : cc) : '', lang);
  }, [coverage, layer, cc, countryName, t, lang]);
  if (!text) return null;
  return <p className="places-credit cov-foot" data-testid="coverage-footer">{text}</p>;
}

/** Detail footer: "Nine of fourteen figures here are measured..." in digits.
 *  `kinds` is one letter per figure the page shows (m, c or e). Renders
 *  nothing when the page shows no figure. */
export function FigureFooter({ kinds }) {
  const { t, lang } = useI18n();
  const [checked, setChecked] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    loadCoverage().then((c) => { if (live && c?.generated_at) setChecked(c.generated_at); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const n = kindCounts(kinds);
  if (!n.total) return null;
  const month = checkedMonth(checked, lang);
  return (
    <p className="places-credit fig-foot" data-testid="figure-footer">
      {t('fig.foot', { measured: n.m, total: n.total, calculated: n.c, estimated: n.e })}
      {month ? ` ${t('fig.checked', { month })}` : ''}
    </p>
  );
}
