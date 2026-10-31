import React, { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, Chip, Field, IconButton } from '../components/ui/index.js';
import { ArrowLeftIcon, ExternalIcon, PlusIcon, TrashIcon } from '../components/Icons.jsx';
import { formatMoney } from '../lib/money.js';
import { payHost } from '../auth/groupExpenses.js';
import { settleUp, toCents } from './settle.js';
import { useTogether, togetherActions } from './useTogether.js';
import { Block, ToneFace, firstName } from './parts.jsx';
import { IS_FRIENDS_MOCK } from './friendsMock.js';

/**
 * Settle up (T940, migration 058): the members of a group trip log what
 * they paid for the group and see who pays whom in the fewest transfers
 * (src/together/settle.js). Money moves outside Carta, through the payee's
 * own payment link when they set one; "Mark as paid" then writes the
 * transfer, which either of its two people may do. Amounts are in cents,
 * as on every ledger.
 *
 * Before 058 the store answers `missing` and nothing here is drawn.
 */

const EMPTY_LEDGER = Object.freeze({ missing: false, expenses: [], settlements: [], payLinks: new Map() });
const cents = (c) => formatMoney(c / 100, { precision: 'cents' });

/** The group's ledger from the store, read once when first shown. Null
 *  while it loads; `missing` before 058. */
