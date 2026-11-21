import React, { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, Field } from '../../components/ui/index.js';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { inUnit } from '../../lib/price/priceView.js';
import { formatMoney } from '../../lib/money.js';
import { PencilIcon, HeartIcon, CheckIcon } from '../../components/Icons.jsx';
import { MAX_NOTE } from '../../lib/savedLists.js';
import { voteState, memberOf, canRemoveItem } from '../../lib/sharedListModel.js';
import { CardMenu, Faces } from './parts.jsx';

/** Two letters for a face: the first of the first two words. */
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export function initialsOf(name = '') {
  const w = String(name).replace(/^@/, '').trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '').slice(0, 2)).toUpperCase();
}

/** People in the one shape Faces draws. */
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export const facesOf = (people = []) => people.map((p) => ({ id: p.userId, name: p.name, initials: p.emoji || initialsOf(p.name) }));

/** The name a member goes by on a row: "You" for the viewer. */
const whoName = (t, p, me) => (p?.userId === me ? t('mt2.you') : (p?.name || ''));

/**
 * One thing in a shared list (T941, G12 polish): a 120 px photo and one
 * column beside it, the name, flag and today's figure in the traveller's
 * unit, bed and food under it, who added it, and at the photo's bottom edge
 * the heart vote with the voters' faces and the row menu. The shared note
 * runs full width under the row. The select box shows only in choose mode.
 */
export function SharedItem({
  list, item, row, cost, choices = null, me, choosing = false, selected, onSelect, onOpen, onRemove, act,
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.note || '');
  const vote = voteState(item, me);
  const by = memberOf(list, item.addedBy);
  const name = row.name || item.name || row.id;
  const k = item.key;
  const cc = row.cc || item.cc;
  const cbId = `mt-sel-sh-${item.id.replace(/[^\w-]/g, '_')}`;
  const votedBy = list.members.filter((m) => item.votes.includes(m.userId));
  const voters = votedBy.map((m) => whoName(t, m, me));
  const fig = cost ? inUnit(cost.dayEur, choices) : null;
  const bed = cost && Number.isFinite(cost.stayEur) ? inUnit(cost.stayEur, choices) : null;
  const food = Number.isFinite(bed) && Number.isFinite(cost?.dayEur) ? inUnit(cost.dayEur - cost.stayEur, choices) : null;
  return (
    <li className={`mt-item is-shared${choosing ? ' is-choosing' : ''}${selected ? ' is-selected' : ''}`}>
      {choosing && (
        <span className="mt-item-check">
          <input type="checkbox" id={cbId} checked={selected} onChange={() => onSelect(k)} disabled={row.missing} />
          <label htmlFor={cbId} className="sr-only">{t('mt.selectItem', { name })}</label>
        </span>
      )}
      <span className="mt-item-media" onClick={() => !row.missing && onOpen(row)} aria-hidden="true">
        <HeroImage url={row.img || item.img} city={name} iso2={cc} className="mt-item-img" maxWidth={480} ratio={[4, 3]} sizes="(min-width: 1100px) 33vw, 120px" />
      </span>
      <div className="mt-scard-tx">
        <span className="mt-scard-top">
          <span className="mt-item-title">
            <Button variant="quiet" className="mt-item-name" onClick={() => onOpen(row)} disabled={row.missing}>{name}</Button>
            {cc && <CountryFlag country={cc} size={16} />}
          </span>
          {Number.isFinite(fig) && <b className="mt-item-fig num">{formatMoney(fig)}</b>}
        </span>
        {Number.isFinite(bed) && Number.isFinite(food) && (
          <span className="mt-scard-sub mt-scard-cost">{t('mt.bedFood', { bed: formatMoney(bed), food: formatMoney(food) })}</span>
        )}
        {by && (
          <span className="mt-scard-sub mt-shared-by">
            <Faces people={facesOf([by])} max={1} />
            {by.userId === me ? t('mt.byYou') : t('mt.byName', { name: String(by.name || '').split(/\s+/)[0] })}
          </span>
        )}
        <span className="mt-scard-acts">
          <Pressable
            className={`mt-vote${vote.mine ? ' is-on' : ''}`}
            haptic="tick"
            aria-pressed={vote.mine}
            onClick={() => act.vote(list.id, item.id, !vote.mine)}
            aria-label={t(vote.mine ? 'mt2.unvote' : 'mt2.vote', { name, n: vote.n })}
          >
            <HeartIcon size={18} />{vote.n}
          </Pressable>
          {votedBy.length > 0 && (
            <span className="mt-vfaces" role="img" aria-label={t('mt.votedBy', { names: voters.join(', ') })}>
              <Faces people={facesOf(votedBy)} max={4} me={me} />
            </span>
          )}
          <CardMenu
            label={t('mt.itemMenu', { name })}
            actions={[
              { key: 'note', label: t(item.note ? 'mt.editNote' : 'mt.addNote'), icon: <PencilIcon size={16} />, onClick: () => { setDraft(item.note || ''); setEditing(true); } },
            ]}
            onRemove={canRemoveItem(list, item, me) ? () => onRemove(item, name) : undefined}
            removeLabel={t('saved.removeItem', { name })}
          />
        </span>
      </div>
      {editing ? (
        <form className="mt-note-form mt-scard-note" onSubmit={(e) => { e.preventDefault(); act.note(list.id, item.id, draft); setEditing(false); }}>
          <Field label={t('mt.note')} value={draft} maxLength={MAX_NOTE} onChange={(e) => setDraft(e.target.value)} autoFocus />
          <Button size="sm" type="submit">{t('saved.done')}</Button>
        </form>
      ) : item.note ? (
        <Pressable className="mt-scard-note mt-item-note" onClick={() => { setDraft(item.note); setEditing(true); }}>
          <PencilIcon size={14} /><span>{item.note}</span>
        </Pressable>
      ) : null}
    </li>
  );
}

