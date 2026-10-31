import React, { useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, Field } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlag } from '../../components/CountryFlag.jsx';
import { DayPrice } from '../../browse/ExploreCards.jsx';
import { PencilIcon, HeartIcon, CheckIcon } from '../../components/Icons.jsx';
import { FAV_KIND_LABEL } from '../../lib/favorites.js';
import { MAX_NOTE } from '../../lib/savedLists.js';
import { voteState, memberOf, canRemoveItem } from '../../lib/sharedListModel.js';
import { CardMenu, Faces } from './parts.jsx';

/** Two letters for a face: the first of the first two words. */
export function initialsOf(name = '') {
  const w = String(name).replace(/^@/, '').trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '').slice(0, 2)).toUpperCase();
}

/** People in the one shape Faces draws. */
export const facesOf = (people = []) => people.map((p) => ({ id: p.userId, name: p.name, initials: p.emoji || initialsOf(p.name) }));

/** The name a member goes by on a row: "You" for the viewer. */
const whoName = (t, p, me) => (p?.userId === me ? t('mt2.you') : (p?.name || ''));

/**
 * One thing in a shared list (T941): the select box, photo, kind, name and
 * today's price as a private row has, then who added it, the one shared note
 * and the votes, one heart a member.
 */
export function SharedItem({
  list, item, row, cost, me, selected, onSelect, onOpen, onRemove, act,
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.note || '');
  const vote = voteState(item, me);
  const by = memberOf(list, item.addedBy);
  const name = row.name || item.name || row.id;
  const k = item.key;
  const cbId = `mt-sel-sh-${item.id.replace(/[^\w-]/g, '_')}`;
  const voters = list.members.filter((m) => item.votes.includes(m.userId)).map((m) => whoName(t, m, me));
  return (
    <li className={`mt-item${selected ? ' is-selected' : ''}`}>
      <span className="mt-item-check">
        <input type="checkbox" id={cbId} checked={selected} onChange={() => onSelect(k)} disabled={row.missing} />
        <label htmlFor={cbId} className="sr-only">{t('mt.selectItem', { name })}</label>
      </span>
      <span className="mt-item-media" onClick={() => !row.missing && onOpen(row)} aria-hidden="true">
        <HeroImage url={row.img || item.img} city={name} iso2={row.cc || item.cc} className="mt-item-img" maxWidth={330} ratio={[1, 1]} sizes="88px" />
      </span>
      <div className="mt-item-body">
        <span className="mt-item-kind">
          {(row.cc || item.cc) && <CountryFlag country={row.cc || item.cc} size={14} />}
          {[FAV_KIND_LABEL[item.kind] ? t(FAV_KIND_LABEL[item.kind]) : '', row.sub].filter(Boolean).join(', ')}
        </span>
        <Button variant="quiet" className="mt-item-name" onClick={() => onOpen(row)} disabled={row.missing}>{name}</Button>
        {cost && <span className="mt-item-price"><DayPrice cost={cost} t={t} /></span>}
        <span className="mt-shared-row">
          {by && (
            <span className="mt-shared-by">
              <Faces people={facesOf([by])} max={1} />
              {t('mt2.addedBy', { name: by.userId === me ? t('mt2.you') : String(by.name || '').split(/\s+/)[0] })}
            </span>
          )}
          <Chip
            kind="filter"
            selected={vote.mine}
            className="mt-vote"
            icon={<HeartIcon size={16} />}
            onClick={() => act.vote(list.id, item.id, !vote.mine)}
            aria-label={t(vote.mine ? 'mt2.unvote' : 'mt2.vote', { name, n: vote.n })}
            title={voters.join(', ') || undefined}
          >
            {vote.n}
          </Chip>
        </span>
        {editing ? (
          <form className="mt-note-form" onSubmit={(e) => { e.preventDefault(); act.note(list.id, item.id, draft); setEditing(false); }}>
            <Field label={t('mt.note')} value={draft} maxLength={MAX_NOTE} onChange={(e) => setDraft(e.target.value)} autoFocus />
            <Button size="sm" type="submit">{t('saved.done')}</Button>
          </form>
        ) : item.note ? (
          <Button variant="quiet" size="sm" className="mt-item-note" iconStart={<PencilIcon size={14} />} onClick={() => { setDraft(item.note); setEditing(true); }}>
            {item.note}
          </Button>
        ) : null}
      </div>
      <CardMenu
        label={t('mt.itemMenu', { name })}
        actions={[
          { key: 'note', label: t(item.note ? 'mt.editNote' : 'mt.addNote'), icon: <PencilIcon size={16} />, onClick: () => { setDraft(item.note || ''); setEditing(true); } },
        ]}
        onRemove={canRemoveItem(list, item, me) ? () => onRemove(item, name) : undefined}
        removeLabel={t('saved.removeItem', { name })}
      />
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
