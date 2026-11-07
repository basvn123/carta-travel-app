import React from 'react';
import { partnerLinkProps } from '../lib/partnerLink.js';
import { PartnerMark, PartnerNote } from '../components/PartnerMark.jsx';
import { Button } from '../components/ui/index.js';
import { safeUrl } from '../lib/format.js';
import { formatMoney } from '../lib/money.js';
import { minutesText } from '../lib/journeys.js';
import { AirlineMark } from '../components/flights/Flights.jsx';
import { Fold } from './Fold.jsx';
import { WhyItMatches, useFit } from './WhyItMatches.jsx';
import { showMatch } from '../lib/match.js';
import { useFirstRun } from '../lib/firstRunContext.js';
import { useStayRecord } from '../lib/staysData.js';
import { baseCity } from '../lib/nearby.js';
import { stayBookLinks } from '../lib/transportLinks.js';
import { stayKindsOf } from '../lib/whenGuide.js';
import { AccessIcon, BunkIcon, HomeIcon, HotelIcon } from '../components/Icons.jsx';
import { practicalSlotRows } from './DestPracticalSlots.jsx';
import { BeforeYouGo } from './DestBefore.jsx';
import { parkingTruth } from '../lib/parkingTruth.js';
import { useDestInfo } from '../lib/destInfo.js';
import { accessCard } from '../lib/accessFacts.js';
import { PSection, WayFig } from './PageTemplate.jsx';
import '../styles/94-when-stay.css';
import {
  SunIcon, RainIcon, SnowIcon, ShoeIcon, SwimIcon, BootIcon, PlugIcon, BottleIcon, JacketIcon, BackpackIcon, SparkIcon, BusIcon, TrainIcon, CarIcon, ExternalIcon, ClockIcon, TicketIcon,
} from '../components/Icons.jsx';
import { PlaneIcon } from '../components/TransportIcons.jsx';

/**
 * The place page's last three sections (T912, the owner's approved one-page
 * spec, 2026-10-30; they were the Practical tab, T499):
 *
 *   DestStay      Where to stay: the neighbourhoods' typical night as bars,
 *                 with who each area suits, then Search stays
 *   DestGetting   Getting there from the traveller's home: the flight, the
 *                 train, the coach and the car, each with its time and its
 *                 return a person, the cheapest marked; priced by the same
 *                 models as the Explore card (lib/travelWay.js, the sweep)
 *   DestPractical the quick facts (d.essentials), the airport, getting
 *                 around and the rhythm, the PDF, the links out, why it
 *                 rates, the match, parking and packing, and the sources and
 *                 photo credits
 *
 * A row, a cell or a section without data is not drawn.
 */
const PACK_GLYPH = {
  shoes: ShoeIcon, daypack: BackpackIcon, sun: SunIcon, bottle: BottleIcon,
  swim: SwimIcon, rain: RainIcon, winter: SnowIcon, layers: JacketIcon,
  evening: JacketIcon, modest: JacketIcon, boots: BootIcon, plug: PlugIcon,
};
const WAY_ICON = { plane: PlaneIcon, train: TrainIcon, bus: BusIcon, car: CarIcon };
const TIPS = ['round', '5-10', '10-15', 'included', 'none'];
const TAP = ['safe', 'bottled', 'varies'];

// The stay types Where to stay offers, each with the tier its book links
// search for and its glyph (T1022).
const STAY_ROWS = {
  hostel: { tier: 'dorm', Icon: BunkIcon },
  hotel: { tier: 'hotel3', Icon: HotelIcon },
  home: { tier: 'home', Icon: HomeIcon },
};

/**
 * Where to stay (T1022, owner 2026-11-03: no areas, no prices here, clean
 * buttons to the sites; T1023: no sublines). One row per stay type the
 * scrape found here (lib/whenGuide.js stayKindsOf), else the three types:
 * its name and the sites that sell it, searched for the traveller's dates
 * and party (stayBookLinks). What each costs by month is When to go's.
 */