/**
 * The friend picker (T941): accepted friends as chips with a tick, and one
 * button. Sharing a private list and adding people to a shared one both use
 * it; for a shared list the members stand above it, each removable by the
 * owner, and a member who is not the owner sees the members only.
 */
export function PeoplePicker({
  friends = [], members = null, me, owner = false, submitLabel, onSubmit, onRemoveMember, onClose,
}) {
  const { t } = useI18n();
  const [picked, setPicked] = useState([]);
  const toggle = (id) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <div className="mt-people" role="group" aria-label={t('mt2.people')}>
      {members && (
        <ul className="mt-people-list">
          {members.map((m) => (
            <li key={m.userId} className="mt-people-row">
              <Faces people={facesOf([m])} max={1} />
              <span className="mt-people-name">{whoName(t, m, me)}</span>
              {owner && m.userId !== me && (
                <Button variant="quiet" size="sm" onClick={() => onRemoveMember(m)}>{t('mt2.removePerson')}</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {(owner || !members) && friends.length > 0 && (
        <div className="mt-pick-lists">
          {friends.map((f) => (
            <Chip key={f.userId} kind="filter" selected={picked.includes(f.userId)} onClick={() => toggle(f.userId)}>
              {f.displayName || `@${f.handle}`}
            </Chip>
          ))}
        </div>
      )}
      {(owner || !members) && !friends.length && <p className="mt-muted">{t('mt2.noFriendsLeft')}</p>}
      <div className="mt-people-foot">
        {(owner || !members) && friends.length > 0 && (
          <Button iconStart={<CheckIcon size={16} />} disabled={!picked.length} onClick={() => { onSubmit(picked); setPicked([]); }}>
            {submitLabel(picked.length)}
          </Button>
        )}
        <Button variant="quiet" onClick={onClose}>{t('saved.done')}</Button>
      </div>
    </div>
  );
}
