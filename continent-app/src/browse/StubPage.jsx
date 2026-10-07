import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { DetailPage } from './DetailSkeleton.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { UploadForm } from '../community/UploadForm.jsx';
import { stubLink } from '../lib/stubs.js';
import { stripDashes } from '../lib/format.js';

/**
 * The honest stub (T124, destinations spec 6.5): the page for a famous walk
 * Carta knows of and cannot build from open data.
 *
 * It says what the walk is (name, region, how well known), what is known
 * about it (only what the registry holds, so a missing length is simply not
 * printed), that no open route data exists yet, and where to get the track:
 * one outbound link and the same GPX upload door the trail page has. It rides
 * the shared detail skeleton, so it opens, closes and focuses like the other
 * five pages; the skeleton's own hero, map and rating slots stay empty, which
 * is the point: nothing here is scored or drawn, because nothing is known.
 */
export function StubPage({ stub, countryName, onClose }) {
  const { t, lang } = useI18n();
  const link = stubLink(stub);
  const nf = (v) => new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(v);
  const name = stripDashes(stub.name);
  const facts = [];
  if (Number.isFinite(stub.km)) {
    facts.push({ k: 'km', label: t('stub.fact.length'), value: `${new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(stub.km)} km` });
  }
  if (Number.isFinite(stub.readers) && stub.readers > 0) {
    facts.push({ k: 'readers', label: t('stub.fact.readers'), value: nf(stub.readers) });
  }
  if (Number.isFinite(stub.langs) && stub.langs > 0) {
    facts.push({ k: 'langs', label: t('stub.fact.langs'), value: nf(stub.langs) });
  }
  facts.push({ k: 'osm', label: t('stub.fact.osm'), value: t(stub.in_osm ? 'stub.yes' : 'stub.no') });

  return (
    <DetailPage
      name={name}
      className="stub-page"
      testId="stub-page"
      backLabel={t('trails.back')}
      onClose={onClose}
      resetKey={stub.id}
      head={(
        <>
          <h1 className="bpage-name">
            <CountryFlag country={stub.cc} size={15} className="bpage-flag" />
            {name}
          </h1>
          <p className="dsk-crumb">{[stub.region, countryName(stub.cc)].filter(Boolean).join(', ')}</p>
        </>
      )}
      hook={t('stub.line')}
      signature={(
        <>
          <h2 className="stub-h">{t('stub.known')}</h2>
          <dl className="stub-facts">
            {facts.map((f) => (
              <div key={f.k} className="stub-fact">
                <dt>{f.label}</dt>
                <dd className="mono">{f.value}</dd>
              </div>
            ))}
          </dl>
          <h2 className="stub-h">{t('stub.where')}</h2>
          <div className="stub-acts">
            {link && (
              <a
                className="tpage-act"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="stub-link"
              >
                <span>{t(`stub.link.${link.kind}`)}</span>
              </a>
            )}
            <UploadForm layer="trail" itemId={stub.id} initialKind="track" openKey="stub.upload" />
          </div>
          <p className="stub-note">{t('stub.note')}</p>
          {/* The page's one credit, said in the open: a "Where this comes
              from" fold that opened onto this line alone, and a "Getting
              there" section with the skeleton's generic note, said nothing
              about a walk that has no start point (T124-f). */}
          <p className="stub-note stub-credit">{t('stub.credit')}</p>
        </>
      )}
      gettingThere={false}
      sources={false}
    />
  );
}

export default StubPage;
