/** Four weeks of daily counts. Scaled to the busiest day, with that day's
 *  figure written out, so the chart is never the only way to read it. */
export function Sparkbars({ series }) {
  const top = Math.max(...series.map((d) => d.n || 0), 1);
  return (
    <div className="adminpage-spark" role="img"
      aria-label={series.map((d) => `${d.day}: ${d.n}`).join(', ')}>
      {series.map((d) => (
        <span key={d.day} className="adminpage-sparkbar" title={`${d.day}: ${d.n}`}>
          <span style={{ height: `${Math.max((d.n / top) * 100, d.n ? 8 : 2)}%` }} />
        </span>
      ))}
    </div>
  );
}
