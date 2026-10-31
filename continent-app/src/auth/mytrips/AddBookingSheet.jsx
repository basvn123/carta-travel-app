import React, { useMemo, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { usePaywall } from '../../hooks/usePaywall.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { Button, Chip, ChipGroup, Field } from '../../components/ui/index.js';
import { UploadIcon, CameraIcon, PencilIcon, SparkIcon, BedIcon, PlaneIcon, TicketIcon } from '../../components/Icons.jsx';
import { formatMoney } from '../../lib/money.js';
import { filesToPayload, requestBookingImport, IMPORT_ACCEPT, MAX_IMPORT_FILES } from '../../planner/bookingImport.js';
import { matchBookingRow } from '../../planner/bookingImportLogic.js';
import { loadTripExtras, persistTripExtras } from '../../planner/dayPlanStore.js';
import { daysUntil } from '../../lib/myTrips.js';

const KINDS = ['flight_out', 'flight_home', 'flight', 'stay', 'car', 'transfer', 'activity', 'other'];
const FILE_CODE = { type: 'file_type', size: 'file_size', total: 'file_total', count: 'file_count', read: 'read' };
const ICON = { stay: BedIcon, activity: TicketIcon };

/** The fields the reader may have got wrong, so the traveller checks them:
 *  anything it did not find, and a price it converted from another currency. */
export function unsureFields(b) {
  const out = [];
  if (!b.date) out.push('date');
  if (!(Number(b.eur) > 0)) out.push('eur');
  if (b.currency && b.currency !== 'EUR') out.push('eur');
  if (!b.code) out.push('code');
  if (!b.city && b.kind !== 'other') out.push('city');
  return [...new Set(out)];
}

/** The trip whose dates hold a booking's day (a day either side for a flight). */
export function tripForDate(plans, iso) {
  if (!iso) return null;
  return plans.find((p) => p.start && p.end && iso >= p.start && iso <= p.end)
    || plans.find((p) => p.start && Math.abs(daysUntil(iso, p.start)) <= 1)
    || null;
}

/**
 * Add a booking (T927): drop or choose a confirmation (PDF or image) or take
 * a photo of it; Carta's booking reader (the parse-booking Edge Function,
 * Gemini, behind the pass like every booking import) reads it; what it read
 * shows as fields to correct, the unsure ones flagged; a stay shows what it
 * cost a person a night beside Carta's estimate for that town; the booking
 * is attached to the trip whose dates match, or another the traveller picks,
 * and the trip's Ready for the trip updates. Type it in opens the trip,
 * where every booking row can be filled by hand. Nothing is kept of the file.
 *
 *   plans      [{ id, title, start, end, party, stops: [{ id, city, country, arrive, nights }] }]
 *   planId     the trip it was opened from, or ''
 *   costs      Explore's day prices (stayEur a person a night)
 *   mockRead   the seam's reader, in place of the network (dev only)
 */
export function AddBookingSheet({ plans = [], planId = '', costs = null, onClose, onAttached, onTypeIn, mockRead = null }) {
  const { t, lang } = useI18n();
  const paywall = usePaywall();
  const fileRef = useRef(null);
  const camRef = useRef(null);
  const [phase, setPhase] = useState('idle'); // idle, busy, review, error, done
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState('');
  const [target, setTarget] = useState(planId);
  const [doneTo, setDoneTo] = useState('');

  const errorText = (code, name) => {
    if (code === 'file_type') return t('extras.importBadType', { name });
    if (code === 'file_size' || code === 'file_total') return t('extras.importTooBig', { name: name || '' });
    if (code === 'file_count') return t('extras.importTooMany', { n: MAX_IMPORT_FILES });
    if (code === 'no_auth_config' || code === 'no_ai') return t('extras.importUnavailable');
    if (code === 'auth') return t('extras.importSignIn');
    if (code === 'user_cap' || code === 'global_cap') return t('extras.importCap');
    if (code === 'nothing_found' || code === 'nothing_to_parse') return t('extras.importNothing');
    return t('extras.importError');
  };

  const contextFor = (p) => (p ? {
    groupSize: p.party || 2,
    stops: p.stops.map((s) => ({ city: s.city, country: s.country, arrive: s.arrive || '', nights: s.nights })),
  } : {});

  const read = async (list) => {
    const files = [...(list || [])];
    if (!files.length || phase === 'busy') return;
    if (!mockRead && !paywall.require('import')) return;
    setPhase('busy');
    setError('');
    setFileName(files[0]?.name || '');
    let res;
    if (mockRead) res = await mockRead(files);
    else {
      const payload = await filesToPayload(files);
      if (payload.error) { setError(errorText(FILE_CODE[payload.error] || 'x', payload.name)); setPhase('error'); return; }
      res = await requestBookingImport({ files: payload.files, text: '', context: contextFor(plans.find((p) => p.id === planId)), lang });
    }
    if (!res?.ok) { setError(errorText(res?.code)); setPhase('error'); return; }
    const got = (res.result?.bookings || []).map((b, i) => ({
      key: `b${i}`,
      kind: KINDS.includes(b.kind) ? b.kind : 'other',
      title: b.title || '',
      city: b.city || '',
      date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : '',
      eur: Number.isFinite(b.eur) ? String(Math.round(b.eur * 100) / 100) : '',
      code: b.code || '',
      link: b.link || '',
      currency: b.currency || '',
      unsure: unsureFields(b),
    }));
    if (!got.length) { setError(errorText('nothing_found')); setPhase('error'); return; }
    setRows(got);
    const match = tripForDate(plans, got.find((b) => b.date)?.date);
    setTarget(match?.id || planId || plans[0]?.id || '');
    setPhase('review');
  };

  const patch = (key, field, value) => setRows((cur) => cur.map((r) => (r.key === key
    ? { ...r, [field]: value, unsure: r.unsure.filter((f) => f !== field) } : r)));
  const plan = plans.find((p) => p.id === target) || null;
  const stopIndexFor = (b, p) => {
    const keys = ['flight-out', 'flight-home', ...p.stops.map((_, i) => `stay-${i}`)];
    const k = matchBookingRow({ ...b }, keys, p.stops.map((s) => s.city));
    return k && k.startsWith('stay-') ? Number(k.slice(5)) : -1;
  };

  // A stay against Carta's estimate for a bed in that town, a person a night.
  const compare = useMemo(() => {
    if (!plan) return [];
    return rows.filter((b) => b.kind === 'stay' && Number(b.eur) > 0).map((b) => {
      const i = stopIndexFor(b, plan);
      const stop = plan.stops[i];
      if (!stop) return null;
      const paid = Number(b.eur) / stop.nights / Math.max(1, plan.party || 1);
      const est = costs?.get?.(stop.id)?.stayEur;
      return { key: b.key, city: stop.city, paid, est: Number.isFinite(est) ? est : null };
    }).filter(Boolean);
  }, [rows, plan, costs]);

  // Attach: fill the trip's booking rows the way the trip page's import does
  // (only empty fields, marked as read), and put a booked ticket on its day.
  const attach = () => {
    if (!plan) return;
    const extras = loadTripExtras(plan.id);
    const keys = ['flight-out', 'flight-home', ...plan.stops.map((_, i) => `stay-${i}`)];
    const cities = plan.stops.map((s) => s.city);
    const bookings = { ...extras.bookings };
    const dayExtras = { ...(extras.dayExtras || {}) };
    const stamp = Date.now();
    rows.forEach((b, i) => {
      const rowKey = matchBookingRow(b, keys, cities) || `custom:${stamp}-${i}`;
      const cur = bookings[rowKey] || {};
      const next = { ...cur, ai: true };
      if (!cur.ref && b.code) next.ref = b.code.trim();
      if ((cur.price == null || cur.price === '') && Number(b.eur) > 0) next.price = String(Number(b.eur));
      if (!cur.url && b.link) next.url = b.link;
      if (rowKey.startsWith('custom:')) Object.assign(next, { label: [b.title, b.city].filter(Boolean).join(', '), kind: b.kind, date: b.date || null });
      bookings[rowKey] = next;
      if (b.kind === 'activity' && b.date && plan.start) {
        const day = daysUntil(b.date, plan.start) + 1;
        if (day >= 1) {
          const list = dayExtras[day] || [];
          if (!list.some((a) => a.name === b.title)) {
            dayExtras[day] = [...list, { id: `bk-${stamp}-${i}`, name: b.title, eur: Number(b.eur) > 0 ? Number(b.eur) : null, day }];
          }
        }
      }
    });
    persistTripExtras(plan.id, { ...extras, bookings, dayExtras });
    setDoneTo(plan.title);
    setPhase('done');
    onAttached?.(plan.id);
  };

  const kindLabel = (k) => (['flight_out', 'flight_home', 'flight', 'stay'].includes(k) ? t(`bk.kind.${k}`) : t(`mt.bkKind.${k}`));

  return (
    <SheetShell title={t('mt.addBooking')} onClose={onClose} labelId="mt-book-title" width={640} className="mt-book">
      {(phase === 'idle' || phase === 'busy' || phase === 'error') && (
        <>
          <div
            className={`mt-drop${over ? ' is-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files); }}
          >
            <UploadIcon size={28} />
            <p className="mt-drop-title">{t('mt.dropTitle')}</p>
            <p className="mt-drop-line">{t('mt.dropLine')}</p>
            <Button variant="primary" loading={phase === 'busy'} onClick={() => fileRef.current?.click()}>{t('mt.chooseFile')}</Button>
            <input ref={fileRef} type="file" accept={IMPORT_ACCEPT} multiple hidden onChange={(e) => { read(e.target.files); e.target.value = ''; }} />
          </div>
          <div className="mt-ways">
            <Button className="mt-qk" onClick={() => camRef.current?.click()} disabled={phase === 'busy'}>
              <CameraIcon size={20} /><span className="mt-qk-t">{t('mt.takePhoto')}</span>
              <span className="mt-qk-s">{t('mt.takePhotoLine')}</span>
            </Button>
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { read(e.target.files); e.target.value = ''; }} />
            <Button className="mt-qk" onClick={() => onTypeIn?.(target || plans[0]?.id || '')} disabled={!plans.length}>
              <PencilIcon size={20} /><span className="mt-qk-t">{t('mt.typeIn')}</span>
              <span className="mt-qk-s">{t('mt.typeInLine')}</span>
            </Button>
          </div>
          <p className="mt-book-note" role="status">
            {phase === 'busy' && t('pf.tell.reading')}
            {phase === 'error' && <span className="mt-error">{error}</span>}
          </p>
        </>
      )}

      {phase === 'review' && (
        <div className="mt-read">
          <p className="mt-read-head"><SparkIcon size={18} />{fileName ? t('mt.readFrom', { name: fileName }) : t('mt.readDone')}</p>
          {rows.map((b) => {
            const Icon = ICON[b.kind] || PlaneIcon;
            const unsure = (f) => b.unsure.includes(f);
            const hint = (f) => (unsure(f) ? t(f === 'eur' && b.currency && b.currency !== 'EUR' ? 'mt.checkConverted' : 'mt.checkThis') : undefined);
            const cmp = compare.find((c) => c.key === b.key);
            return (
              <section key={b.key} className="mt-read-item" aria-label={b.title || kindLabel(b.kind)}>
                <div className="mt-read-kind"><Icon size={18} /><span>{kindLabel(b.kind)}</span></div>
                <div className="mt-read-fields">
                  <Field as="select" label={t('bk.kind')} value={b.kind} onChange={(e) => patch(b.key, 'kind', e.target.value)}>
                    {KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
                  </Field>
                  <Field label={t('mt.fldName')} value={b.title} onChange={(e) => patch(b.key, 'title', e.target.value)} />
                  <Field label={t('mt.fldTown')} value={b.city} hint={hint('city')} className={unsure('city') ? 'is-unsure' : ''} onChange={(e) => patch(b.key, 'city', e.target.value)} />
                  <Field label={t('mt.fldDate')} type="date" value={b.date} hint={hint('date')} className={unsure('date') ? 'is-unsure' : ''} onChange={(e) => patch(b.key, 'date', e.target.value)} />
                  <Field label={t('bk.paid')} inputMode="decimal" value={b.eur} hint={hint('eur')} className={unsure('eur') ? 'is-unsure' : ''}
                    onChange={(e) => patch(b.key, 'eur', e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))} />
                  <Field label={t('mt.fldRef')} value={b.code} hint={hint('code')} className={unsure('code') ? 'is-unsure' : ''} onChange={(e) => patch(b.key, 'code', e.target.value)} />
                </div>
                {cmp && (
                  <p className="mt-read-cmp">
                    {cmp.est != null
                      ? t('mt.paidVsEst', { paid: formatMoney(cmp.paid, { precision: 'cents' }), est: formatMoney(cmp.est), city: cmp.city })
                      : t('mt.paidNight', { paid: formatMoney(cmp.paid, { precision: 'cents' }) })}
                  </p>
                )}
              </section>
            );
          })}
          {plans.length > 0 ? (
            <div className="mt-read-trip">
              <p className="mt-filter-label" id="mt-book-trip">{t('mt.attachTo')}</p>
              <ChipGroup label={t('mt.attachTo')} className="mt-chips">
                {plans.map((p) => (
                  <Chip key={p.id} kind="choice" selected={target === p.id} onClick={() => setTarget(p.id)}>{p.title}</Chip>
                ))}
              </ChipGroup>
            </div>
          ) : (
            <p className="mt-muted">{t('mt.noTripToAttach')}</p>
          )}
          <div className="mt-read-foot">
            <Button variant="primary" disabled={!plan} onClick={attach}>{plan ? t('mt.addTo', { trip: plan.title }) : t('mt.addBooking')}</Button>
            <Button variant="quiet" onClick={() => { setRows([]); setPhase('idle'); }}>{t('mt.readAnother')}</Button>
          </div>
          <p className="mt-book-note">{t('mt.readerNote')}</p>
        </div>
      )}

      {phase === 'done' && (
        <div className="mt-read">
          <p className="mt-read-done" role="status">{t('mt.bookingAdded', { trip: doneTo })}</p>
          <div className="mt-read-foot">
            <Button variant="primary" onClick={onClose}>{t('saved.done')}</Button>
            <Button variant="quiet" onClick={() => { setRows([]); setPhase('idle'); }}>{t('mt.readAnother')}</Button>
          </div>
        </div>
      )}
    </SheetShell>
  );
}