function useLedger(groupId) {
  const s = useTogether();
  const ledger = s.ledgers?.[groupId] || (IS_FRIENDS_MOCK ? EMPTY_LEDGER : null);
  useEffect(() => {
    if (groupId && !s.ledgers?.[groupId] && !IS_FRIENDS_MOCK) togetherActions.loadLedger(groupId);
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps -- once per group
  return ledger;
}

/** The group page's row: what the group spent and the way to Settle up. */
export function GroupCosts({ g, onOpen }) {
  const { t } = useI18n();
  const ledger = useLedger(g.id);
  if (!ledger || ledger.missing) return null;
  const { spentCents } = settleUp(ledger.expenses, ledger.settlements);
  return (
    <div className="tg-fit tg-o-plans">
      <div className="tg-fit-row">
        <span>{t('tg2.sharedCosts')}</span>
        <b>{cents(spentCents)}</b>
      </div>
      <Button variant="secondary" onClick={onOpen}>{t('tg2.settleUp')}</Button>
    </div>
  );
}

export function SettleView({ headRef, groupId, onView }) {
  const { t } = useI18n();
  const s = useTogether();
  const g = s.groups.find((x) => x.id === groupId);
  const ledger = useLedger(groupId);
  const me = s.userId;
  const [error, setError] = useState('');
  const [what, setWhat] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(me);
  const [split, setSplit] = useState(null);
  const [busy, setBusy] = useState(false);

  const joined = useMemo(() => (g?.members || []).filter((m) => m.status === 'joined'), [g]);
  const nameOfId = (id) => firstName(joined.find((m) => m.userId === id)?.name || '');
  const result = useMemo(() => (ledger ? settleUp(ledger.expenses, ledger.settlements) : null), [ledger]);
  const among = split || joined.map((m) => m.userId);

  const back = (
    <Button variant="quiet" size="sm" className="tg-back" iconStart={<ArrowLeftIcon size={16} />} onClick={() => onView('group', groupId)}>
      {g?.title || t('tg.title')}
    </Button>
  );
  const head = (
    <div className="tg-head is-sub">{back}<h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('tg2.settleUp')}</h1></div>
  );
  if (!g || g.myStatus !== 'joined' || !ledger || ledger.missing) {
    return (
      <div className="tg-page">
        {head}
        {(!g || ledger?.missing) && <p className="tg-muted">{t('tg.groupGone')}</p>}
      </div>
    );
  }

  const fail = () => setError(t('friends.unavailable'));
  const cents$ = toCents(amount);
  const canAdd = cents$ != null && among.length > 0 && paidBy;
  const add = async (e) => {
    e.preventDefault();
    if (!canAdd) return;
    setBusy(true);
    setError('');
    try {
      await togetherActions.addExpense(g.id, { paidBy, amountCents: cents$, description: what.trim().slice(0, 80), splitAmong: among });
      setWhat('');
      setAmount('');
      setSplit(null);
    } catch { fail(); } finally { setBusy(false); }
  };
  const toggleSplit = (id) => setSplit(() => {
    const cur = new Set(among);
    if (cur.has(id)) cur.delete(id); else cur.add(id);
    return joined.map((m) => m.userId).filter((x) => cur.has(x));
  });
  const owedToMe = result.transfers.some((tr) => tr.to === me);
  const transferLine = (tr) => (tr.from === me ? t('tg2.youPay', { to: nameOfId(tr.to) })
    : tr.to === me ? t('tg2.paysYou', { from: nameOfId(tr.from) })
      : t('tg2.pays', { from: nameOfId(tr.from), to: nameOfId(tr.to) }));
  const canDrop = (row) => row.createdBy === me || g.ownerId === me;
  const rows = [
    ...ledger.expenses.map((x) => ({ kind: 'e', ...x })),
    ...ledger.settlements.map((x) => ({ kind: 's', ...x })),
  ].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  return (
    <div className="tg-page">
      {head}
      {error && <div className="auth-error" role="alert">{error}</div>}
      <div className="tg-grid">
        <div className="tg-col">
          <Block id="tg-pay-h" title={t('tg2.whoPays')} className="tg-o-meet">
            {result.transfers.length === 0 ? (
              <p className="tg-muted tg-square">{t('tg2.allSquare')}</p>
            ) : (
              <div className="tg-wait">
                {result.transfers.map((tr) => {
                  const link = tr.from === me ? ledger.payLinks.get(tr.to) : null;
                  const mine = tr.from === me || tr.to === me;
                  return (
                    <div className="tg-wr" key={`${tr.from}>${tr.to}`}>
                      <ToneFace id={tr.from} me={me} name={joined.find((m) => m.userId === tr.from)?.name || ''} />
                      <span className="tg-wr-tx">
                        <b>{transferLine(tr)}</b>
                        <span className="tg-amount">{cents(tr.amountCents)}</span>
                      </span>
                      {(link || mine) && (
                        <span className="tg-wr-acts">
                          {link && (
                            <a className="btn btn-secondary btn-sm" href={link} target="_blank" rel="noopener noreferrer">
                              <span className="btn-label">{t('tg2.payWith', { site: payHost(link) })}</span>
                              <span className="btn-icon" aria-hidden="true"><ExternalIcon size={16} /></span>
                            </a>
                          )}
                          {mine && (
                            <Button variant={link ? 'quiet' : 'secondary'} size="sm"
                              onClick={() => togetherActions.markPaid(g.id, tr).catch(fail)}>
                              {t('tg2.markPaid')}
                            </Button>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {owedToMe && !s.payLink && !s.payLinkMissing && (
              <div>
                <Button variant="quiet" size="sm" iconStart={<PlusIcon size={16} />} onClick={() => onView('privacy')}>{t('tg2.addPayLink')}</Button>
              </div>
            )}
          </Block>
        </div>
        <div className="tg-col">
          <Block id="tg-costs-h" title={t('tg2.sharedCosts')} className="tg-o-groups"
            action={<b className="tg-amount">{cents(result.spentCents)}</b>}>
            <form className="tg-new tg-addcost" onSubmit={add}>
              <div className="tg-addcost-row">
                <Field label={t('tg2.what')} value={what} maxLength={80} onChange={(e) => setWhat(e.target.value)} />
                <Field label={t('tg2.amount')} value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)}
                  error={amount && cents$ == null ? t('tg2.amountBad') : undefined} />
              </div>
              <Field as="select" label={t('tg2.paidByLabel')} value={paidBy || ''} onChange={(e) => setPaidBy(e.target.value)}>
                {joined.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
              </Field>
              <div className="tg-pick" role="group" aria-label={t('tg2.splitAmong')}>
                <span className="tg-label">{t('tg2.splitAmong')}</span>
                {joined.map((m) => (
                  <Chip key={m.userId} selected={among.includes(m.userId)} onClick={() => toggleSplit(m.userId)}>{firstName(m.name)}</Chip>
                ))}
              </div>
              <div>
                <Button type="submit" variant="primary" loading={busy} disabled={!canAdd} iconStart={<PlusIcon size={16} />}>{t('tg2.addCost')}</Button>
              </div>
            </form>
            {rows.length > 0 && (
              <ul className="tg-ledger">
                {rows.map((r) => (
                  <li key={`${r.kind}${r.id}`}>
                    <span className="tg-ledger-tx">
                      {r.kind === 'e'
                        ? <span>{t('tg2.costBy', { what: r.description || t('tg2.cost'), who: nameOfId(r.paidBy) })}</span>
                        : <span>{t('tg2.paidBack', { from: nameOfId(r.from), to: nameOfId(r.to) })}</span>}
                    </span>
                    <span className="tg-amount">{cents(r.amountCents)}</span>
                    {canDrop(r) ? (
                      <IconButton label={t('tg2.remove')}
                        onClick={() => (r.kind === 'e' ? togetherActions.deleteExpense(g.id, r.id) : togetherActions.deleteSettlement(g.id, r.id)).catch(fail)}>
                        <TrashIcon size={16} />
                      </IconButton>
                    ) : <span className="tg-ledger-gap" aria-hidden="true" />}
                  </li>
                ))}
              </ul>
            )}
          </Block>
        </div>
      </div>
    </div>
  );
}
