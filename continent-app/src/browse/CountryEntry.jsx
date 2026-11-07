import React from 'react';
import { fmtDate } from '../lib/dates.js';
import { entryLine, entryRowsFor, loadEntryRules } from '../lib/entryRules.js';

/**
 * "Check before you go" on the country page (T1199, ROADMAP D19).
 *
 * Four lines, one per traveller group (EU, UK, US and other visa free, visa
 * required): what to carry and what to do before the trip, in short neutral
 * words, each with the official page it rests on and the date it was
 * checked. Then the official travel advice for the country (GOV.UK, written
 * for British travellers, with its own update date). A pointer, never a
 * paraphrase: the lead says the rules can change and to read the page.
 *
 * Renders nothing until the file has loaded, and nothing for a country the
 * file does not hold.
 */
export function CountryEntry({ iso2, country, t }) {
  const [doc, setDoc] = React.useState(null);
  React.useEffect(() => {
    let live = true;
    loadEntryRules().then((d) => { if (live) setDoc(d); });
    return () => { live = false; };
  }, []);
  const data = entryRowsFor(doc, iso2);
  if (!data) return null;
  const { rows, advice } = data;
  const headId = `cpg-entry-${iso2}`;
  return (
    <section className="rgnp-sect cpg-entry" aria-labelledby={headId}>
      <h2 className="rgnp-sect-head" id={headId}>{t('entry.head')}</h2>
      <p className="cpg-entry-lead">{t('entry.lead')}</p>
      <dl className="cpg-entry-list">
        {rows.map((r) => (
          <div key={r.group} className="cpg-entry-row">
            <dt>{t(`entry.group.${r.group}`)}</dt>
            <dd>
              <span className="cpg-entry-need">{entryLine(r, t)}</span>
              {r.src && r.url && (
                <a className="cpg-entry-src" href={r.url} target="_blank" rel="noreferrer">
                  {t('entry.checked', { source: t(`entry.src.${r.src}`), date: fmtDate(r.checked) })}
                </a>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {advice && advice.url && (
        <p className="cpg-entry-advice">
          <a href={advice.url} target="_blank" rel="noreferrer">{t('entry.advice', { country })}</a>
          <span>
            {advice.updated
              ? t('entry.adviceByUpdated', { date: fmtDate(advice.updated) })
              : t('entry.adviceBy', { date: fmtDate(advice.checked) })}
          </span>
        </p>
      )}
    </section>
  );
}
