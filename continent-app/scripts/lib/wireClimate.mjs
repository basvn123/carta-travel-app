// The master's climate block as the wire carries it (sync-data.mjs). Its own
// module so the whitelist can be tested without running the whole sync.

/** The compact wire climate block for one master `climate` with `months`. */
export function compactClimate(c) {
  return {
    m: c.months.map((m) => [
      m.t_high ?? null, m.t_low ?? null, m.precip_mm ?? null, m.comfort ?? null,
    ]),
    best: c.summary?.best_months || [],
    // T631: the parallel arrays apply_climate.py adds beside `months`,
    // kept under short names and only when they exist: rd rain days per
    // month, wind mean 10 m wind in m/s, elev the ground elevation (m)
    // the temperatures are lapse corrected to.
    ...(Array.isArray(c.rain_days) ? { rd: c.rain_days } : {}),
    ...(Array.isArray(c.wind_ms) ? { wind: c.wind_ms } : {}),
    ...(Number.isFinite(c.elev_m) ? { elev: c.elev_m } : {}),
    // T641: sun_h twelve monthly sunshine totals in hours (modelled from
    // NASA POWER radiation), water_c twelve monthly sea or lake surface
    // temperatures in C (NASA MUR SST) for a destination on the water.
    ...(Array.isArray(c.sun_h) ? { sun_h: c.sun_h } : {}),
    ...(Array.isArray(c.water_c) ? { water_c: c.water_c } : {}),
    // D20 (T1200, wave 1 V-8): heat and fire months and their provenance,
    // written by pipeline/heat_fire.py; lib/heatRisk.js reads them. Before
    // this the compaction dropped them, so they never reached the app.
    ...(Array.isArray(c.heat) ? { heat: c.heat } : {}),
    ...(Array.isArray(c.fire) ? { fire: c.fire } : {}),
    ...(c.risk && typeof c.risk === 'object' ? { risk: c.risk } : {}),
  };
}
