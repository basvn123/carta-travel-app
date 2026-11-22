/**
 * The watch chart's geometry (G12, Bewaard): the measured prices as SVG
 * paths and dots. Pure, so the chart is tested without a DOM.
 *
 *   chartGeometry([118, 121, 97], 222, 54)
 *     -> { d, area, dots: [{ x, y, now }], lowest, X, Y }
 *
 * The lowest point is the cheapest measured; a flat series sits in the
 * middle band, never divides by zero.
 */
export function chartGeometry(vals, w, h, { axis = false } = {}) {
  if (!Array.isArray(vals) || !vals.length) return null;
  const pad = axis ? 14 : 6;
  const foot = axis ? 16 : 0;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const rng = Math.max(max - min, 1);
  const last = vals.length - 1;
  const X = (i) => pad + (w - pad * 2) * (last ? i / last : 0.5);
  const Y = (v) => pad + (h - pad * 2 - foot) * (1 - (v - min) / rng);
  const d = `M${vals.map((v, i) => `${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('L')}`;
  const area = `${d}L${X(last).toFixed(1)} ${h - foot}L${X(0).toFixed(1)} ${h - foot}Z`;
  const dots = vals.map((v, i) => ({ x: Number(X(i).toFixed(1)), y: Number(Y(v).toFixed(1)), now: i === last }));
  return { d, area, dots, lowest: vals.indexOf(min), last, min, foot, pad, X, Y };
}
