import React from 'react';
import { SheetShell } from './SheetShell.jsx';
import {
  Button, Chip, ChipGroup, IconButton, Switch, Tabs, Tile, TileGroup,
} from '../components/ui/index.js';
import {
  BeachIcon, BootIcon, CameraIcon, CastleIcon, CloseIcon, CompassIcon, DiningIcon, FamilyIcon,
  HeartIcon, LakeIcon, LeafIcon, LotusIcon, MedalIcon, MoonIcon, MountainIcon, MuseumIcon,
  PalmIcon, SearchIcon, SkylineIcon, SparkIcon, TownIcon, TreeIcon, VillageIcon,
} from '../components/Icons.jsx';
import { loadGuidedData } from '../lib/guidedData.js';
import { loadSearchIndex } from '../lib/searchIndex.js';
import {
  EXTRAS, NEAR_KM, buildVocab, completions, liveExamples, partsToFacets,
} from '../lib/guidedSearch.js';

/**
 * The guided search (T442): the owner asked for a search people would use,
 * free, that only lets a traveller ask what Carta can answer.
 *
 * Closed, a field-shaped button that reads back the question ("Hiking base,
 * Alps, July") with a clear control beside it; on a desktop it sits in the
 * header, on a phone at the top of Explore. Open, a panel (anchored under
 * the field on a desktop, a sheet on a phone) with:
 *
 *   - one field that reads a typed question and offers only answerable
 *     completions, across all five slots (a combobox); a word Carta cannot
 *     place is named ("Carta can't search for "skiing" yet") and never
 *     applied
 *   - "Try one": example questions that return places today
 *   - five slots, label over value, never a built sentence (so the grammar
 *     holds in six languages): What (the vibes), Where (an area, a country,
 *     or within 50 km of a place), When, Budget, Extras
 *
 * Every choice writes Explore's own filters (see lib/guidedSearch.js), so
 * the list behind the panel, its chips, the map and a shared link follow at
 * once. The panel's one primary closes it onto that list.
 */

const SLOTS = ['what', 'where', 'when', 'budget', 'extras'];

export const VIBE_ICONS = {
  quiet: LeafIcon, oldtown: TownIcon, food: DiningIcon, romantic: HeartIcon, family: FamilyIcon,
  beach: BeachIcon, island: PalmIcon, mountain: MountainIcon, hiking: BootIcon, lake: LakeIcon,
  castles: CastleIcon, art: MuseumIcon, nightlife: MoonIcon, nature: TreeIcon, views: CameraIcon,
  spa: LotusIcon, city: SkylineIcon, village: VillageIcon, unesco: MedalIcon, adventure: CompassIcon,
};

const AREA_GROUPS = [['mountains', 'gs.areaMountains'], ['coast', 'gs.areaCoast'], ['region', 'gs.areaRegion']];

/** The question as short labels, in slot order. */
export function facetLabels(f, labels, nearRow, t) {
  const out = [];
  if (f.vibe) out.push(labels.vibe(f.vibe));
  if (f.area) out.push(labels.area(f.area));
  else if (f.country) out.push(labels.country(f.country));
  else if (f.near && nearRow) out.push(t('gs.near', { place: nearRow.city }));
  if (f.month) out.push(labels.month(f.month));
  if (f.budget) out.push(labels.budget(f.budget));
  if (f.sort === 'cost') out.push(t('gs.cheapest'));
  for (const x of f.nb || []) out.push(labels.extra(x));
  if (f.nocar) out.push(labels.extra('nocar'));
  if (f.quiet) out.push(labels.extra('quiet'));
  return out;
}

