import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Card, Chip } from '../components/ui/index.js';
import { HeroImage } from '../components/HeroImage.jsx';
import { ScoreChip, HiddenGemTag } from '../components/RatingBadge.jsx';
import { CountryFlag } from '../components/CountryFlag.jsx';
import {
  AlertIcon, MountainIcon, CloudIcon, CompassIcon, SnowIcon, ClockIcon, StormIcon, SwimIcon,
  FerryIcon, BootIcon, BeachIcon, BottleIcon, BanIcon, RoadIcon, RouteIcon, BikeIcon, CarIcon,
  SuitcaseIcon, CalendarIcon, FamilyIcon, BedIcon, TrainIcon, BusIcon, MapPinIcon, CheckIcon,
  CloseIcon, DiningIcon, TicketIcon, ReceiptIcon,
} from '../components/Icons.jsx';
import { capFirst } from '../lib/detailSkeleton.js';

/**
 * The small parts the item pages and the trip page share (T430, T431), so
 * the six item types and the trip read as one family:
 *
 *   BeforeYouGo        at most four short icon rows, safety first
 *   HighlightCard      a photograph, a few words and one line: "Why go"
 *   AlternativeCard    a large photo card for "Not quite right?"
 *   IncludedList       what a price covers and what it does not, as rows
 *   SourcesLine        one line of source links at the foot of the page
 *
 * Every icon is a line icon from Icons.jsx in --text-2, decorative and
 * hidden from screen readers: the words carry the meaning.
 */
export const ITEM_ICONS = {
  alert: AlertIcon, mountain: MountainIcon, cloud: CloudIcon, compass: CompassIcon, snow: SnowIcon,
  clock: ClockIcon, storm: StormIcon, swim: SwimIcon, ferry: FerryIcon, boot: BootIcon,
  beach: BeachIcon, bottle: BottleIcon, ban: BanIcon, road: RoadIcon, route: RouteIcon, bike: BikeIcon,
  car: CarIcon, suitcase: SuitcaseIcon, calendar: CalendarIcon, family: FamilyIcon, bed: BedIcon,
  train: TrainIcon, bus: BusIcon, pin: MapPinIcon, dining: DiningIcon, ticket: TicketIcon,
  receipt: ReceiptIcon,
};

export function ItemIcon({ name, size = 20 }) {
  const Icon = ITEM_ICONS[name];
  if (!Icon) return null;
  return <span className="iicon" aria-hidden="true"><Icon size={size} /></span>;
}

/**
 * The head of an item page: the full name (never cut), the Score with its
 * band word, the hidden gem, where it is with the flag, and an optional
 * local name. Status chips (UNESCO, a loop) ride after where.
 */
export function ItemHead({ title, iso2 = null, where = '', rating = null, gem = false, chips = null, sub = '', after = null }) {
  return (
    <>
      <h1 tabIndex={-1}>{title}</h1>
      {sub && <p className="ihead-sub">{sub}</p>}
      <div className="ihead-line">
        {rating && <ScoreChip rating={rating} size="lg" band />}
        {gem && <HiddenGemTag />}
        {where && (
          <span className="ihead-where">
            {iso2 && <CountryFlag country={iso2} size={15} />}
            <span>{where}</span>
          </span>
        )}
        {chips}
      </div>
      {after}
    </>
  );
}

/** Before you go: rows from lib/beforeGo.js beforeGoItems. */
export function BeforeYouGo({ items, headingId = 'ibyg-h' }) {
  const { t } = useI18n();
  if (!items?.length) return null;
  const tr = (key, params) => {
    const p = { ...params };
    if (p.word) p.word = capFirst(p.word);
    return t(key, p);
  };
  return (
    <section className="ibyg" data-slot="beforego" aria-labelledby={headingId}>
      <h2 id={headingId}>{t('go.head')}</h2>
      <ul className="ibyg-list">
        {items.map((it) => (
          <li key={it.key} className={`ibyg-row${it.safety ? ' is-safety' : ''}`}>
            <ItemIcon name={it.icon} />
            <span className="ibyg-text">
              <span className="ibyg-t">{tr(it.titleKey, it.params)}</span>
              <span className="ibyg-s">{tr(it.subKey, it.params)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One highlight: the photograph, its name, one line. */
export function HighlightCard({ photo = null, title, line = '', meta = '', iso2 }) {
  return (
    <article className="ihl">
      <div className="ihl-media">
        {photo?.url
          ? <img src={photo.url} srcSet={photo.srcSet || undefined}
              sizes="(max-width: 720px) 80vw, 360px" alt="" loading="lazy" decoding="async"
              width={photo.w || 4} height={photo.h || 3} />
          : <HeroImage url={null} city={title} iso2={iso2} className="ihl-blank" />}
      </div>
      <div className="ihl-body">
        <h3 className="ihl-title">{title}</h3>
        {line && <p className="ihl-line">{line}</p>}
        {meta && <p className="ihl-meta">{meta}</p>}
        {photo?.author && <p className="ihl-credit">{[photo.author, photo.licence].filter(Boolean).join(', ')}</p>}
      </div>
    </article>
  );
}

/**
 * One way out ("Not quite right?"): a large photo tile with the reason as a
 * status chip ("Easier", "Cheaper"), the full name, where, and the one fact
 * that changed. `href` keeps it a real link; `onOpen` opens it in place.
 */
export function AlternativeCard({ kind, title, photoUrl = null, where = '', fact = '', price = null, rating = null, href, onOpen, iso2 }) {
  return (
    <Card
      layout="tile"
      as="div"
      wrap
      className="ialt"
      media={<HeroImage url={photoUrl} city={title} iso2={iso2} className="ialt-img" maxWidth={960}
        sizes="(max-width: 720px) 86vw, 380px" ratio={[3, 2]} />}
      title={title}
      href={href}
      onOpen={onOpen}
      meta={(
        <span className="ialt-meta">
          {kind && <Chip kind="status" className="ialt-kind">{kind}</Chip>}
          {where && <span className="ialt-where">{where}</span>}
          {fact && <span className="ialt-fact">{fact}</span>}
        </span>
      )}
      price={price}
      rating={rating ? <ScoreChip rating={rating} size="sm" /> : null}
    />
  );
}

/** What a price covers: rows with a tick or a cross and the thing's name. */
export function IncludedList({ rows, label }) {
  if (!rows?.length) return null;
  return (
    <ul className="iinc" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key} className={`iinc-row${r.in ? ' is-in' : ' is-out'}`}>
          <span className="iinc-mark" aria-hidden="true">{r.in ? <CheckIcon size={16} /> : <CloseIcon size={16} />}</span>
          <span className="iinc-label">
            <span className="sr-only">{r.srState} </span>
            {r.label}
          </span>
          {r.value && <span className="iinc-value">{r.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Sources, one line at the foot of the page: "Sources: OpenStreetMap,
 *  Wikipedia". Each name a link where there is one. */
export function SourcesLine({ items = [], children = null }) {
  const { t } = useI18n();
  const list = items.filter((s) => s && s.label);
  if (!list.length && !children) return null;
  return (
    <div className="isrc" data-slot="sources">
      {list.length > 0 && (
        <p className="isrc-line">
          <span>{t('item.sources')} </span>
          {list.map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && ', '}
              {s.href
                ? <a href={s.href} target="_blank" rel="noreferrer">{s.label}</a>
                : <span>{s.label}</span>}
            </React.Fragment>
          ))}
        </p>
      )}
      {children}
    </div>
  );
}

