import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { activeLocale } from '../../lib/localeState.js';
import { Button } from '../../components/ui/index.js';
import { CheckIcon, CloseIcon, UndoIcon } from '../../components/Icons.jsx';
import { decodeState } from '../../lib/urlState.js';
import {
  baseRates, evidenceItems, buildProfile, nodeLabel, positionBucket, profileSnapshot,
} from '../../lib/taste/profile.js';
import { useTasteVerdicts, browserStorage } from '../../lib/taste/store.js';
import { tickTaste } from '../../lib/taste/counts.js';
import { syncTaste } from '../../lib/taste/sync.js';
import '../../styles/71-taste.css';

/**
 * Your taste (T1152, ROADMAP F3) on My trips, Your Europe tab: the interests
 * Carta reads from the traveller's own saves, trips and filters, each chip
 * with the evidence behind it and a Yes and a No. Yes keeps the chip;
 * No hides it (listed under Hidden, with Show again) and counts against it.
 * The profile is lib/taste/profile.js; verdicts lib/taste/store.js, synced
 * to the account by lib/taste/sync.js; acceptance counted without ids by
 * lib/taste/counts.js.
 */

const STATE_KEY = 'continent.state.v1';
function readFilters() {
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    const st = raw ? decodeState(raw) : {};
    return { likes: st.taste?.likes || [], tripKinds: st.tripKinds || [] };
  } catch { return { likes: [], tripKinds: [] }; }
}

function EvidenceLine({ ev }) {
  const { t } = useI18n();
  const parts = [];
  if (ev.trips) parts.push(t(ev.trips === 1 ? 'taste.profile.evTrip1' : 'taste.profile.evTripN', { n: ev.trips }));
  if (ev.saves) parts.push(t(ev.saves === 1 ? 'taste.profile.evSave1' : 'taste.profile.evSaveN', { n: ev.saves }));
  if (ev.filters) parts.push(t('taste.profile.evFilter'));
  const names = ev.names.join('; ') + (ev.more ? ` ${t('taste.profile.evMore', { n: ev.more })}` : '');
  return (
    <p className="tp-ev">
      <span className="tp-ev-kinds">{parts.join(', ')}</span>
      {names && <span className="tp-ev-names">{names}</span>}
    </p>
  );
}

export function TasteChipsView({ profile, locale, onVerdict, onShowMore, all, onClear, canClear = false }) {
  const { t } = useI18n();
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const { shown, held, hidden } = profile;
  const nothing = !shown.length && !hidden.length;
  return (
    <section className="mt-section tp" aria-labelledby="tp-title" data-taste-profile="">
      <div className="mt-section-head">
        <h3 className="mt-section-title" id="tp-title">{t('taste.profile.title')}</h3>
      </div>
      <div className="tp-card">
        {nothing ? (
          <p className="tp-empty">{t('taste.profile.empty')}</p>
        ) : (
          <>
            <p className="tp-line">{t('taste.profile.line')}</p>
            {shown.length > 0 && (
              <ul className="tp-list">
                {shown.map((c) => {
                  const label = nodeLabel(c.node, locale);
                  return (
                    <li key={c.node} className={`tp-chip is-${c.facet}${c.verdict === 'accept' ? ' is-yes' : ''}`} data-node={c.node}>
                      <div className="tp-chip-body">
                        <p className="tp-chip-label">
                          {c.verdict === 'accept' && <CheckIcon size={16} className="tp-chip-tick" />}
                          <span>{label}</span>
                          <span className="tp-facet">{t(`taste.profile.facet.${c.facet}`)}</span>
                        </p>
                        <EvidenceLine ev={c.evidence} />
                      </div>
                      <div className="tp-acts" role="group" aria-label={t('taste.profile.askAria', { label })}>
                        <Button
                          className="tp-act tp-yes"
                          aria-pressed={c.verdict === 'accept'}
                          iconStart={<CheckIcon size={18} />}
                          onClick={() => onVerdict(c, c.verdict === 'accept' ? null : 'accept')}
                        >
                          {t(c.verdict === 'accept' ? 'taste.profile.yours' : 'taste.profile.yes')}
                        </Button>
                        <Button
                          className="tp-act tp-no"
                          aria-label={t('taste.profile.noAria', { label })}
                          iconStart={<CloseIcon size={18} />}
                          onClick={() => onVerdict(c, 'reject')}
                        >
                          <span className="tp-no-word" aria-hidden="true">{t('taste.profile.no')}</span>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="tp-foot">
              {!all && held.length > 0 && (
                <Button variant="quiet" size="sm" onClick={onShowMore}>{t('taste.profile.more', { n: held.length })}</Button>
              )}
              {hidden.length > 0 && (
                <Button variant="quiet" size="sm" aria-expanded={hiddenOpen} aria-controls="tp-hidden" onClick={() => setHiddenOpen((v) => !v)}>
                  {t('taste.profile.hidden', { n: hidden.length })}
                </Button>
              )}
              {canClear && <Button variant="quiet" size="sm" className="tp-clear" onClick={onClear}>{t('taste.profile.clear')}</Button>}
            </div>
            {hiddenOpen && hidden.length > 0 && (
              <ul className="tp-hidden" id="tp-hidden">
                {hidden.map((c) => (
                  <li key={c.node} className="tp-hidden-row" data-node={c.node}>
                    <span>{nodeLabel(c.node, locale)}</span>
                    <Button variant="quiet" size="sm" iconStart={<UndoIcon size={16} />} onClick={() => onVerdict(c, null)}>
                      {t('taste.profile.showAgain')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/**
 * The connected chips. `saves` are the shortlist rows ({ key, kind, id, name }),
 * `trips` the traveller's trips ({ id, name, at, destIds }), `destinations`
 * app_data's map, `userId` the signed-in account or null.
 */
export function TasteChips({ saves, trips, destinations, userId }) {
  const locale = activeLocale();
  const { verdicts, set, clear } = useTasteVerdicts();
  const [all, setAll] = useState(false);
  const filters = useMemo(readFilters, []);
  const base = useMemo(() => baseRates(destinations), [destinations]);
  const items = useMemo(
    () => evidenceItems({ saves, trips, filters, destinations }),
    [saves, trips, filters, destinations],
  );
  const profile = useMemo(() => buildProfile({ items, base, verdicts, all }), [items, base, verdicts, all]);

  // One 'shown' per chip per page load, with its position bucket.
  useEffect(() => {
    profile.shown.forEach((c, i) => tickTaste('shown', { node: c.node, facet: c.facet, bucket: positionBucket(i) }));
  }, [profile.shown]);

  // Signed in: sync the verdicts and the profile snapshot, now and 1.5 s after a change.
  const snapRef = useRef(null);
  snapRef.current = profileSnapshot(profile);
  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    const timer = setTimeout(() => {
      import('../accountThingsCloud.js').then(({ accountThingsCloud }) => {
        if (live) syncTaste({ userId, storage: browserStorage(), cloud: accountThingsCloud, snapshot: snapRef.current });
      }, () => {});
    }, 1500);
    return () => { live = false; clearTimeout(timer); };
  }, [userId, verdicts]);

  const onVerdict = (c, v) => {
    const i = profile.shown.findIndex((x) => x.node === c.node);
    if (v) tickTaste(v, { node: c.node, facet: c.facet, bucket: positionBucket(i < 0 ? 0 : i) });
    set(c.node, v);
  };
  return (
    <TasteChipsView
      profile={profile}
      locale={locale}
      onVerdict={onVerdict}
      onShowMore={() => setAll(true)}
      all={all}
      onClear={clear}
      canClear={Object.keys(verdicts).length > 0}
    />
  );
}