export function GuidedSearch({
  t, lang, guided, rows, countries, facets, nearRow, labels, empty = false,
  budgetSteps, onApply, onOpenPlace, inHeader = false,
}) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const [active, setActive] = React.useState(0);
  const [slot, setSlot] = React.useState('what');
  const [index, setIndex] = React.useState(null);
  const triggerRef = React.useRef(null);
  const inputRef = React.useRef(null);

  // The vocabulary's sources load on the first open (the guided data is
  // usually in already: Explore loads it on idle).
  React.useEffect(() => {
    if (!open) return;
    loadGuidedData();
    if (!index) loadSearchIndex().then((ix) => setIndex(ix || {}));
  }, [open, index]);

  const vocab = React.useMemo(
    () => (open && guided ? buildVocab({ t, lang, guided, rows, countries, index }) : null),
    [open, guided, rows, countries, index, t, lang],
  );
  const result = React.useMemo(
    () => (vocab && text.trim() ? completions(text, vocab, lang) : null),
    [vocab, text, lang],
  );
  const options = result?.options || [];
  React.useEffect(() => { setActive(0); }, [text]);

  const examples = React.useMemo(
    () => (open && guided ? liveExamples(rows, { guided, nearRow: null }) : []),
    [open, guided, rows],
  );

  const summary = facetLabels(facets, labels, nearRow, t);
  const hasFacets = summary.length > 0;
  const nearName = (id) => rows.find((p) => p.id === id)?.city || id;

  const partLabel = (p) => {
    if (p.kind === 'near') return t('gs.near', { place: p.label });
    if (p.kind === 'budget') return labels.budget(p.value);
    if (p.kind === 'month') return labels.month(p.value);
    return p.label;
  };
  const optionSlot = (o) => {
    if (o.open) return t('gs.openPage');
    // A question of two or more parts reads as a search, not as its last slot.
    if (!o.entry || o.parts.length > 1) return t('gs.applyAll');
    return t(`gs.${o.entry.slot === 'extras' ? 'extras' : o.entry.slot}`);
  };

  const choose = (o) => {
    if (!o) return;
    if (o.open) {
      setOpen(false);
      onOpenPlace(o.open);
      return;
    }
    onApply(partsToFacets(o.parts, budgetSteps));
    setText('');
  };
  const onKeyDown = (e) => {
    if (!options.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); }
    if (e.key === 'Enter') { e.preventDefault(); choose(options[active] || options[0]); }
  };

  const listOpen = options.length > 0;
  const where = facets.area ? `a:${facets.area}` : facets.country ? `c:${facets.country}` : facets.near ? `n:${facets.near}` : '';
  const setWhere = (key) => {
    const [k, v] = key ? key.split(':') : [];
    onApply({ area: k === 'a' ? v : null, country: k === 'c' ? v : null, near: k === 'n' ? v : null });
  };
  const toggleNb = (x, on) => {
    const nb = new Set(facets.nb || []);
    if (on) nb.add(x); else nb.delete(x);
    onApply({ nb: [...nb] });
  };

  const slotValue = (s) => {
    if (s === 'what') return facets.vibe ? labels.vibe(facets.vibe) : t('gs.any');
    if (s === 'where') {
      if (facets.area) return labels.area(facets.area);
      if (facets.country) return labels.country(facets.country);
      if (facets.near) return t('gs.near', { place: nearName(facets.near) });
      return t('gs.anywhere');
    }
    if (s === 'when') return facets.month ? labels.month(facets.month) : t('gs.any');
    if (s === 'budget') {
      const parts = [facets.budget && labels.budget(facets.budget), facets.sort === 'cost' && t('gs.cheapest')].filter(Boolean);
      return parts.length ? parts.join(', ') : t('gs.any');
    }
    const n = (facets.nb || []).length + (facets.nocar ? 1 : 0) + (facets.quiet ? 1 : 0);
    return n ? facetLabels({ nb: facets.nb, nocar: facets.nocar, quiet: facets.quiet }, labels, null, t).join(', ') : t('gs.none');
  };

  const countryList = React.useMemo(() => {
    const list = (countries || []).map(([iso2]) => [iso2, labels.country(iso2)]);
    return list.sort((a, b) => a[1].localeCompare(b[1], lang));
  }, [countries, labels, lang]);

  const panel = {
    what: (
      <TileGroup label={t('gs.what')} kind="choice" columns={4} className="gs-vibes">
        <Tile kind="choice" icon={<SparkIcon size={20} />} selected={!facets.vibe} onClick={() => onApply({ vibe: null })}>
          {t('gs.any')}
        </Tile>
        {(guided?.vibes || []).map((v) => {
          const Icon = VIBE_ICONS[v.id] || SparkIcon;
          return (
            <Tile key={v.id} kind="choice" icon={<Icon size={20} />} selected={facets.vibe === v.id}
              onClick={() => onApply({ vibe: facets.vibe === v.id ? null : v.id })}>
              {labels.vibe(v.id)}
            </Tile>
          );
        })}
      </TileGroup>
    ),
    where: (
      <div className="gs-where">
        <div className="gs-chips">
          <Chip selected={!where} onClick={() => setWhere('')}>{t('gs.anywhere')}</Chip>
          {facets.near && (
            <Chip selected onClick={() => setWhere('')}>{t('gs.near', { place: nearName(facets.near) })}</Chip>
          )}
        </div>
        <p className="gs-hint">{t('gs.nearHint', { km: NEAR_KM })}</p>
        {AREA_GROUPS.map(([kind, key]) => (
          <section key={kind} className="gs-group" aria-labelledby={`gs-h-${kind}`}>
            <h3 className="gs-h" id={`gs-h-${kind}`}>{t(key)}</h3>
            <div className="gs-chips">
              {(guided?.areas || []).filter((a) => a.kind === kind).map((a) => (
                <Chip key={a.id} selected={facets.area === a.id}
                  onClick={() => setWhere(facets.area === a.id ? '' : `a:${a.id}`)}>
                  {labels.area(a.id)}
                </Chip>
              ))}
            </div>
          </section>
        ))}
        <section className="gs-group" aria-labelledby="gs-h-countries">
          <h3 className="gs-h" id="gs-h-countries">{t('gs.countries')}</h3>
          <div className="gs-chips">
            {countryList.map(([iso2, name]) => (
              <Chip key={iso2} selected={facets.country === iso2}
                onClick={() => setWhere(facets.country === iso2 ? '' : `c:${iso2}`)}>
                {name}
              </Chip>
            ))}
          </div>
        </section>
      </div>
    ),
    when: (
      <ChipGroup label={t('gs.when')} className="gs-chips">
        <Chip kind="choice" selected={!facets.month} onClick={() => onApply({ month: null })}>{t('gs.any')}</Chip>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <Chip key={m} kind="choice" selected={facets.month === m} onClick={() => onApply({ month: m })}>
            {labels.month(m)}
          </Chip>
        ))}
      </ChipGroup>
    ),
    budget: (
      <div>
        <ChipGroup label={t('gs.budget')} className="gs-chips">
          <Chip kind="choice" selected={!facets.budget} onClick={() => onApply({ budget: null })}>{t('gs.any')}</Chip>
          {budgetSteps.map((n) => (
            <Chip key={n} kind="choice" selected={facets.budget === n} onClick={() => onApply({ budget: n })}>
              {labels.budget(n)}
            </Chip>
          ))}
        </ChipGroup>
        <p className="gs-hint">{t('gs.budgetHint')}</p>
        <div className="gs-extras">
          <Switch label={t('gs.cheapest')} checked={facets.sort === 'cost'}
            onChange={(on) => onApply({ sort: on ? 'cost' : null })} />
        </div>
      </div>
    ),
    extras: (
      <div className="gs-extras">
        {EXTRAS.map((x) => (
          <Switch key={x} label={labels.extra(x)}
            checked={x === 'nocar' ? !!facets.nocar : x === 'quiet' ? !!facets.quiet : (facets.nb || []).includes(x)}
            onChange={(on) => (x === 'nocar' ? onApply({ nocar: on }) : x === 'quiet' ? onApply({ quiet: on }) : toggleNb(x, on))} />
        ))}
      </div>
    ),
  };

  return (
    <div className={`gsearch${inHeader ? ' is-header' : ''}${hasFacets ? ' has-value' : ''}`}>
      <Button ref={triggerRef} variant="secondary" className="gsearch-trigger"
        iconStart={<SearchIcon size={18} />}
        onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <span className={hasFacets ? 'gsearch-summary' : 'gsearch-placeholder'}>
          {hasFacets ? summary.join(', ') : t('gs.placeholder')}
        </span>
      </Button>
      {hasFacets && (
        <IconButton label={t('gs.clearAria')} className="gsearch-clear" onClick={() => onApply({}, true)}>
          <CloseIcon size={16} />
        </IconButton>
      )}
      {open && (
        <SheetShell title={t('gs.title')} onClose={() => setOpen(false)} anchorRef={triggerRef}
          width={720} className="gsearch-sheet" labelId="gsearch-title" initialFocusRef={inputRef}
          closeLabel={t('gs.close')}>
          <div className="gs">
            <div className="gs-field">
              <SearchIcon size={20} className="gs-field-icon" />
              <input
                ref={inputRef}
                className="gs-input"
                type="text"
                role="combobox"
                aria-label={t('gs.inputLabel')}
                aria-expanded={listOpen}
                aria-controls="gs-listbox"
                aria-autocomplete="list"
                aria-activedescendant={listOpen ? `gs-opt-${active}` : undefined}
                placeholder={t('gs.inputPlaceholder')}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKeyDown}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="search"
              />
              {text && (
                <IconButton label={t('gs.clearText')} className="gs-field-clear" onClick={() => { setText(''); inputRef.current?.focus(); }}>
                  <CloseIcon size={16} />
                </IconButton>
              )}
            </div>

            {text.trim() ? (
              <div className="gs-results">
                {!vocab && <p className="gs-hint" role="status">{t('gs.loading')}</p>}
                {listOpen && (
                  <ul id="gs-listbox" role="listbox" aria-label={t('gs.optionsLabel')} className="gs-options">
                    {options.map((o, i) => {
                      const Icon = o.open || o.entry?.kind === 'near' ? CompassIcon
                        : o.entry?.kind === 'vibe' ? (VIBE_ICONS[o.entry.value] || SparkIcon) : SearchIcon;
                      return (
                        <li
                          key={o.key}
                          id={`gs-opt-${i}`}
                          role="option"
                          aria-selected={i === active}
                          className={`gs-option${i === active ? ' is-active' : ''}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => choose(o)}
                        >
                          <span className="gs-option-icon" aria-hidden="true"><Icon size={18} /></span>
                          <span className="gs-option-main">
                            <span className="gs-option-label">
                              {o.open ? o.entry.label : o.parts.map(partLabel).join(', ')}
                            </span>
                            {(o.open || o.entry?.kind === 'near') && o.entry.sub && (
                              <span className="gs-option-sub">{o.entry.sub}</span>
                            )}
                          </span>
                          <span className="gs-option-slot">{optionSlot(o)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {vocab && result?.unknown?.length > 0 && (
                  <div className="gs-cant" role="status">
                    <p className="gs-cant-line">{t('gs.cant', { word: result.unknown.join(' ') })}</p>
                    <p className="gs-cant-help">{t('gs.canHelp')}</p>
                  </div>
                )}
              </div>
            ) : (
              <>
                {!hasFacets && examples.length > 0 && (
                  <section className="gs-try" aria-labelledby="gs-h-try">
                    <h3 className="gs-h" id="gs-h-try">{t('gs.tryOne')}</h3>
                    <div className="gs-try-list">
                      {examples.map((f) => {
                        const Icon = VIBE_ICONS[f.vibe] || SparkIcon;
                        const words = facetLabels(f, labels, null, t);
                        return (
                          <Button key={words.join('|')} variant="secondary" className="gs-try-item"
                            iconStart={<Icon size={18} />} onClick={() => onApply(f, true)}>
                            {words.join(', ')}
                          </Button>
                        );
                      })}
                    </div>
                  </section>
                )}
                <Tabs
                  label={t('gs.slotsLabel')}
                  className="gs-tabs"
                  panelId="gs-panel"
                  value={slot}
                  onChange={setSlot}
                  tabs={SLOTS.map((s) => ({
                    id: s,
                    label: (
                      <span className="gs-slot">
                        <span className="gs-slot-k">{t(`gs.${s}`)}</span>
                        <span className="gs-slot-v">{slotValue(s)}</span>
                      </span>
                    ),
                  }))}
                />
                <div id="gs-panel" role="tabpanel" aria-label={t(`gs.${slot}`)} className="gs-panel">
                  {guided ? panel[slot] : <p className="gs-hint" role="status">{t('gs.loading')}</p>}
                </div>
              </>
            )}

            <div className="gs-foot">
              {empty && hasFacets && <p className="gs-none" role="status">{t('gs.noMatch')}</p>}
              <div className="gs-foot-actions">
                <Button variant="quiet" disabled={!hasFacets} onClick={() => onApply({}, true)}>{t('gs.clear')}</Button>
                <Button variant="primary" onClick={() => setOpen(false)}>{t('filter.showPlaces')}</Button>
              </div>
            </div>
          </div>
        </SheetShell>
      )}
    </div>
  );
}