export function DestStay({ p }) {
  const { t, destination } = p;
  const ctx = useFirstRun();
  const rec = useStayRecord(destination.id);
  const found = stayKindsOf(rec);
  const kinds = found.length ? found : ['hotel', 'home', 'hostel'];
  // A gateway's name carries its airport; the sites search the town.
  const town = baseCity(destination.city);
  const checkin = ctx?.departDate || ctx?.defaultDates?.start || '';
  const checkout = ctx?.returnDate || ctx?.defaultDates?.end || '';
  const adults = Math.max(1, Math.round(ctx?.choices?.group_size || 2));
  if (!town) return null;
  return (
    <PSection id="pt-stay" title={t('destx.jump.stay')}>
      <ul className="stay-kinds">
        {kinds.map((k) => {
          const { tier, Icon } = STAY_ROWS[k];
          const links = stayBookLinks({ tier, city: town, country: destination.country, checkin, checkout, adults });
          return (
            <li key={k} className={`stay-kind is-${k}`}>
              <span className="stay-ico" aria-hidden="true"><Icon size={20} /></span>
              <b className="stay-what">{t(`stay.kind.${k}`)}</b>
              <span className="stay-go">
                {links.map((l) => (
                  <Button key={l.provider} href={l.href} external size="sm" className="stay-btn"
                    aria-label={t('stay.searchOn', { kind: t(`stay.kind.${k}`), provider: l.provider })}
                    iconAfter={<ExternalIcon size={13} />}>
                    {l.provider}
                  </Button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </PSection>
  );
}

export function DestGetting({ p }) {
  const { t, ways, view } = p;
  if (!ways?.rows?.length) return null;
  const unit = view.total ? t('price.unitReturnGroup') : t('card.unitReturn');
  const label = (w) => (w.mode === 'plane'
    ? (w.iata ? t('destx.flyToIata', { iata: w.iata }) : t('way.plane'))
    : t(`way.${w.mode}`));
  const sub = (w) => {
    if (w.mode === 'plane') {
      return [
        w.dep && w.arr ? t('destx.flightTimes', { dep: w.dep, arr: w.arr }) : null,
        Number.isFinite(w.minutes) ? minutesText(w.minutes) : null,
      ].filter(Boolean).join(', ');
    }
    return Number.isFinite(w.hours) ? t('destx.aboutTime', { time: minutesText(Math.round(w.hours * 60)) }) : '';
  };
  return (
    <PSection id="pt-getting" title={ways.from ? t('destx.gettingFrom', { place: ways.from }) : t('detail.gettingThere')}
      note={t('destx.gettingNote')}>
      <ul className="pt-ways">
        {ways.rows.map((w) => {
          const Icon = WAY_ICON[w.mode];
          const cheapest = ways.rows.length > 1 && w.mode === ways.cheapest;
          return (
            <li key={w.mode} className={`pt-way${cheapest ? ' is-best' : ''}`}>
              <span className="pt-way-icon" aria-hidden="true"><Icon size={18} /></span>
              <span className="pt-way-main">
                <span className="pt-way-name">
                  {w.airline && <AirlineMark code={w.airline} size="sm" />}
                  {label(w)}
                  {cheapest && <span className="pt-best">{t('destx.cheapest')}</span>}
                </span>
                {sub(w) && <small>{sub(w)}</small>}
              </span>
              <WayFig amount={formatMoney(view.way(w.perPerson), { precision: 'whole' })} unit={unit} />
            </li>
          );
        })}
      </ul>
    </PSection>
  );
}

/** The quick facts from d.essentials, each only when the dossier has it. */
function quickFacts(p) {
  const { t, lang, d } = p;
  const e = d?.essentials || {};
  const out = [];
  const langs = (e.languages || []).filter((x) => typeof x === 'string' && x);
  if (langs.length) {
    let names = langs;
    try {
      const dn = new Intl.DisplayNames([lang], { type: 'language' });
      names = langs.map((code) => dn.of(code) || code);
    } catch { /* the codes stand */ }
    let value = names.join(', ');
    try { value = new Intl.ListFormat(lang, { type: 'conjunction' }).format(names); } catch { /* the join stands */ }
    out.push({ k: 'lang', label: t('destx.qf.language'), value: value.charAt(0).toLocaleUpperCase(lang) + value.slice(1) });
  }
  if (e.currency) {
    let cur = e.currency;
    try { cur = new Intl.DisplayNames([lang], { type: 'currency' }).of(e.currency) || e.currency; } catch { /* the code stands */ }
    out.push({ k: 'money', label: t('destx.qf.money'), value: cur.charAt(0).toLocaleUpperCase(lang) + cur.slice(1) });
  }
  if (TIPS.includes(e.tipping)) out.push({ k: 'tip', label: t('destx.qf.tipping'), value: t(`destx.tip.${e.tipping}`) });
  const plugs = (e.plugs || []).filter((x) => /^[A-N]$/.test(String(x)));
  if (plugs.length) {
    out.push({
      k: 'plugs', label: t('destx.qf.plugs'),
      value: Number.isFinite(e.volts)
        ? t('destx.plugsVolts', { types: plugs.join(', '), volts: e.volts })
        : t('destx.plugs', { types: plugs.join(', ') }),
    });
  }
  if (TAP.includes(e.tap_water)) out.push({ k: 'tap', label: t('destx.qf.tap'), value: t(`destx.tap.${e.tap_water}`) });
  if (e.emergency) out.push({ k: 'sos', label: t('destx.qf.emergency'), value: String(e.emergency) });
  return out;
}

/** The sources and photo credits, every one we owe, in one fold. */
function Credits({ p, osm = false }) {
  const { t, d, hasRoutes, guideUrl } = p;
  const photos = (d?.gallery || []).filter((g) => g?.author || g?.licence);
  const rows = (d?.credits || []).filter((c) => c?.name);
  if (!photos.length && !rows.length && !hasRoutes && !guideUrl && !osm) return null;
  return (
    <details className="pt-fold">
      <summary>{t('destx.sources')}</summary>
      <ul>
        {photos.map((g) => {
          const href = safeUrl(g.page);
          const text = [g.caption, [g.author, g.licence].filter(Boolean).join(', ')].filter(Boolean).join(': ');
          return <li key={g.url}>{href ? <a href={href} target="_blank" rel="noreferrer">{text}</a> : text}</li>;
        })}
        {rows.map((c) => {
          const href = safeUrl(c.url);
          const text = [c.name, c.licence && c.licence !== 'see site' ? c.licence : null].filter(Boolean).join(', ');
          return <li key={c.key || c.name}>{href ? <a href={href} target="_blank" rel="noreferrer">{text}</a> : text}</li>;
        })}
        {hasRoutes && <li>{t('dest.routesCredit')}</li>}
        {/* The ODbL credit for the car parks shown (T1030: off the panel). */}
        {osm && <li>{t('explore.parkCredit')}</li>}
        {guideUrl && <li><a href={guideUrl} target="_blank" rel="noreferrer">{t('detail.readGuide')}</a></li>}
      </ul>
    </details>
  );
}

/** A link inside a card: the first the card's one button, the rest quiet. */
function CardLinks({ links }) {
  if (!links.length) return null;
  const [first, ...rest] = links;
  return (
    <>
      <PartnerNote links={links} />
      <div className="pcard-links">
        {[first, ...rest].map((l, i) => (
          <a key={l.key} {...partnerLinkProps(l.href, { className: i ? 'pcard-alt' : 'pcard-go' })}>
            {l.label}
            {!i && <ExternalIcon size={13} />}
            <PartnerMark href={l.href} />
          </a>
        ))}
      </div>
    </>
  );
}

export function DestPractical({ p }) {
  const {
    t, lang, destination, getting, rhythm,
    month, tours, flightLinks, bookPhoto, isOpen, toggle, bookAhead,
    aroundStat, airportText, airportIata, carDayEur,
  } = p;
  const matchFit = useFit(destination, month);
  const qf = quickFacts(p);
  const truth = React.useMemo(() => parkingTruth(p.parking), [p.parking]);
  // D21: shown only when OpenStreetMap carries a wheelchair tag for this place.
  const destInfo = useDestInfo(destination);
  const access = React.useMemo(() => accessCard(destInfo?.access, t, lang), [destInfo, t, lang]);
  const aroundBits = [
    aroundStat?.value || null,
    getting?.why && lang === 'en' ? getting.why : null,
    Number.isFinite(carDayEur) && carDayEur > 0
      ? t('destx.carHire', { price: formatMoney(carDayEur, { precision: 'whole', locale: lang }) }) : null,
  ].filter(Boolean);

  // T1027 + T1028 (owner: swipeable, then "the same kind of structure",
  // clean and aligned): every card is one shape. A 44 px slot (the icon,
  // or the sight's photograph for Book ahead), a small label, the fact in
  // ink, a quieter line, and the card's links at its foot. One ground, one
  // accent; a warning differs only in its slot's amber.
  const cards = [
    (bookAhead.length > 0 || tours.length > 0) && {
      key: 'book', photo: bookPhoto, Icon: TicketIcon,
      title: bookAhead.length ? t('destx.qf.bookAhead') : t('pc.tickets'), value: bookAhead.join(', '), links: tours,
    },
    (airportIata || flightLinks.length > 0) && {
      key: 'air', Icon: PlaneIcon, title: t('destx.airport'), value: airportIata, text: airportText, links: flightLinks,
    },
    aroundBits.length > 0 && { key: 'around', Icon: BusIcon, title: t('dest.keyAround'), text: aroundBits.join(' ') },
    rhythm && lang === 'en' && { key: 'rhythm', Icon: ClockIcon, title: t('destx.rhythm'), text: rhythm },
    access && { key: 'access', Icon: AccessIcon, title: t('access.title'), text: access.lines.join(' '), note: access.source },
    ...practicalSlotRows(p),
  ].filter(Boolean);

  return (
    <PSection id="pt-practical" title={t('destx.jump.practical')}>
      {cards.length > 0 && (
        <ul className="pcards" aria-label={t('destx.jump.practical')}>
          {cards.map((c) => (
            <li key={c.key} className={`pcard${c.tone === 'warn' ? ' is-warn' : ''}`} data-testid={`pr-${c.key}`}>
              <span className="pcard-slot" aria-hidden="true">
                {c.photo ? <img src={c.photo} alt="" loading="lazy" decoding="async" /> : c.Icon && <c.Icon size={20} />}
              </span>
              <h3 className="pcard-title">{c.title}</h3>
              {c.value && <p className="pcard-value">{c.value}</p>}
              {c.text && <p className="pcard-text">{c.text}</p>}
              {c.note && <p className="pcard-note">{c.note}</p>}
              {c.links?.length > 0 && <CardLinks links={c.links} />}
            </li>
          ))}
        </ul>
      )}

      {qf.length > 0 && (
        <dl className="pt-qf">
          {qf.map((f) => (
            <div key={f.k}>
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <BeforeYouGo p={p} truth={truth} glyphs={PACK_GLYPH} />

      <div className="destp-folds pt-folds">
        {/* T765: the personal match, one bar per pick and every conflict. */}
        {showMatch(matchFit) && (
          <Fold level={3}
            id="sec-match"
            icon={SparkIcon}
            title={t('fit.title')}
            summary={t('fit.pct', { pct: matchFit.pct })}
            open={isOpen('match')}
            onToggle={() => toggle('match')}
          >
            <WhyItMatches place={destination} month={month} />
          </Fold>
        )}

      </div>

      <Credits p={p} osm={!!truth && (truth.spots.length > 0 || truth.rides.some((r) => r.nav))} />
    </PSection>
  );
}
