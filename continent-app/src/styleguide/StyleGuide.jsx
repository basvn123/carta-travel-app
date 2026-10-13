/*
 * The style guide (T424, roadmap 1.2): the one place that shows every part of
 * the design system with a live example and when to use it.
 *
 * Opened at ?styleguide, instead of the app (src/main.jsx), lazy-loaded with
 * its own stylesheet so nothing here ships in the app's first paint. It is a
 * working page for the owner and for every session that builds a screen:
 * built from the real kit (src/components/ui) and the real tokens, never a
 * picture of them, so it cannot drift from what ships. Hidden from navigation
 * and marked noindex.
 *
 * Copy on this page is reference prose for the team, in English; the kit's
 * own labels and every figure go through i18n and money.js, so the language
 * switch at the top previews them in all six languages.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useI18n, LANGUAGES } from '../i18n/index.jsx';
import { Button, IconButton, Chip, ChipGroup, Segmented, Tabs, Card, Field, Icon, Money } from '../components/ui/index.js';
import * as Icons from '../components/Icons.jsx';
import { RatingBadge } from '../components/RatingBadge.jsx';
import { formatMoney } from '../lib/money.js';
import { thumbAt } from '../lib/heroImage.js';
import './styleguide.css';

const SECTIONS = [
  ['colour', 'Colour'], ['type', 'Type'], ['space', 'Space and shape'], ['buttons', 'Buttons'],
  ['chips', 'Chips and filters'], ['switches', 'Segmented and tabs'], ['cards', 'Cards'],
  ['fields', 'Fields'], ['icons', 'Icons'], ['money', 'Prices'], ['rules', 'Rules'],
];

const ROLES = [
  ['--surface-page', 'The ground behind everything', 'Never a card fill'],
  ['--surface', 'Cards, sheets, bars', 'Never the page ground'],
  ['--surface-sunken', 'Input fills, quiet bands, a segmented track', 'Never a selected state'],
  ['--text', 'Body text and headings', 'Never on a teal fill'],
  ['--text-2', 'Secondary text', 'Never for a heading'],
  ['--text-3', 'Metadata at 11 to 14 px', 'Never body copy'],
  ['--border', 'Card and input edges, dividers', 'Never as a second elevation on a shadowed object'],
  ['--action', 'The one primary button, links, the live route', 'Never decoration, never a rating'],
  ['--select-bg', 'The selected state, with --select-ink text and a mark', 'Never a dark fill'],
  ['--best', 'Best value: a marker or fill with --text on it', 'Never text, never anything else'],
  ['--rate', 'Ratings, a measure', 'Never an action'],
  ['--gem-ink', 'Hidden gems', 'Never anything else'],
  ['--danger', 'Destructive actions only', 'Never a warning or decoration'],
];
const PRIMITIVES = ['--neutral-0', '--neutral-25', '--neutral-50', '--neutral-100', '--neutral-150', '--neutral-200',
  '--neutral-300', '--neutral-600', '--neutral-700', '--neutral-800', '--neutral-900', '--lagoon-50', '--lagoon-100',
  '--lagoon-200', '--lagoon-300', '--lagoon-600', '--lagoon-700', '--lagoon-800', '--lagoon-900', '--sun-100',
  '--sun-400', '--sun-800'];
const TYPE = [
  ['--text-display', 'Display', 'Destination names on a hero', 700],
  ['--text-headline', 'Headline', 'Page titles', 700],
  ['--text-title', 'Title', 'Card and section titles', 600],
  ['--text-lead', 'Lead', 'Row titles, lead text, phone primary buttons', 600],
  ['--text-body', 'Body', 'Body copy and list rows', 400],
  ['--text-label', 'Label', 'Labels, chips, secondary buttons', 500],
  ['--text-caption', 'Caption', 'Metadata; the floor for a figure or a rating', 400],
  ['--text-micro', 'Micro', 'The floor for any functional text', 600],
];
const PLACES = [
  { city: 'Kotor', country: 'Montenegro', day: 65, bed: 24, url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/20090719_Crkva_Gospa_od_Zdravlja_Kotor_Bay_Montenegro.jpg/960px-20090719_Crkva_Gospa_od_Zdravlja_Kotor_Bay_Montenegro.jpg', rating: { score: 9.1, tier: 3, label: 'Worth the journey' } },
  { city: 'Hallstatt', country: 'Austria', day: 113, bed: 58, url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Hallstatt_-_Zentrum_.JPG/960px-Hallstatt_-_Zentrum_.JPG', rating: { score: 8.9, tier: 3, label: 'Worth the journey' } },
  { city: 'Plovdiv', country: 'Bulgaria', day: 49, bed: 18, est: true, url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/26/%D0%9F%D0%BB%D0%BE%D0%B2%D0%B4%D0%B8%D0%B2.jpg/960px-%D0%9F%D0%BB%D0%BE%D0%B2%D0%B4%D0%B8%D0%B2.jpg', rating: { score: 6.9, tier: 1, label: 'Worth a visit' } },
];

function lum(hex) {
  const h = hex.replace('#', '').trim();
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255)
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

function Use({ yes, no }) {
  return (
    <dl className="sg-use">
      <div><dt>Use for</dt><dd>{yes}</dd></div>
      {no && <div><dt>Not for</dt><dd>{no}</dd></div>}
    </dl>
  );
}

function Photo({ url, alt }) {
  return <img src={thumbAt(url, 500)} alt={alt} loading="lazy" decoding="async" />;
}

export default function StyleGuide() {
  const { t, lang, setLang } = useI18n();
  const roleNames = useMemo(() => [...ROLES.map((r) => r[0]), '--select-ink', '--action-text'], []);
  const tokens = useTokens(roleNames);
  const prims = useTokens(PRIMITIVES);
  const [filters, setFilters] = useState({ hiking: true, beaches: false, under60: false });
  const [month, setMonth] = useState('oct');
  const [view, setView] = useState('list');
  const [tab, setTab] = useState('overview');
  const [saved, setSaved] = useState(true);
  const [email, setEmail] = useState('');

  useEffect(() => {
    document.title = 'Design system | Carta';
    const m = document.createElement('meta');
    m.name = 'robots'; m.content = 'noindex';
    document.head.appendChild(m);
    return () => m.remove();
  }, []);

  const pair = (fg, bg) => (tokens[fg] && tokens[bg] ? ratio(tokens[fg], tokens[bg]).toFixed(1) : '');

  return (
    <div className="sg">
      <header className="sg-top">
        <div className="sg-top-inner">
          <div className="sg-brand">
            <span className="sg-mark" aria-hidden="true"><Icons.CompassIcon size={20} /></span>
            <span>Carta</span>
          </div>
          <Segmented
            label="Preview language"
            size="sm"
            value={lang}
            onChange={setLang}
            options={LANGUAGES.map((l) => ({ value: l.code, label: l.code.toUpperCase() }))}
          />
        </div>
      </header>

      <div className="sg-layout">
        <nav className="sg-nav" aria-label="Sections">
          {SECTIONS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        <main className="sg-main">
          <div className="sg-hero">
            <h1>Carta design system</h1>
            <p>Lagoon: a calm, photo-first travel app in the manner of Airbnb, Polarsteps and Wanderlog, with one honest price line under every photo. Every part below is the live component and the live token; change the language at the top to see labels and prices in all six.</p>
          </div>

          <Section id="colour" title="Colour" lead="Components read roles, never raw values. White surfaces on a warm light grey, blue-grey ink that is never black, one teal for actions and selection.">
            <div className="sg-swatches">
              {ROLES.map(([name, yes, no]) => (
                <div className="sg-swatch" key={name}>
                  <span className="sg-chip" style={{ background: `var(${name})` }} />
                  <div className="sg-swatch-body">
                    <code>{name}</code>
                    <span className="sg-hex">{tokens[name]}</span>
                    <p>{yes}</p>
                    <p className="sg-no">{no}</p>
                  </div>
                </div>
              ))}
            </div>
            <h3>Pairs that carry text</h3>
            <div className="sg-pairs">
              {[['--text', '--surface-page'], ['--text-3', '--surface-sunken'], ['--action-text', '--action'], ['--select-ink', '--select-bg'], ['--text', '--best']].map(([fg, bg]) => (
                <div key={fg + bg} className="sg-pair" style={{ background: `var(${bg})`, color: `var(${fg})` }}>
                  <b>Aa {pair(fg, bg)}:1</b>
                  <span>{fg} on {bg}</span>
                </div>
              ))}
            </div>
            <h3>Primitives</h3>
            <div className="sg-ramp">
              {PRIMITIVES.map((n) => (
                <div key={n} className="sg-ramp-cell">
                  <span style={{ background: `var(${n})` }} />
                  <code>{n.replace('--', '')}</code>
                  <small>{prims[n]}</small>
                </div>
              ))}
            </div>
          </Section>

          <Section id="type" title="Type" lead="One family, Figtree, for everything. Figures are tabular across the app, so prices line up and settle in place. Nothing functional under 11 px, no figure or rating under 12 px.">
            <div className="sg-type">
              {TYPE.map(([tok, name, use, w]) => (
                <div className="sg-type-row" key={tok}>
                  <div className="sg-type-meta"><b>{name}</b><code>{tok}</code><small>{use}</small></div>
                  <div className="sg-type-sample" style={{ fontSize: `var(${tok})`, fontWeight: w }}>
                    {tok === '--text-display' || tok === '--text-headline' ? 'Walk from a town' : 'Kotor, Bay of Kotor, 3 nights from 14 Oct'}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section id="space" title="Space and shape" lead="A 4 px spacing grid; four corner radii; elevation declared once per object, a border or a shadow, never both.">
            <div className="sg-space">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <div key={n} className="sg-space-row"><code>--space-{n}</code><span style={{ width: `var(--space-${n})` }} /></div>
              ))}
            </div>
            <div className="sg-shapes">
              {[['--radius-sm', 'Small marks'], ['--radius-control', 'Buttons, inputs'], ['--radius-card', 'Cards, photos'], ['--radius-sheet', 'Sheets, dialogs'], ['--radius-pill', 'Chips, round icons']].map(([r, u]) => (
                <div key={r} className="sg-shape"><span style={{ borderRadius: `var(${r})` }} /><code>{r}</code><small>{u}</small></div>
              ))}
            </div>
            <div className="sg-shapes">
              {[['--elev-1', 'A resting card without a border'], ['--elev-2', 'A popover, a sticky bar'], ['--elev-3', 'A sheet or a dialog']].map(([e, u]) => (
                <div key={e} className="sg-shape"><span className="sg-elev" style={{ boxShadow: `var(${e})` }} /><code>{e}</code><small>{u}</small></div>
              ))}
            </div>
          </Section>

          <Section id="buttons" title="Buttons" lead="Four kinds and one icon button. Verb first, sentence case, no full stop. One primary per view.">
            <div className="sg-demo">
              <Button variant="primary">Plan a trip here</Button>
              <Button>Save trip</Button>
              <Button variant="quiet">See all</Button>
              <Button variant="danger">Delete account</Button>
            </div>
            <div className="sg-demo">
              <Button variant="primary" disabled>Next: Where</Button>
              <Button disabled>Back</Button>
              <Button variant="primary" loading>Plan your days</Button>
              <Button size="sm" iconStart={<Icons.FilterIcon size={16} />}>Filters</Button>
            </div>
            <Use yes="Primary: the one action that moves the traveller on. Secondary: every other action. Quiet: an offer inside a bar, a row or a card. Danger: something is erased." no="Two primaries in a view; a dark-filled button; a link that only navigates (use a link)." />
            <div className="sg-demo">
              <IconButton label="Close"><Icons.CloseIcon size={18} /></IconButton>
              <IconButton label="Filters" tone="surface"><Icons.FilterIcon size={18} /></IconButton>
              <IconButton label="Save" tone="photo" pressed={saved} onClick={() => setSaved((s) => !s)}><Icons.BookmarkIcon size={18} /></IconButton>
            </div>
            <Use yes="IconButton: a control whose icon is universally read (close, filters, save). Always a 44 px box and a label." no="An action whose meaning needs a word; use a Button with an icon." />
          </Section>

          <Section id="chips" title="Chips and filters" lead="One chip in four kinds. Selected takes the light tint and a tick, so the state never rests on colour alone.">
            <div className="sg-demo">
              {[['hiking', 'Hiking'], ['beaches', 'Beaches'], ['under60', `Under ${formatMoney(60)} a day`]].map(([k, l]) => (
                <Chip key={k} selected={filters[k]} onClick={() => setFilters((f) => ({ ...f, [k]: !f[k] }))}>{l}</Chip>
              ))}
            </div>
            <ChipGroup label="Month">
              {[['sep', 'Sep'], ['oct', 'Oct'], ['nov', 'Nov'], ['any', 'Any month']].map(([k, l]) => (
                <Chip key={k} kind="choice" selected={month === k} onClick={() => setMonth(k)}>{l}</Chip>
              ))}
            </ChipGroup>
            <div className="sg-demo">
              <Chip kind="count">3</Chip>
              <Chip kind="status">UNESCO World Heritage</Chip>
              <Chip kind="status" tone="best">Best value</Chip>
              <Chip kind="status" tone="gem">Hidden gem</Chip>
              <Chip kind="status" tone="rate">Worth the journey</Chip>
              <Chip kind="status" tone="positive">Open now</Chip>
              <Chip kind="status" tone="danger">Closed</Chip>
            </div>
            <Use yes="Filter: narrows a list, many can be on. Choice: one of a short set. Count: a figure beside a label. Status: a label on an object, each tone for its one job." no="Navigation between pages; more than one line of chips without a 'More' sheet." />
          </Section>

          <Section id="switches" title="Segmented and tabs">
            <div className="sg-demo">
              <Segmented label="View" value={view} onChange={setView} options={[{ value: 'list', label: 'List', icon: <Icons.ListDayIcon size={16} /> }, { value: 'map', label: 'Map', icon: <Icons.MapPinIcon size={16} /> }]} />
            </div>
            <Use yes="Segmented: two to four views of the same thing (List and Map, Overview and Day by day). The chosen one is lifted, white on the track." no="More than four options; filters (use chips)." />
            <Tabs label="Trip" value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'days', label: 'Day by day', count: 7 }, { id: 'costs', label: 'Costs' }]} />
            <Use yes="Tabs: sections of one page that swap in place, underlined in teal." no="Moving between pages or tabs of the app (use links)." />
          </Section>

          <Section id="cards" title="Cards" lead="One anatomy for every object: media, title, meta, price, rating, actions. Compact rows are the default on Explore and Destinations; photo tiles are for rails and the home page.">
            <div className="sg-rows">
              {PLACES.map((p) => (
                <Card
                  key={p.city}
                  layout="row"
                  media={<Photo url={p.url} alt="" />}
                  title={p.city}
                  onOpen={() => {}}
                  meta={p.country}
                  price={<><Money value={p.day} est={p.est} /> <span className="sg-unit">{t('cost.perDay')}</span></>}
                  rating={<RatingBadge rating={p.rating} size="sm" showGem={false} />}
                  actions={<IconButton label="Save"><Icons.BookmarkIcon size={18} /></IconButton>}
                />
              ))}
            </div>
            <div className="sg-tiles">
              {PLACES.map((p) => (
                <Card
                  key={p.city}
                  layout="tile"
                  media={<Photo url={p.url} alt={p.city} />}
                  title={p.city}
                  onOpen={() => {}}
                  meta={p.country}
                  price={<><Money value={p.day} /> <span className="sg-unit">{t('cost.perDay')}</span></>}
                  rating={<RatingBadge rating={p.rating} size="sm" showGem={false} />}
                  actions={<IconButton label="Save" tone="photo"><Icons.BookmarkIcon size={18} /></IconButton>}
                />
              ))}
            </div>
            <Use yes="Row: any list where places are compared. Tile: a rail or the home page, where the photo should sell the place." no="A card inside a card; a bento grid of facts; text on a photograph." />
          </Section>

          <Section id="fields" title="Fields" lead="Every field has a visible label. Help and errors sit under the field and are read with it.">
            <div className="sg-fields">
              <Field label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} hint="We send the receipt here." />
              <Field as="select" label="Lifestyle" defaultValue="entire"><option value="dorm">Hostel bed</option><option value="private">Private room</option><option value="entire">Entire place</option></Field>
              <Field label="Trip name" defaultValue="" error="Give the trip a name so you can find it later." />
              <Field as="textarea" label="Notes" hint="Only you see these." />
            </div>
            <Use yes="Any input the traveller types or picks into." no="A placeholder as the only name of a field." />
          </Section>

          <Section id="icons" title="Icons" lead="Drawn line icons, 1.5 stroke, three sizes: 16 px in chips and inline, 20 px in buttons and rows, 24 px in empty states.">
            <div className="sg-icon-sizes">
              {['sm', 'md', 'lg'].map((s) => <span key={s}><Icon as={Icons.MapPinIcon} size={s} /><code>{s}</code></span>)}
            </div>
            <div className="sg-icons">
              {Object.entries(Icons).filter(([n, C]) => /Icon$/.test(n) && typeof C === 'function').map(([n, C]) => (
                <div key={n} className="sg-icon">{React.createElement(C, { size: 20 })}<small>{n.replace(/Icon$/, '')}</small></div>
              ))}
            </div>
          </Section>

          <Section id="money" title="Prices" lead="Every euro comes from one formatter. Whole euros where places are compared; cents on receipts and totals; the symbol where the reader's language puts it; an estimate is always a tilde and the estimate word.">
            <table className="sg-table">
              <thead><tr><th>Context</th><th>Current language</th><th>Rule</th></tr></thead>
              <tbody>
                <tr><td>Card, pin, list, filter</td><td><Money value={1268.4} /></td><td>Whole euros</td></tr>
                <tr><td>Receipt, total, ledger, pass</td><td><Money value={1268.4} precision="cents" /></td><td>Cents</td></tr>
                <tr><td>Estimate</td><td><Money value={556.48} precision="cents" est /></td><td>Tilde joined, the estimate word after</td></tr>
                <tr><td>Range</td><td><Money low={40} high={60} /></td><td>The language's own range word</td></tr>
                <tr><td>Per person</td><td><Money value={278.24} precision="cents" /> {t('money.perPerson')}</td><td>One phrase per language</td></tr>
                <tr><td>No figure</td><td><Money value={null} /></td><td>Words, never a blank or a dash</td></tr>
              </tbody>
            </table>
            <table className="sg-table">
              <thead><tr><th>Language</th><th>Card</th><th>Receipt</th></tr></thead>
              <tbody>
                {LANGUAGES.map((l) => (
                  <tr key={l.code}>
                    <td>{l.label}</td>
                    <td className="money">{formatMoney(1268.4, { locale: l.bcp47 })}</td>
                    <td className="money">{formatMoney(99.54, { precision: 'cents', locale: l.bcp47 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Use yes="<Money> in JSX, formatMoney() in a string; i18n templates take a formatted {price}." no="A euro sign in a template; toFixed on a price; a rounded figure on a receipt." />
          </Section>

          <Section id="rules" title="Rules">
            <ul className="sg-rules">
              <li>One selected state: the light teal tint, a teal label and a mark. Never a dark fill.</li>
              <li>One primary button per view. Teal means it acts or it is live.</li>
              <li>Ochre is a rating, plum a hidden gem, sun yellow best value, red destruction. Each colour has one job.</li>
              <li>Photos lead; text never sits on a photograph; a caption sits under it.</li>
              <li>Every control is 44 px on touch; focus is a 2 px teal ring.</li>
              <li>Motion uses the four duration tokens, moves transform and opacity, and stops under reduced motion.</li>
              <li>No em or en dashes, no middots, sentence case, verb-first labels.</li>
            </ul>
          </Section>
        </main>
      </div>
    </div>
  );
}
