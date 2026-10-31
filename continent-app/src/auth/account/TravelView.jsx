import React, { useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { BedIcon, DiningIcon, FriendsIcon, GlobeIcon, MapPinIcon, ReceiptIcon, SparkIcon } from '../../components/Icons.jsx';
import { ChoiceRows } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { PriceViewSwitch } from '../../components/PriceViewSwitch.jsx';
import { SettingsEditorSheet } from '../../components/SettingsLine.jsx';
import { useDayView } from '../../hooks/useDayView.js';
import { formatMoney } from '../../lib/money.js';
import { useSettledFigure } from '../../lib/figureChange.js';
import { Group, Row } from './parts.jsx';
import { useTravelValues } from './travelValues.js';

// T764: "Your travel style", the taste profile's sheet, loads when opened.
const TasteSheet = React.lazy(() => import('../../browse/TasteSheet.jsx').then((m) => ({ default: m.TasteSheet })));

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
  const [tasteOpen, setTasteOpen] = useState(false);
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
              onClick={() => setTasteOpen(true)}
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
      {tasteOpen && (
        <React.Suspense fallback={null}>
          <TasteSheet onClose={() => setTasteOpen(false)} />
        </React.Suspense>
      )}
    </>
  );
}

/**
 * Preferences (T934): Language and Currency as rows. Language opens a
 * compact list in place (it replaced six large tiles); the euro is the one
 * currency Carta prices in, so Currency states it and opens nothing.
 * Emails are left out: Carta sends no trip or price emails yet.
 */
export function PrefsView({ head }) {
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
    </>
  );
}
