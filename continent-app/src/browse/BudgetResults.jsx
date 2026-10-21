import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, Card, IconButton } from '../components/ui/index.js';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { CloseIcon } from '../components/Icons.jsx';
import { countryName } from '../lib/countryName.js';
import { formatMoney, formatEst } from '../lib/money.js';
import { budgetReceipt } from '../lib/budgetSearch.js';

/**
 * The answer to a budget search (T506, roadmap 1.19): "Places that fit
 * {price}", then two groups, Fits and Tight, each a list of compact rows
 * with the total for the group as the headline price and the day price a
 * person under it (T475-c), and what is left. One line says how many places
 * are just over and what more would bring them in; nothing too dear is
 * listed. A row opens its receipt: inline under the row on a phone, in a
 * sticky column beside the list from 1024 px.
 *
 * Every figure is read from the search result (lib/budgetSearch.js, which
 * prices through priceTrip); this file formats and lays out, nothing more.
 */
const PAGE = { fits: 10, tight: 5 };
const WIDE = '(min-width: 1024px)';

function useWide() {
  const [wide, setWide] = React.useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(WIDE).matches,
  );
  React.useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

export function BudgetResults({ result, onOpen, onClear, monthName, pct, people }) {
  const { t, lang } = useI18n();
  const wide = useWide();
  const [openId, setOpenId] = React.useState(null);
  const [shown, setShown] = React.useState(PAGE);
  const q = result.query;
  const money = (v, est = false) => (est ? formatEst(v, t('money.est')) : formatMoney(v));
  const all = [...result.fits, ...result.tight];
  const open = all.find((x) => x.id === openId) || null;

  const receipt = open && (
    <BudgetReceipt key={open.id} item={open} q={q} people={people} monthName={monthName} pct={pct}
      money={money} onOpen={onOpen} onClose={() => setOpenId(null)} />
  );

  const row = (x, group) => {
    const d = x.dest;
    const country = countryName(d.iso2, d.country || '', lang);
    const left = group === 'tight' ? t('budget.tightLeft', { price: money(x.left) }) : t('budget.left', { price: money(x.left) });
    const headline = q.head === 1
      ? t('budget.forPerson', { price: money(x.total, x.est) })
      : t('budget.forPeople', { price: money(x.total, x.est), n: q.head });
    return (
      <li key={x.id}>
        <Card
          layout="row"
          className="bgs-row"
          selected={openId === x.id}
          media={<HeroImage url={d.image?.url || null} city={d.city} iso2={d.iso2} className="bgs-row-img" maxWidth={160} />}
          title={d.city}
          onOpen={() => setOpenId((id) => (id === x.id ? null : x.id))}
          meta={<span>{country}</span>}
          rating={<ScoreChip rating={d.rating} size="sm" />}
          price={(
            <span className="bgs-price">
              <span className="bgs-price-total">{headline}</span>
              <span className="bgs-price-day">{t('budget.dayPp', { price: money(x.dayPp, x.est) })}</span>
              <span className="bgs-price-left">{left}</span>
            </span>
          )}
        />
        {!wide && openId === x.id && receipt}
      </li>
    );
  };

  const group = (key) => {
    const rows = result[key];
    if (!rows.length) return null;
    const n = shown[key];
    return (
      <div className="bgs-groupout" key={key}>
        <h3 className="bgs-group-title">{t(`budget.${key}`)}</h3>
        {key === 'tight' && <p className="bgs-note">{t('budget.tightNote')}</p>}
        <ul className="bgs-list">{rows.slice(0, n).map((x) => row(x, key))}</ul>
        {rows.length > n && (
          <Button size="sm" className="bgs-more"
            onClick={() => setShown((s) => ({ ...s, [key]: s[key] + PAGE[key] * 2 }))}>
            {t('budget.showMore')}
          </Button>
        )}
      </div>
    );
  };

  const over = result.over;
  const empty = !result.fits.length && !result.tight.length;
  return (
    <div className="bgs-results">
      <div className="bgs-results-head">
        <h3 className="bgs-results-title">{t('budget.resultsTitle', { price: money(q.budget) })}</h3>
        <Button variant="quiet" size="sm" onClick={onClear}>{t('budget.clear')}</Button>
      </div>
      <div className={`bgs-results-body${wide && open ? ' has-receipt' : ''}`}>
        <div className="bgs-results-main" aria-live="polite">
          {empty && <p className="bgs-note">{t('budget.none', { price: money(q.budget) })}</p>}
          {group('fits')}
          {group('tight')}
          {over.count > 0 && over.more > 0 && (
            <p className="bgs-note bgs-over">
              {over.count === 1
                ? t('budget.overOne', { price: money(over.more) })
                : t('budget.over', { n: over.count, price: money(over.more) })}
            </p>
          )}
        </div>
        {wide && open && <aside className="bgs-results-side">{receipt}</aside>}
      </div>
    </div>
  );
}

