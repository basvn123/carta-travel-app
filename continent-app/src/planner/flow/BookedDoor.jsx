import React, { useId, useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { usePaywall } from '../../hooks/usePaywall.jsx';
import { filesToPayload, requestBookingImport, IMPORT_ACCEPT } from '../bookingImport.js';
import { Button, Field, IconButton, Money, Segmented } from '../../components/ui/index.js';
import { BedIcon, CloseIcon, PencilIcon, PlaneIcon, UploadIcon } from '../../components/Icons.jsx';
import { fromImports, markAnswered, normalizeSettings } from './tripSettings.js';
import { arrivalFromImports, staysFromImports } from './importStays.js';
import { bookedTrip, saidFlight } from '../../lib/plan/doors.js';
import { SheetHead } from './PlanStage.jsx';
import { useBcp47 } from './flowHooks.js';
import { PlaceSearch } from './KnowDoor.jsx';

const TYPED_KINDS = ['flight_out', 'flight_home', 'stay'];
const FLIGHTS = ['flight', 'flight_out', 'flight_home'];

/** Whether Carta can place one booking in its towns (a stay's town, a flight's landing town). */
function placed(b, destinations) {
  if (b.kind === 'stay') return staysFromImports([b], destinations, {}).length > 0;
  if (b.kind === 'flight_out' || b.kind === 'flight') return Boolean(arrivalFromImports([b], destinations));
  return true;
}

/**
 * I've booked part of it (T866): what is booked anchors the trip. The
 * bookings the words or a file already gave are listed (each with what it
 * is, the town, the day and what was paid); another one comes from a file
 * (parse-booking, the same reader as Tell Carta, behind the pass) or typed
 * in: a flight there, a flight home or a stay, its town, its day and what
 * was paid. "Plan around it" makes the trip around the bookings (lib/plan
 * doors bookedTrip): the booked stays are the stops, a booked flight lands
 * where it lands, and Carta fills the rest.
 *
 *   save(s)        keep the bookings on the trip as they change
 *   onGo(s)        plan around them
 */
export function BookedDoor({ settings, save, onBack, onGo }) {
  const { t, lang } = useI18n();
  const bcp47 = useBcp47();
  const ctx = useFirstRun();
  const paywall = usePaywall();
  const uid = useId();
  const destinations = ctx?.data?.destinations;
  const fileRef = useRef(null);
  const [state, setState] = useState({ phase: 'idle' });
  const [typing, setTyping] = useState(false);
  const imports = settings.imports || [];
  // T874: what the words already said ("we booked our flights to Prague,
  // 21 to 28 November") fills the typed form, so the town and the days are
  // not typed a second time: the one town named and the trip's own days.
  const said = saidFlight(settings);
  const formFor = (kind) => ({
    kind,
    city: kind === 'stay' ? '' : said.city,
    date: kind === 'flight_out' ? said.out : kind === 'flight_home' ? said.back : '',
    eur: '',
  });
  const [form, setForm] = useState(() => formFor(imports.some((b) => b.kind === 'flight_out' || b.kind === 'flight') ? 'flight_home' : 'flight_out'));
  const trip = useMemo(() => bookedTrip(settings, destinations || {}), [settings, destinations]);

  const keep = (next) => save(markAnswered(normalizeSettings(next), 'booked'));
  const onFiles = async (fileList) => {
    if (!fileList?.length || state.phase === 'busy') return;
    if (!paywall.require('import')) return;
    setState({ phase: 'busy' });
    const payload = await filesToPayload(fileList);
    if (payload.error) { setState({ phase: 'error' }); return; }
    const res = await requestBookingImport({ files: payload.files, text: '', context: {}, lang });
    if (!res.ok) { setState({ phase: 'error' }); return; }
    const bookings = res.result?.bookings || [];
    if (bookings.length) keep(fromImports(settings, bookings));
    setState({ phase: 'done', n: bookings.length });
  };
  const addTyped = () => {
    const eur = Number(String(form.eur).replace(',', '.'));
    const b = { kind: form.kind, title: form.city, city: form.city, date: form.date, eur: Number.isFinite(eur) && eur > 0 ? eur : null };
    keep(fromImports(settings, [b]));
    setForm(form.kind === 'flight_out' ? formFor('flight_home') : { kind: form.kind, city: form.city, date: '', eur: '' });
    setTyping(false);
  };
  const remove = (i) => {
    const left = imports.filter((_, k) => k !== i);
    const booked = {
      ...settings.booked,
      flights: left.some((b) => FLIGHTS.includes(b.kind)),
      stays: left.some((b) => b.kind === 'stay'),
    };
    keep({ ...settings, imports: left, booked });
  };
  const fmtDay = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString(bcp47, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
  const formOk = form.city.trim() && /^\d{4}-\d{2}-\d{2}$/.test(form.date);

  return (
    <div className="pf-step">
      <SheetHead onBack={onBack} backLabel={t('pf.back')} />
      <h2 className="pf-title" tabIndex={-1}>{t('bk.title')}</h2>
      {imports.length > 0 ? (
        <section className="pf-booked" aria-labelledby={`${uid}-list`}>
          <h3 className="pf-label" id={`${uid}-list`}>{t('bk.list')}</h3>
          <ul className="pf-booked-list">
            {imports.map((b, i) => {
              const name = b.city || b.title || t(`bk.kind.${FLIGHTS.includes(b.kind) ? b.kind : 'stay'}`);
              const ok = placed(b, destinations || {});
              return (
                <li key={`${b.kind}-${b.date}-${i}`} className="pf-booked-row">
                  <span className="pf-booked-icon" aria-hidden="true">{b.kind === 'stay' ? <BedIcon size={20} /> : <PlaneIcon size={20} />}</span>
                  <span className="pf-booked-main">
                    <span className="pf-booked-name">{name}</span>
                    <span className="pf-booked-sub">
                      {[t(`bk.kind.${TYPED_KINDS.includes(b.kind) || b.kind === 'flight' ? b.kind : 'stay'}`), fmtDay(b.date)].filter(Boolean).join(', ')}
                    </span>
                    {!ok && <span className="pf-booked-warn">{t('bk.unplaced')}</span>}
                  </span>
                  {b.eur > 0 && <span className="pf-booked-fig"><Money value={b.eur} precision="cents" /></span>}
                  <IconButton tone="plain" label={t('bk.remove', { name })} onClick={() => remove(i)}>
                    <CloseIcon size={16} />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="pf-help">{t('bk.none')}</p>
      )}

      <div className="pf-booked-add">
        <Button variant="secondary" size="sm" iconStart={<UploadIcon size={16} />} loading={state.phase === 'busy'} onClick={() => fileRef.current?.click()}>
          {t('pf.tell.attach')}
        </Button>
        <input ref={fileRef} type="file" accept={IMPORT_ACCEPT} multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
        {!typing && (
          <Button variant="secondary" size="sm" iconStart={<PencilIcon size={16} />} onClick={() => setTyping(true)} aria-expanded={false}>
            {t('bk.type')}
          </Button>
        )}
      </div>
      <p className="pf-note" role="status">
        {state.phase === 'busy' && t('pf.tell.reading')}
        {state.phase === 'done' && (state.n ? t('pf.tell.read', { n: state.n }) : t('extras.importNothing'))}
        {state.phase === 'error' && t('extras.importError')}
      </p>

      {typing && (
        <section className="pf-booked-form" aria-label={t('bk.type')}>
          <p className="pf-label" id={`${uid}-kind`}>{t('bk.kind')}</p>
          <Segmented
            label={t('bk.kind')}
            className="pf-fill-seg"
            value={form.kind}
            onChange={(kind) => setForm((f) => ({ ...formFor(kind), eur: f.eur }))}
            options={TYPED_KINDS.map((k) => ({ value: k, label: t(`bk.kind.${k}`) }))}
          />
          {form.city ? (
            <div className="pf-booked-town">
              <span className="pf-label">{t(form.kind === 'stay' ? 'bk.town.stay' : 'bk.town.flight')}</span>
              <span className="pf-booked-town-row">
                <span className="pf-booked-name">{form.city}</span>
                <Button variant="quiet" size="sm" onClick={() => setForm((f) => ({ ...f, city: '' }))}>{t('bk.changeTown')}</Button>
              </span>
            </div>
          ) : (
            <PlaceSearch label={t(form.kind === 'stay' ? 'bk.town.stay' : 'bk.town.flight')} countries={false} onPick={(p) => setForm((f) => ({ ...f, city: p.name }))} />
          )}
          <Field label={t(form.kind === 'stay' ? 'bk.date.stay' : 'bk.date.flight')} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <Field label={t('bk.paid')} inputMode="decimal" value={form.eur} onChange={(e) => setForm((f) => ({ ...f, eur: e.target.value.replace(/[^\d.,]/g, '') }))} />
          <div className="pf-booked-form-foot">
            <Button variant="secondary" disabled={!formOk} onClick={addTyped}>{t('bk.add')}</Button>
            <Button variant="quiet" onClick={() => setTyping(false)}>{t('pf.cancel')}</Button>
          </div>
        </section>
      )}

      {imports.length > 0 && !trip && <p className="pf-note">{t('bk.needOne')}</p>}
      <div className="pf-foot">
        <Button variant="primary" block disabled={!trip} onClick={() => onGo(settings)}>{t('bk.go')}</Button>
      </div>
    </div>
  );
}
