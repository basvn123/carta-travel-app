import { useI18n } from '../../i18n/index.jsx';

/** Four weeks of daily counts. Scaled to the busiest day. The chart is never
 *  the only way to read it: the busiest day's figure and the latest day's
 *  figure are written under it in mono (T410, brief V5-8). */
export function Sparkbars({ series }) {
  const { t } = useI18n();
  const peak = Math.max(0, ...series.map((d) => d.n || 0));
  const top = Math.max(peak, 1);
  const last = series.length ? series[series.length - 1].n || 0 : 0;
  return (
    <>
      <div className="adminpage-spark" role="img"
        aria-label={series.map((d) => `${d.day}: ${d.n}`).join(', ')}>
        {series.map((d) => (
          <span key={d.day} className="adminpage-sparkbar" title={`${d.day}: ${d.n}`}>
            <span style={{ height: `${Math.max((d.n / top) * 100, d.n ? 8 : 2)}%` }} />
          </span>
        ))}
      </div>
      {series.length > 0 && (
        <p className="adminpage-sparkfig">{t('admin.sparkFigs', { peak, last })}</p>
      )}
    </>
  );
}
