/*
 * The style guide (/?styleguide; T424, rebuilt for the house style 2026-11,
 * G1). One page that shows every token with its contrast, the type at the
 * three angles, every kit part in its states, the house parts, the relief
 * drawn from a real place's dossier, and live interaction demos. It is the
 * visual index of DESIGN.md; when the two disagree, the tokens in
 * src/styles/01-tokens.css win and both are fixed.
 *
 * Developer page: English only, not linked from the app.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, IconButton, Chip, ChipGroup, Segmented, Tabs, Field, Switch, CostRow, CostSum, Money,
  Blaze, Plate, ScorePlate, Formation, Rail, RailCard, StateBlock, Skeleton, NotYet, WorldTile, Figure, ReliefBand,
} from '../components/ui/index.js';
import { HouseIcon } from '../components/HouseIcons.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import { formatMoney } from '../lib/money.js';
import { dataUrl } from '../lib/dataHost.js';
import { hapticsAvailable, hapticsOn } from '../lib/haptics.js';
import { SPRING } from '../lib/motionTokens.js';
import './styleguide.css';

const SECTIONS = [
  ['idea', 'The idea'], ['colour', 'Colour'], ['type', 'Type'], ['shape', 'Shape and depth'],
  ['kit', 'Kit'], ['house', 'House parts'], ['relief', 'Background'], ['states', 'States'],
  ['motion', 'Interaction'], ['icons', 'Icons'],
];

// [token, role, the ground it is read on]
const SWATCHES = [
  ['--surface-page', 'Ground: stone', null],
  ['--surface-sunken', 'Band', null],
  ['--surface', 'Paper', null],
  ['--text', 'Ink, text 1', '--surface-page'],
  ['--text-2', 'Ink 2', '--surface-page'],
  ['--text-3', 'Ink 3, 13 px and up', '--surface-page'],
  ['--border', 'Rule, hairlines', null],
  ['--edge', 'Edge, control borders (a mark)', '--surface'],
  ['--umber-600', 'The paint: action, selected, blaze, route', '--surface-page'],
  ['--umber-700', 'Brown text, pressed, focus', '--surface-page'],
  ['--umber-800', 'Text on the beige', '--umber-100'],
  ['--umber-100', 'Beige: tints, food wagon, selected', null],
  ['--umber-200', 'Beige 2: second line on a plate', '--plate'],
  ['--umber-50', 'Selected row', null],
  ['--plate', 'Plate: Score and signpost', null],
  ['--danger', 'Danger, always with words', '--surface-page'],
  ['--kind-trails', 'Trails (with pictogram and word)', '--surface-sunken'],
  ['--kind-beaches', 'Beaches', '--surface-sunken'],
  ['--kind-lakes', 'Lakes', '--surface-sunken'],
  ['--kind-mountains', 'Mountains', '--surface-sunken'],
  ['--kind-cycling', 'Cycling', '--surface-sunken'],
  ['--map-land', 'Map land', null],
  ['--map-water', 'Map water', null],
];

const TYPE = [
  ['--text-display', 800, 'A total figure', 'tabular'],
  ['--text-headline', 800, 'Page title'],
  ['--text-title', 800, 'Section'],
  ['--text-plate', 700, 'Banská Štiavnica', 'plate'],
  ['--text-figure', 800, 'Row figure', 'tabular'],
  ['--text-lead', 400, 'Reading text and fields, 16 px so a phone never zooms.'],
  ['--text-body', 600, 'Interface text: rows, controls, lists'],
  ['--text-label', 600, 'Label'],
  ['--text-micro', 600, 'Micro, the floor: 12 px'],
];

const RADII = ['--radius-sm', '--radius-control', '--radius-panel', '--radius-card', '--radius-pill'];

function hexOf(v) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toLowerCase()}`;
}
function lum(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function useTokens(names) {
  const [vals, setVals] = useState({});
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    setVals(Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n).trim()])));
  }, [names]);
  return vals;
}

function Section({ id, title, lead, children }) {
  return (
    <section className="sg-section" id={id} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {lead && <p className="sg-lead">{lead}</p>}
      {children}
    </section>
  );
}

function Demo({ title, children, note }) {
  return (
    <div className="sg-demo">
      <h3>{title}</h3>
      <div className="sg-demo-body">{children}</div>
      {note && <p className="sg-note">{note}</p>}
    </div>
  );
}

export default function StyleGuide() {
  const names = useMemo(() => [...new Set(SWATCHES.flatMap(([t, , on]) => [t, on].filter(Boolean)).concat(RADII))], []);
  const tokens = useTokens(names);
  const [chips, setChips] = useState(['city']);
  const [unit, setUnit] = useState('pp');
  const [tab, setTab] = useState('overview');
  const [alert, setAlert] = useState(true);
  const [leg, setLeg] = useState('train');
  const [people, setPeople] = useState(2);
  const [mountains, setMountains] = useState(null);
  const [field, setField] = useState('');
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [stops, setStops] = useState(['Bled', 'Bohinj', 'Ljubljana']);
  const [shake, setShake] = useState(0);

  useEffect(() => {
    let live = true;
    // A real place's peaks (Aosta's dossier): the relief is drawn only from real ground.
    fetch(dataUrl('/dossier/gem-aosta.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (live) setMountains(d?.nearby?.mountains || []); })
      .catch(() => { if (live) setMountains([]); });
    return () => { live = false; };
  }, []);

  const toggleChip = (v) => setChips((c) => (c.includes(v) ? c.filter((x) => x !== v) : [...c, v]));
  const perPerson = 1667.5;
  const total = perPerson * people;

  return (
    <div className="sg">
      <header className="sg-top">
        <div className="sg-top-inner">
          <span className="sg-brand"><Blaze /> House style</span>
          <span className="sg-tag">Style guide</span>
        </div>
      </header>
      <div className="sg-layout">
        <nav className="sg-nav" aria-label="Sections">
          {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>
        <main className="sg-main" id="main">
          <div className="sg-hero">
            <h1>The furniture of a footpath, made for prices</h1>
            <p className="sg-lead">Stone ground, green-black ink, umber as the paint you put on the path when you choose. The blaze marks what is chosen or here; the plate holds a place, a time on foot and euros as one unit; the relief is drawn only from a place's real peaks. Full rules in DESIGN.md.</p>
          </div>

          <Section id="idea" title="The idea" lead="Three signature parts, each with one job. Nothing decorates.">
            <div className="sg-row">
              <Demo title="Blaze" note="Chosen or here only: the current tab, the chosen pin, a sheet grip, the wordmark slot, the relief cut.">
                <Blaze size="sm" /><Blaze /><Blaze size="lg" /><Blaze size="lg" state="rest" /><Blaze size="lg" state="blank" />
              </Demo>
              <Demo title="Plate" note="Place, leg, total and mark. Never an ordinary card.">
                <div className="sg-stack">
                  <Plate name="Aosta" sub="Italy" fig={<Money value={133} />} figSub="a day" />
                  <Plate variant="mark" fig={<Money value={133} />} />
                </div>
              </Demo>
            </div>
          </Section>

          <Section id="colour" title="Colour" lead="Contrast is measured live on the ground each colour is read on. Text pairs pass 4.5, marks 3.">
            <ul className="sg-swatches">
              {SWATCHES.map(([t, role, on]) => {
                const hex = hexOf(tokens[t] || '');
                const bg = on ? hexOf(tokens[on] || '') : null;
                const r = hex && bg ? ratio(hex, bg) : null;
                return (
                  <li key={t} className="sg-swatch">
                    <span className="sg-chip-col" style={{ background: `var(${t})` }} aria-hidden="true" />
                    <span className="sg-sw-text">
                      <code>{t}</code>
                      <span>{role}</span>
                      <span className="sg-sw-meta">{hex || tokens[t]}{r ? `, ${r.toFixed(2)} on ${on}` : ''}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>

          <Section id="type" title="Type" lead="Overpass for every word and figure, tabular figures on. Sofia Sans Extra Condensed only for plate names. Titles grow at 769 and 1024 px.">
            <ul className="sg-type">
              {TYPE.map(([t, w, text, mode]) => (
                <li key={t}>
                  <code>{t}</code>
                  <span className={mode === 'plate' ? 'sg-plate-face' : undefined}
                    style={{ fontSize: `var(${t})`, fontWeight: w }}>
                    {mode === 'tabular' ? formatMoney(3335) : text}
                  </span>
                </li>
              ))}
            </ul>
            <p className="sg-note">Glyph check: Český Krumlov, Banská Štiavnica, Übernachtung, Piñón, Łódź, Győr.</p>
          </Section>

          <Section id="shape" title="Shape and depth" lead="One radius scale, rounder than a ruler. Panels lie flat on a hairline; only what floats casts a shadow.">
            <div className="sg-row">
              {RADII.map((r) => (
                <div key={r} className="sg-radius" style={{ borderRadius: `var(${r})` }}><code>{r}</code><span>{tokens[r]}</span></div>
              ))}
              <div className="sg-float"><code>--elev-2</code><span>Sheets, menus, toasts</span></div>
            </div>
          </Section>

          <Section id="kit" title="Kit" lead="Every control from src/components/ui. One selected state: the beige wash, brown text, a brown edge and a mark.">
            <div className="sg-grid">
              <Demo title="Buttons">
                <Button variant="primary">Plan a trip here</Button>
                <Button>Change</Button>
                <Button variant="quiet">See all</Button>
                <Button variant="primary" iconStart={<span className="ai-tag">AI</span>}>Ask</Button>
                <Button disabled>Not now</Button>
              </Demo>
              <Demo title="Icon buttons">
                <IconButton label="Back" tone="surface"><HouseIcon.back size={20} /></IconButton>
                <IconButton label="Share"><HouseIcon.share size={20} /></IconButton>
                <IconButton label="Save" pressed><HouseIcon.cairn size={20} /></IconButton>
              </Demo>
              <Demo title="Chips" note="Select: the fill, then the tick springs in. A haptic tick on a touch commit.">
                <ChipGroup label="Kind of place">
                  {['city', 'beach', 'nature', 'mountains'].map((k) => (
                    <Chip key={k} selected={chips.includes(k)} onClick={() => toggleChip(k)}>{k[0].toUpperCase() + k.slice(1)}</Chip>
                  ))}
                </ChipGroup>
              </Demo>
              <Demo title="Segmented" note="44 px high on touch; the chosen segment takes the paint.">
                <Segmented label="Prices for" value={unit} onChange={setUnit}
                  options={[{ value: 'pp', label: 'Per person' }, { value: 'group', label: 'Whole group' }]} />
              </Demo>
              <Demo title="Tabs" note="The umber paint bar strokes in under the chosen tab.">
                <Tabs label="Trip" value={tab} onChange={setTab}
                  tabs={[{ id: 'overview', label: 'Overview' }, { id: 'itinerary', label: 'Itinerary' }, { id: 'costs', label: 'Costs' }, { id: 'days', label: 'Days' }]} />
              </Demo>
              <Demo title="Switch">
                <Switch label="Price alert" checked={alert} onChange={setAlert} />
              </Demo>
              <Demo title="Field">
                <Field label="What you paid" hint="In euros" value={field} onChange={(e) => setField(e.target.value)}
                  error={field && Number.isNaN(Number(field)) ? 'Type the fare you paid, in euros.' : undefined} />
              </Demo>
              <Demo title="Receipt" note="Dotted leaders on a wide receipt; the total is the engine's own, with a Rounding line where whole euros do not add up.">
                <dl className="costrows has-leaders">
                  <CostRow kind="flight" label="Getting there" value={<Money value={211} />} />
                  <CostRow kind="bed" label="Stay, 7 nights" value={<Money value={2199} />} />
                  <CostRow kind="food" label="Food and drink" value={<Money value={924} />} />
                  <CostRow label="Local transport" value={<NotYet />} />
                  <CostRow label="Rounding" value={<Money value={1} />} />
                  <CostSum label="Total, 2 people" value={<Money value={3335} />} />
                </dl>
              </Demo>
            </div>
          </Section>

          <Section id="house" title="House parts" lead="The formation is the price row of every list and card. The day figure is always the loudest thing in it.">
            <div className="sg-grid">
              <Demo title="Formation" note="Getting there outlined, the bed solid umber, food beige, then the day. Not yet is dashed and outside the sum.">
                <div className="sg-stack">
                  <Formation go={{ mode: 'car', amount: 118 }} bed={68} food={65} day={133} dayLabel="A day" />
                  <Formation go={{ mode: 'flight', amount: 120 }} bed={96} food={50} day={145} dayLabel="A day" />
                  <Formation go={{ mode: 'train', amount: null }} bed={44} food={32} day={76} dayLabel="A day" />
                  <Formation go={{ mode: 'car', amount: 118 }} bed={68} food={65} day={133} size="lg" weighted dayLabel="A day" />
                </div>
              </Demo>
              <Demo title="Plates">
                <div className="sg-stack">
                  <Plate lead={<Blaze size="sm" />} name="Sentier des Alpages" fig="6 h 39" figSub="on foot" />
                  <Plate variant="leg" as="button" checked={leg === 'train'} onClick={() => setLeg('train')} name="Train" sub="Fastest, 9 h 12" fig={<Money value={211} />} />
                  <Plate variant="leg" as="button" checked={leg === 'bus'} onClick={() => setLeg('bus')} name="Bus" sub="Cheapest, 13 h 05" fig={<Money value={148} />} />
                  <Plate variant="total" name="Total, 2 people" fig={<Figure value={total} mine delta />} />
                  <span className="sg-row"><ScorePlate value={9.7} label="Score" /><ScorePlate value={8.2} label="Score" size="lg" /></span>
                </div>
              </Demo>
            </div>
            <Rail title="Hiking bases" onSeeAll={() => {}}>
              {[['Aosta', 'IT', 'Italy', 9.4, { mode: 'car', amount: 118 }, 68, 65, 133],
                ['Hallstatt', 'AT', 'Austria', 9.6, { mode: 'car', amount: 138 }, 109, 64, 172],
                ['Moustiers-Sainte-Marie', 'FR', 'France', 9.4, { mode: 'flight', amount: 120 }, 96, 50, 145],
                ['Piran', 'SI', 'Slovenia', 9.1, { mode: 'bus', amount: null }, 79, 59, 138]].map(([n, cc, c, s, go, bed, food, day], i) => (
                <RailCard key={n} href="#house" name={n} score={s} scoreLabel="Score"
                  world={['rock', 'water', 'lowland', 'water'][i]}
                  where={<><CountryFlag country={cc} size={14} /> {c}</>}
                  gem={i === 2 ? 'Hidden gem' : null}
                  formation={<Formation go={go} bed={bed} food={food} day={day} weighted dayLabel="A day" />}
                  action={<IconButton label={`Save ${n}`} tone="photo"><HouseIcon.cairn size={20} /></IconButton>} />
              ))}
            </Rail>
          </Section>

          <Section id="relief" title="Background" lead="The relief: contours drawn only from the place's real peaks in its dossier, after a hard umber cut. Text stays on the flat side; every relief prints a real height; no peak, no relief.">
            {mountains === null ? <Skeleton h={160} /> : (
              <ReliefBand mountains={mountains} seed="gem-aosta" cut="45%" className="sg-relief">
                <h3 className="sg-relief-title">Around Aosta</h3>
                <p className="sg-note">Peaks from the dossier: {mountains.length ? mountains.slice(0, 3).map((m) => m.name).join(', ') : 'none, so no relief'}.</p>
              </ReliefBand>
            )}
            <ReliefBand mountains={[]} seed="none" className="sg-relief">
              <h3 className="sg-relief-title">A place without peaks</h3>
              <p className="sg-note">No relief, by rule: the band stays flat.</p>
            </ReliefBand>
          </Section>

          <Section id="states" title="States" lead="One way to say loading, empty, error and a missing figure, everywhere.">
            <div className="sg-grid">
              <Demo title="Loading"><StateBlock kind="loading" /><Skeleton w="70%" h={18} /><Skeleton w="45%" h={14} /></Demo>
              <Demo title="Empty"><StateBlock kind="empty" title="No place fits" action={<Button variant="quiet">Clear all</Button>} /></Demo>
              <Demo title="Error"><StateBlock kind="error" title="The prices did not load" text="Check the connection and try again." action={<Button>Try again</Button>} /></Demo>
              <Demo title="Not yet and a missing photo"><p>Local transport <NotYet /></p><span className="sg-world"><WorldTile world="water" /></span></Demo>
            </div>
          </Section>

          <Section id="motion" title="Interaction" lead="Painted and placed. Overshoot only on the control the finger touched; figures roll only when you changed them; reduced motion shows the end state.">
            <div className="sg-grid">
              <Demo title="Figure that answers you" note="Demo figures. Change the people: the total rolls once and a delta note shows. A figure nobody touched never moves.">
                <Segmented label="People" value={String(people)} onChange={(v) => setPeople(Number(v))}
                  options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) }))} />
                <span className="sg-big"><Figure value={total} mine delta /></span>
              </Demo>
              <Demo title="Springs" note="Generated into CSS linear() by scripts/ci/spring-easings.mjs.">
                <ul className="sg-springs">
                  {Object.entries(SPRING).map(([k, v]) => <li key={k}><code>{k}</code> {v.visualDuration ? `${v.visualDuration * 1000} ms, bounce ${v.bounce}` : `stiffness ${v.stiffness}, damping ${v.damping}`}</li>)}
                </ul>
              </Demo>
              <Demo title="Primitives" note="Save pops the icon (confirm), a fold reveals, a refused field shakes (warn); a removed row takes .hs-leave before it goes. Reduced motion shows each end state.">
                <IconButton label={saved ? 'Saved' : 'Save'} pressed={saved} tone="surface"
                  onClick={() => setSaved((v) => !v)}>
                  <span key={String(saved)} className={saved ? 'hs-pop' : undefined}><HouseIcon.cairn size={20} /></span>
                </IconButton>
                <Button onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? 'Hide' : 'Why this one'}</Button>
                {open && <p className="hs-reveal sg-note">Revealed over --dur-2, 4 px.</p>}
                <ul className="sg-stops">
                  {stops.map((n) => (
                    <li key={n}>{n} <Button variant="quiet" size="sm" onClick={() => setStops((l) => l.filter((x) => x !== n))}>Remove</Button></li>
                  ))}
                </ul>
                <span key={shake} className={shake ? 'hs-shake' : undefined}>
                  <Button haptic="warn" onClick={() => setShake((n) => n + 1)}>Refuse</Button>
                </span>
              </Demo>
              <Demo title="Haptics" note="Tick on a value, confirm on a kept thing, warn on a failure; touch commits only.">
                <p>{hapticsAvailable() ? `This device can vibrate; haptics are ${hapticsOn() ? 'on' : 'off'}.` : 'This device has no haptic route, so Settings shows no switch.'}</p>
              </Demo>
            </div>
          </Section>

          <Section id="icons" title="Icons" lead="24 px grid, 1.75 stroke, square caps, mitred joins. No sparkle for AI, no globe for countries.">
            <ul className="sg-icons">
              {Object.entries(HouseIcon).map(([k, G]) => <li key={k}><G size={24} /><code>{k}</code></li>)}
            </ul>
          </Section>
        </main>
      </div>
    </div>
  );
}
