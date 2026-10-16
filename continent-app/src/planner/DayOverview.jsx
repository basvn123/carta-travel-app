import React, { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, Money } from '../components/ui/index.js';
import { SheetShell } from '../browse/SheetShell.jsx';
import {
  DownloadIcon, ShareIcon, LinkIcon, MapPinIcon, RouteIcon, CalendarIcon, ChevronDownIcon,
  PencilIcon, TicketIcon, BulbIcon, SparkIcon, CheckIcon,
} from '../components/Icons.jsx';
import { fmtClockLoose } from './daySchedule.js';
import { fmtKm } from './dayFormat.js';
import { formatSteps, kmToSteps } from '../lib/steps.js';
import { DayBar, SettledLine } from './DayPlanPanel.jsx';

/**
 * The planned day's head card (T433): the day in one look, the way the trip
 * planner's price card is the trip in one look. When it starts and ends, how
 * many stops, how far on foot, and what a day here costs one person at the
 * traveller's Lifestyle (the same figure Explore prints for the town, so no
 * two screens disagree), then the day bar, then whether the walks were
 * checked. Every route claim it makes is the route checker's verdict.
 *
 *   dayFig   { eur, est } a day here for one person, or null
 *   route    { state: 'checking' | 'checked' | 'flagged' | 'offline', flagged }
 */
export function DaySummary({
  schedule, stops, walkKm, dayFig, route, onLifestyle, focusIdx = null, title = null,
}) {
  const { t, lang } = useI18n();
  const startMin = schedule?.startMin;
  const value = `${stops}|${walkKm}|${schedule?.endMin ?? ''}|${dayFig?.eur ?? ''}`;
  return (
    <section className="days-card" aria-label={t('dayws.summaryAria')}>
      {title}
      <div className="days-head">
        <div className="days-time">
          {schedule && stops > 0 ? (
            <b>{t('dayws.timeSpan', { from: fmtClockLoose(startMin), to: fmtClockLoose(schedule.endMin) })}</b>
          ) : (
            <b>{t('dayws.dayEmptyShort')}</b>
          )}
          <SettledLine className="days-facts" value={value}>
            {stops > 0 && <span>{t(stops === 1 ? 'day.statStop' : 'day.statStops', { n: stops })}</span>}
            {walkKm > 0 && <span>{t('dayws.kmOnFoot', { km: fmtKm(walkKm, lang) })}</span>}
            {walkKm > 0 && <span>{t('dayws.aboutSteps', { n: formatSteps(kmToSteps(walkKm), lang) })}</span>}
          </SettledLine>
        </div>
        {dayFig && Number.isFinite(dayFig.eur) && (
          <Button variant="quiet" className="days-cost" onClick={onLifestyle} title={t('dayws.costTitle')}>
            <span className="days-cost-fig"><Money value={dayFig.eur} est={dayFig.est} /></span>
            <span className="days-cost-label">{t('dayws.costLabel')}</span>
          </Button>
        )}
      </div>
      {schedule && stops > 0 && <DayBar schedule={schedule} startMin={startMin} focusIdx={focusIdx} />}
      {stops > 1 && route && (
        <p className={`days-route is-${route.state}`} role="status">
          {route.state === 'checked' && <CheckIcon size={14} />}
          {route.state === 'checked' && t('dayws.routeChecked')}
          {route.state === 'flagged' && t(route.flagged === 1 ? 'dayws.routeFlaggedOne' : 'dayws.routeFlagged', { n: route.flagged })}
          {route.state === 'checking' && t('dayws.routeChecking')}
          {route.state === 'offline' && t('dayws.routeOffline')}
        </p>
      )}
    </section>
  );
}

/**
 * The day kit (T433), the trip planner's "Your trip kit" for a day: local
 * tips, notes, documents and the ideas inbox, one tap each into a sheet. It
 * replaces the Files tab and the floating tips button over the map.
 *
 *   tools  [{ key, Icon, title, state, body }]
 */
export function DayKit({ tools }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(null);
  const shown = tools.filter(Boolean);
  if (!shown.length) return null;
  const tool = shown.find((x) => x.key === open) || null;
  return (
    <section className="itin-tools dayk" aria-labelledby="dayk-h">
      <h2 className="itin-h" id="dayk-h">{t('dayws.kitTitle')}</h2>
      <div className="itin-tool-grid">
        {shown.map((x) => (
          <Button key={x.key} variant="secondary" className="itin-tool" onClick={() => setOpen(x.key)} aria-haspopup="dialog">
            <span className="itin-tool-icon" aria-hidden="true"><x.Icon size={24} /></span>
            <span className="itin-tool-name">{x.title}</span>
            <span className="itin-tool-state">{x.state}</span>
          </Button>
        ))}
      </div>
      {tool && (
        <SheetShell title={tool.title} onClose={() => setOpen(null)} className="itin-tool-sheet dayk-sheet" labelId="dayk-sheet-title" width={560}>
          {tool.body}
        </SheetShell>
      )}
    </section>
  );
}

export const KIT_ICONS = { tips: BulbIcon, notes: PencilIcon, files: TicketIcon, ideas: SparkIcon };

/**
 * Take the day with you (T433), the trip planner's export row: the PDF and a
 * share link first, Google Maps beside them, the calendar and My Maps under
 * "More". Files are behind the pass; the link and Google Maps are not.
 */
export function DayExports({ onPdf, onShareLink, onShareText, gmapsUrl, onIcs, onKml, note }) {
  const { t } = useI18n();
  const [more, setMore] = useState(false);
  return (
    <section className="itin-export dayx" aria-labelledby="dayx-h">
      <h2 className="itin-h" id="dayx-h">{t('export.exportAndShare')}</h2>
      <div className="itin-export-grid">
        <Button variant="secondary" iconStart={<DownloadIcon size={20} />} onClick={onPdf}>
          {t('export.downloadPdf')}
        </Button>
        <Button variant="secondary" iconStart={<LinkIcon size={20} />} onClick={onShareLink}>
          {t('dayws.shareLink')}
        </Button>
        {gmapsUrl && (
          <a className="btn btn-secondary itin-export-link" href={gmapsUrl} target="_blank" rel="noreferrer">
            <span className="btn-icon" aria-hidden="true"><MapPinIcon size={20} /></span>
            <span className="btn-label">{t('export.openInGmaps')}</span>
          </a>
        )}
      </div>
      <Button
        variant="quiet"
        size="sm"
        className="itin-export-more"
        aria-expanded={more}
        onClick={() => setMore((v) => !v)}
        iconEnd={<ChevronDownIcon size={16} className={more ? 'plan-chev is-open' : 'plan-chev'} />}
      >
        {t('plan.moreExports')}
      </Button>
      {more && (
        <div className="itin-export-grid">
          <Button variant="secondary" iconStart={<CalendarIcon size={20} />} onClick={onIcs}>{t('export.calendar')}</Button>
          <Button variant="secondary" iconStart={<RouteIcon size={20} />} onClick={onKml}>{t('export.myMaps')}</Button>
          <Button variant="secondary" iconStart={<ShareIcon size={20} />} onClick={onShareText}>{t('dayws.shareText')}</Button>
        </div>
      )}
      {note && <p className="itin-export-note" role="status">{note}</p>}
    </section>
  );
}
