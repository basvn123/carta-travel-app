import React from 'react';
import { Button, Chip, ChipGroup } from '../components/ui/index.js';
import { DownloadIcon } from '../components/Icons.jsx';
import { ClimateStrip } from './ClimateStrip.jsx';
import { DestTrack } from './DestTrack.jsx';
import { DestForecast } from './DestForecast.jsx';
import { NearestLine } from './CoverageEmpty.jsx';
import { Section, DoTile, DoList, SightList, OutdoorTile, TripTile } from './DestTiles.jsx';
import { kindsList } from '../lib/destOverview.js';

/**
 * The destination page's Overview tab (T499, roadmap 1.4,
 * Roadmap/1.4-bestemmingspagina.md part 3): what is here and around it, on
 * one screen and a half. Top to bottom: the key facts; Things to do (top
 * four) or, with none, What to see; Around {city} (one choice chip per kind
 * that has something, the empty kinds in one sentence); the year and this
 * week; on a phone the price card; Take {city} with you. For an area the
 * walks are the reason to go, so Around comes before Things to do (owner
 * answer T491-d).
 *
 * Thin data is the normal case, not an exception (1.4 part 2): a section
 * with nothing in it is not drawn, and a kind with nothing in reach is named
 * once, in one sentence, with the nearest one as a link.
 *
 * `p` is the page's own reading of the dossier (DestinationPage.jsx), so the
 * four tabs never read it two ways.
 */
const OVERVIEW_DO = 4;
const OVERVIEW_AROUND = 6;