/**
 * The receipt of one result, the carta-design receipt in whole euros
 * (owner 1.8): a sunken head with the place and the stay, one hairline line
 * per priced part, the buffer, a 2 px rule, the total for the group with the
 * day price a person under it, then the lines Carta does not price yet,
 * named without an amount and never in the total, and a tinted foot with
 * what is left of the budget.
 */
function BudgetReceipt({ item, q, people, monthName, pct, money, onOpen, onClose }) {
  const { t } = useI18n();
  const r = budgetReceipt(item, q);
  const label = (l) => (l.key === 'buffer' ? t('budget.line.buffer', { pct: pct(l.pct) }) : t(`budget.line.${l.key}`));
  const unpricedLabel = (u) => (u.key === 'there' ? t(`budget.line.there.${u.mode}`) : t(`budget.line.${u.key}`));
  const titleId = `bgs-r-${item.id}`;
  const foot = r.left >= 0
    ? t('budget.footLeft', { left: money(r.left), budget: money(q.budget) })
    : t('budget.footTight', { over: money(-r.left), budget: money(q.budget), left: money(q.budget - item.core) });
  return (
    <section className="bgs-receipt" aria-labelledby={titleId}>
      <header className="bgs-receipt-head">
        <div>
          <h4 className="bgs-receipt-title" id={titleId}>{item.dest.city}</h4>
          <p className="bgs-receipt-sub">{t('budget.receiptSub', { people, nights: q.nights, month: monthName(q.month) })}</p>
        </div>
        <IconButton label={t('budget.close')} onClick={onClose}><CloseIcon size={16} /></IconButton>
      </header>
      <dl className="bgs-lines">
        {r.lines.map((l) => (
          <div className="bgs-line" key={l.key} data-line={l.key}>
            <dt>{label(l)}</dt>
            <dd>{money(l.eur, l.est)}</dd>
          </div>
        ))}
        <div className="bgs-line bgs-sum">
          <dt>{q.head === 1 ? t('budget.totalOne') : t('budget.total', { n: q.head })}</dt>
          <dd>
            <span className="bgs-sum-eur">{money(r.total, r.est)}</span>
            <span className="bgs-sum-day">{t('budget.dayPp', { price: money(r.dayPp, r.est) })}</span>
          </dd>
        </div>
      </dl>
      <h5 className="bgs-unpriced-title">{t('budget.notInTotal')}</h5>
      <dl className="bgs-lines bgs-unpriced">
        {r.unpriced.map((u) => (
          <div className="bgs-line" key={u.key} data-line={u.key}>
            <dt>{unpricedLabel(u)}</dt>
            <dd>{t('budget.notPriced')}</dd>
          </div>
        ))}
      </dl>
      <p className="bgs-receipt-foot">{foot}</p>
      <div className="bgs-receipt-actions">
        <Button size="sm" onClick={() => onOpen?.(item.id)}>{t('budget.open', { city: item.dest.city })}</Button>
      </div>
    </section>
  );
}
