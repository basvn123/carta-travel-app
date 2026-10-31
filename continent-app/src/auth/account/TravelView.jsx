import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import {
  BedIcon, DiningIcon, FriendsIcon, GlobeIcon, MapPinIcon, ReceiptIcon, SparkIcon, CalendarIcon, PiggyIcon,
} from '../../components/Icons.jsx';
import { ChoiceRows, Switch } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { PriceViewSwitch } from '../../components/PriceViewSwitch.jsx';
import { SettingsEditorSheet } from '../../components/SettingsLine.jsx';
import { useDayView } from '../../hooks/useDayView.js';
import { formatMoney } from '../../lib/money.js';
import { useSettledFigure } from '../../lib/figureChange.js';
import { Group, Row } from './parts.jsx';
import { useTravelValues } from './travelValues.js';
import { openTasteSheet } from '../../browse/TasteDoor.jsx';
import { EMAILS_OFF, loadEmailPrefs, saveEmailPrefs } from './emailPrefs.js';


// Well-known catalogue places, in order, for the price proof when the
// traveller has no dated trip ahead.
const KNOWN = ['LIS', 'OPO', 'FCO', 'BCN', 'PRG', 'VIE'];

/**
 * One place priced with the traveller's settings by the app's own price
 * model (App's priceDays over the one price request, the figure Explore's
 * cards draw), so a change to any row under it moves this figure in place.
 * The next trip's first place when there is one, else a well-known place.
 * No figure, no card.
 */
function PriceProof({ destinations, costs, preferId }) {
  const { t } = useI18n();
  const view = useDayView();
  const ref = useRef(null);
  const pick = [preferId, ...KNOWN].find((id) => id && destinations?.[id] && costs?.get?.(id)?.dayEur != null);
  const d = pick ? destinations[pick] : null;
  const eur = d ? costs.get(pick).dayEur : null;
  const figure = eur != null ? formatMoney(view.day(eur)) : '';
  useSettledFigure(ref, figure);
  if (!d || eur == null) return null;
  return (
    <section className="ac-proof" aria-label={t('ac.proofAria', { city: d.city })}>
      <HeroImage url={d.image?.url || null} city={d.city} iso2={d.iso2} className="ac-proof-img" maxWidth={160} sizes="64px" ratio={[1, 1]} />
      <span className="ac-proof-tx">
        <b>{d.city}</b>
        <span>{t('ac.withSettings')}</span>
      </span>
      <span className="ac-proof-fig">
        <b ref={ref}>{figure}</b>
        <small>{view.unit}</small>
      </span>
    </section>
  );
}

/** Your travel (T934): the settings behind every price, from the one store. */
export function TravelView({ head, destinations, costs, preferId, onOpenLifestyle }) {
  const { t } = useI18n();
  const v = useTravelValues(t);
  const [editor, setEditor] = useState(null); // 'origin' | 'party' | null
  const homeRef = useRef(null);
  const partyRef = useRef(null);
  const close = () => {
    const back = editor === 'origin' ? homeRef : partyRef;
    setEditor(null);
    back.current?.focus?.();
  };
  return (
    <>
      {head}
      <PriceProof destinations={destinations} costs={costs} preferId={preferId} />
      {v && (
        <Group id="ac-travel">
          <Row icon={MapPinIcon} label={t('ac.home')} value={v.home} rowRef={homeRef} onClick={() => setEditor('origin')} />
          <Row icon={FriendsIcon} label={t('ac.travellers')} value={v.people} rowRef={partyRef} onClick={() => setEditor('party')} />
          <Row icon={BedIcon} label={t('ac.stay')} value={v.bed} onClick={() => onOpenLifestyle?.()} />
          <Row icon={DiningIcon} label={t('ac.eatPace')} value={v.vibe} onClick={() => onOpenLifestyle?.()} />
          {v.tasteEditable && (
            <Row
              icon={SparkIcon}
              label={t('taste.title')}
              value={v.taste ? v.taste : <span className="ac-unset">{t('taste.notSet')}</span>}
              onClick={(e) => openTasteSheet(e?.currentTarget || null)}
            />
          )}
        </Group>
      )}
      {v && v.party > 1 && (
        <Group id="ac-prices" className="ac-prices">
          <Row icon={ReceiptIcon} label={t('ac.showPrices')}>
            <PriceViewSwitch className="ac-seg" />
          </Row>
        </Group>
      )}
      {editor && <SettingsEditorSheet part={editor} onClose={close} anchorRef={editor === 'origin' ? homeRef : partyRef} />}
    </>
  );
}

/**
 * Emails (T944): trip reminders and price drops on saved places, both off
 * until switched on, each switch saving at once (emailPrefs.js, migration
 * 060). Shown only to a signed-in account, and only once the table exists:
 * with migration 060 missing the group is left out.
 */
function EmailsGroup({ userId }) {
  const { t, lang } = useI18n();
  const [prefs, setPrefs] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadEmailPrefs(userId).then((res) => { if (live) setPrefs(res.state === 'ok' ? res.prefs : null); });
    return () => { live = false; };
  }, [userId]);
  if (!prefs) return null;
  const flip = async (key, on) => {
    const was = prefs;
    const next = { ...EMAILS_OFF, ...prefs, [key]: on };
    setPrefs(next);
    setFailed(false);
    const res = await saveEmailPrefs(userId, next, lang);
    if (res.state !== 'ok') { setPrefs(was); setFailed(true); }
  };
  const rows = [
    ['trip_reminders', CalendarIcon, 'ac2.tripReminders'],
    ['price_drops', PiggyIcon, 'ac2.priceDrops'],
  ];
  return (
    <Group id="ac-emails" title={t('ac2.emails')}>
      {rows.map(([key, Icon, label]) => (
        <div key={key} className="ac-row is-static ac-switch-row">
          <Icon size={20} className="ac-row-icon" />
          <Switch className="ac-switch" label={t(label)} checked={!!prefs[key]} onChange={(on) => flip(key, on)} />
        </div>
      ))}
      {failed && <p className="ac-row is-static ac-switch-err" role="alert">{t('ac2.emailsError')}</p>}
    </Group>
  );
}

/**
 * Preferences (T934): Language and Currency as rows. Language opens a
 * compact list in place (it replaced six large tiles); the euro is the one
 * currency Carta prices in, so Currency states it and opens nothing.
 * T944: Emails follows for a signed-in account.
 */
export function PrefsView({ head, userId = null }) {
  const { t, lang, setLang, languages } = useI18n();
  const [open, setOpen] = useState(false);
  const langRef = useRef(null);
  const current = languages.find((l) => l.code === lang) || languages[0];
  return (
    <>
      {head}
      <Group id="ac-prefs">
        <Row icon={GlobeIcon} label={t('account.language')} value={current.label} expanded={open} rowRef={langRef} onClick={() => setOpen((o) => !o)} />
        {open && (
          <div className="ac-pick">
            <ChoiceRows
              label={t('account.language')}
              className="ac-langs"
              value={[lang]}
              options={languages.map((l) => ({ value: l.code, icon: null, label: l.label }))}
              onPick={(code) => { setLang(code); setOpen(false); langRef.current?.focus?.(); }}
            />
          </div>
        )}
        <Row icon={ReceiptIcon} label={t('ac.currency')} value={t('ac.currencyEur')} />
      </Group>
      {userId && <EmailsGroup userId={userId} />}
    </>
  );
}