function KeyFacts({ facts }) {
  if (!facts.length) return null;
  return (
    <dl className="destp-keys">
      {facts.map((f) => (
        <div className="destp-key" key={f.k}>
          <dt>{f.label}</dt>
          <dd>{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SeeAll({ t, onClick }) {
  return (
    <Button variant="quiet" size="sm" className="dov-all" onClick={onClick}>{t('rail.seeAllPlain')}</Button>
  );
}

/** Things to do, top four; or the sights when the place has no things to
 *  do (Zungoli), as a hairline list, never photo boxes without photos. */
function OverviewDo({ p }) {
  const { t, lang, doRows, doTrack, highlights, monthList, onOpenFeature, goTab } = p;
  if (doRows.length > 0) {
    if (doTrack.length >= 2) {
      return (
        <section className="dsec2 dov-do" id="sec-ov-do" aria-labelledby="h-ov-do">
          <DestTrack
            id="h-ov-do"
            title={t('dest.doTitle')}
            items={doTrack.slice(0, OVERVIEW_DO)}
            t={t}
            onSeeAll={doRows.length > OVERVIEW_DO ? () => goTab('nearby', 'sec-do') : null}
            render={(item) => <DoTile item={item} t={t} monthList={monthList} onOpenFeature={onOpenFeature} />}
          />
        </section>
      );
    }
    return (
      <Section id="ov-do" title={t('dest.doTitle')} className="dov-do">
        <DoList items={doRows.slice(0, OVERVIEW_DO)} t={t} monthList={monthList} onOpenFeature={onOpenFeature} />
        {doRows.length > OVERVIEW_DO && <SeeAll t={t} onClick={() => goTab('nearby', 'sec-do')} />}
      </Section>
    );
  }
  if (!highlights.length) return null;
  return (
    <Section id="ov-see" title={t('dest.whatToSee')} className="dov-do">
      <SightList items={highlights.slice(0, OVERVIEW_DO)} lang={lang} />
      {highlights.length > OVERVIEW_DO && <SeeAll t={t} onClick={() => goTab('nearby', 'sec-highlights')} />}
    </Section>
  );
}

/** "No trail, peak, lake or beach within 20 km of Zungoli.", then the
 *  nearest one as a link (NearestLine), searched only for the empty kinds. */
export function EmptyKinds({ p }) {
  const { t, lang, city, emptyKinds, aroundKm, destination, lat, lon, onOpenFeature } = p;
  if (!emptyKinds.length) return null;
  const things = kindsList(emptyKinds.map((c) => t(`dest.aroundNoun.${c.key}`)), lang);
  return (
    <NearestLine
      noneKey="dest.aroundEmpty"
      noneVars={{ things, city, km: aroundKm }}
      layers={emptyKinds.map((c) => c.loader)}
      cc={destination.iso2}
      from={lat != null && lon != null ? { lat, lon } : null}
      radiusKm={aroundKm}
      onOpen={onOpenFeature ? (l, row) => onOpenFeature(l, { id: row.id, cc: row.cc }) : null}
    />
  );
}

/** Around {city}: one choice chip per kind that has something, the fullest
 *  chosen on arrival (owner answer T491-e), its best six as tiles. */
function OverviewAround({ p }) {
  const { t, city, cats, aroundKey, setAroundKey, onOpenFeature, onSelect, onOpenItin, goTab } = p;
  const shown = cats.filter((c) => c.count > 0);
  const cur = shown.find((c) => c.key === aroundKey) || shown[0] || null;
  const title = t('dest.aroundTitle', { city });
  if (!cur) {
    if (!p.emptyKinds.length) return null;
    return (
      <Section id="ov-around" title={title} className="dov-around">
        <EmptyKinds p={p} />
      </Section>
    );
  }
  const chips = (
    <ChipGroup label={t('dest.aroundChipsAria', { city })} className="dov-chips">
      {shown.map((c) => (
        <Chip key={c.key} kind="choice" selected={c.key === cur.key} onClick={() => setAroundKey(c.key)}>
          {t(`dest.aroundKind.${c.key}`)}
        </Chip>
      ))}
    </ChipGroup>
  );
  return (
    <section className="dsec2 dov-around" id="sec-ov-around" aria-labelledby="h-ov-around">
      <DestTrack
        key={cur.key}
        id="h-ov-around"
        title={title}
        lead={chips}
        items={cur.rows.slice(0, OVERVIEW_AROUND)}
        t={t}
        onSeeAll={cur.count > OVERVIEW_AROUND ? () => goTab('nearby', `sec-around-${cur.key}`) : null}
        render={(row) => (cur.key === 'trips'
          ? <TripTile tr={row} t={t} onSelect={onSelect} onOpenItin={onOpenItin} />
          : <OutdoorTile f={row} t={t} onOpenFeature={onOpenFeature} />)}
      />
      <EmptyKinds p={p} />
    </section>
  );
}

/** The year and this week: the month strip, compact, and the 7-day
 *  forecast; the strip with every figure is on When to go. */
function OverviewYear({ p }) {
  const { t, lang, destination, monthPick, forecast, goTab } = p;
  const hasClimate = !!destination.climate?.m;
  if (!hasClimate && forecast === null) return null;
  return (
    <Section id="ov-year" title={t('dest.yearTitle')} className="dov-year">
      <div className="dov-year-grid">
        {hasClimate && (
          <div className="dov-months">
            <ClimateStrip climate={destination.climate} month={monthPick} compact />
            <Button variant="quiet" size="sm" className="dov-all" onClick={() => goTab('when')}>
              {t('dest.seeMonths')}
            </Button>
          </div>
        )}
        <DestForecast forecast={forecast} t={t} lang={lang} headingId="h-ov-week" />
      </div>
    </Section>
  );
}

/** Take {city} with you: the PDF, a secondary; the page's one primary stays
 *  "Plan a trip here". The pass sheet appears on tap, never as a hint here
 *  (owner answer T491-f). */
function TakeAway({ p }) {
  const { t, city, exportPdf, pdfBusy, pdfReady } = p;
  return (
    <Section id="ov-take" title={t('dest.takeTitle', { city })} className="dov-take">
      <p className="dov-take-lead">{t('dest.takeLead')}</p>
      <Button variant="secondary" className="destp-pdf" onClick={exportPdf} disabled={pdfBusy || !pdfReady}
        loading={pdfBusy} iconStart={<DownloadIcon size={16} />}>
        {pdfBusy ? t('dest.pdfBuilding') : t('dest.pdf')}
      </Button>
    </Section>
  );
}

export function DestOverview({ p }) {
  const things = <OverviewDo p={p} />;
  const around = <OverviewAround p={p} />;
  return (
    <>
      <KeyFacts facts={p.keyFacts} />
      {p.area ? <>{around}{things}</> : <>{things}{around}</>}
      <OverviewYear p={p} />
      {p.priceCard && <div className="dov-price">{p.priceCard}</div>}
      <TakeAway p={p} />
    </>
  );
}
