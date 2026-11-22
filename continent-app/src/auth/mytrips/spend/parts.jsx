/*
 * The small parts of the Uitgaven page (G15): a person's face, a spend row
 * (the prototype's .row.r2) and the money formatters. Every euro goes
 * through formatMoney with cents (a ledger, PRODUCT.md); an amount in
 * another currency is written by Intl in that currency.
 */
import React from 'react';
import { Pressable } from '../../../components/ui/Pressable.jsx';
import { useI18n } from '../../../i18n/index.jsx';
import { formatMoney } from '../../../lib/money.js';
import { activeLocale } from '../../../lib/localeState.js';
import { CAT_GLYPH, LockGlyph, MeGlyph } from './icons.jsx';

/** Cents as a euro figure with cents. */
export const eur = (cents) => formatMoney((Number(cents) || 0) / 100, { precision: 'cents' });

/** An amount in its own currency ("100,00 PLN"); euro goes through formatMoney. */
export function formatIn(amount, currency = 'EUR') {
  if (!currency || currency === 'EUR') return formatMoney(Number(amount) || 0, { precision: 'cents' });
  try {
    return new Intl.NumberFormat(activeLocale(), { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount) || 0);
  } catch {
    return `${Math.round((Number(amount) || 0) * 100) / 100} ${currency}`;
  }
}

/** The name a person goes by on this page. */
export function personName(t, p, people) {
  if (!p) return '';
  if (p.me) return t('sp.you');
  if (p.name) return p.name;
  const seat = (people || []).filter((x) => !x.me).indexOf(p) + 2;
  return t('sp.seat', { n: seat });
}

function initials(t, p, people) {
  if (!p) return '?';
  if (p.me) return t('sp.you').slice(0, 1).toUpperCase();
  if (!p.name) return String((people || []).filter((x) => !x.me).indexOf(p) + 2);
  const w = p.name.trim().split(/\s+/);
  return `${w[0][0] || ''}${w.length > 1 ? w[w.length - 1][0] : ''}`.toUpperCase();
}

const ME_GLYPH = { dot: 11, xs: 12, md: 18, lg: 24 };

/** A face: the photo kept on this device, else the initials (you: a mark). Decorative:
 *  the name always stands next to it or in the control's label. */
export function Face({ person, people, faces = {}, size = 'md', className = '' }) {
  const { t } = useI18n();
  const src = person ? faces[person.id] : null;
  const cls = `sp-face is-${size}${person?.me ? ' is-me' : ''}${src ? ' has-photo' : ''} ${className}`.trim();
  return (
    <span className={cls} aria-hidden="true">
      {src ? <img src={src} alt="" /> : person?.me ? <MeGlyph size={ME_GLYPH[size] || 12} /> : initials(t, person, people)}
    </span>
  );
}

/**
 * One spend: the category glyph over two lines; the name and your share on
 * the first, who paid and the sharers' faces on the second. A private
 * spend shows the lock and "only you"; an old row its total together.
 */
export function SpendRow({ row, people, faces, onOpen, fresh = false }) {
  const { t } = useI18n();
  const Cat = CAT_GLYPH[row.cat] || CAT_GLYPH.other;
  const byId = (id) => people.find((p) => p.id === id);
  const payer = byId(row.payer);
  const name = row.desc || t(`sp.cat_${row.cat}`);
  const total = formatIn(row.amount, row.currency);
  const line = row.priv ? t('sp.onlyYou')
    : row.legacy ? t('sp.together', { amount: total })
      : `${personName(t, payer, people)} ${t(payer?.me ? 'sp.paidYou' : 'sp.paidOther', { amount: total })}`;
  const sharers = Object.keys(row.split).map(byId).filter(Boolean);
  return (
    <Pressable type="button" className={`sp-row${fresh ? ' is-fresh' : ''}`} onClick={() => onOpen(row.id)}>
      <span className="sp-row-cat"><Cat size={22} /></span>
      <span className="sp-row-nm">{name}</span>
      <span className="sp-row-am">{eur(row.mine)}</span>
      {row.priv ? (
        <span className="sp-row-by"><LockGlyph size={13} /><span>{line}</span></span>
      ) : row.legacy ? (
        <span className="sp-row-by"><span>{line}</span></span>
      ) : (
        <span className="sp-row-by">
          <Face person={payer} people={people} faces={faces} size="dot" />
          <span><b>{personName(t, payer, people)}</b> {t(payer?.me ? 'sp.paidYou' : 'sp.paidOther', { amount: total })}</span>
        </span>
      )}
      {!row.priv && (
        <span className="sp-row-sh">
          {sharers.map((p) => <Face key={p.id} person={p} people={people} faces={faces} size="xs" />)}
        </span>
      )}
    </Pressable>
  );
}
