#!/usr/bin/env node
/**
 * audit-content.mjs - hallucination and validity sweep across every published layer.
 *
 * Read-only. Writes one JSON report per layer under reports/ and prints a summary
 * table. Nothing under public/ is ever modified.
 *
 *   node scripts/audit-content.mjs                 # offline checks only
 *   node scripts/audit-content.mjs --wikidata      # also cross-check Wikidata
 *   node scripts/audit-content.mjs --wikidata --wd-limit 400
 *   node scripts/audit-content.mjs --layer lakes,mountains
 *
 * Wikidata answers are cached in reports/.wikidata-cache.json so repeat runs are
 * free. The cache is keyed by QID and holds coordinates plus instance-of ids.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUB = path.join(ROOT, 'public')
const REPORTS = path.join(ROOT, 'reports')

const argv = process.argv.slice(2)
const hasFlag = (f) => argv.includes(f)
const flagVal = (f, d) => {
  const i = argv.indexOf(f)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}
const WIKIDATA = hasFlag('--wikidata')
const WD_LIMIT = Number(flagVal('--wd-limit', '1200'))
const ONLY = flagVal('--layer', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

/* ------------------------------------------------------------------ helpers */

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const listJson = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : []

const haversineKm = (a, b) => {
  const R = 6371
  const rad = (d) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

// Europe-ish envelope. Anything outside is a coordinate the layer cannot mean.
// The same window the pipeline gates on, kept in step with
// pipeline_io.EUROPE_WINDOW (-32, 26, 46, 81). The north edge is 81 to keep
// Svalbard, which is Norwegian and on the European continental shelf; the
// south and west edges keep the Canaries, Madeira and the Azores, which the
// app prices. If the pipeline window moves, move this with it.
const EU_BOX = { minLat: 26, maxLat: 81, minLon: -32, maxLon: 46 }
const outsideEurope = (lat, lon) =>
  lat < EU_BOX.minLat || lat > EU_BOX.maxLat || lon < EU_BOX.minLon || lon > EU_BOX.maxLon

/**
 * Overseas departments and territories of European states: legally France, Spain or
 * Portugal, geographically not Europe. An item here is a scope decision for the
 * product, not a broken coordinate, so it is reported under its own check.
 */
const OVERSEAS = [
  { name: 'Guadeloupe / Martinique / St Martin', minLat: 14, maxLat: 19, minLon: -64, maxLon: -60 },
  { name: 'French Guiana', minLat: 2, maxLat: 6, minLon: -55, maxLon: -51 },
  { name: 'Reunion / Mayotte', minLat: -22, maxLat: -12, minLon: 44, maxLon: 56 },
  { name: 'Canary Islands', minLat: 27, maxLat: 30, minLon: -19, maxLon: -13 },
]
const overseasZone = (lat, lon) =>
  OVERSEAS.find(
    (z) => lat >= z.minLat && lat <= z.maxLat && lon >= z.minLon && lon <= z.maxLon,
  )?.name || null

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/* ------------------------------------------------------- finding collection */

class Report {
  constructor(layer) {
    this.layer = layer
    this.items = 0
    this.findings = []
    this._flagged = new Set()
  }
  add(itemId, check, severity, message, extra = {}) {
    this.findings.push({ id: String(itemId), check, severity, message, ...extra })
    this._flagged.add(String(itemId))
  }
  get flagged() {
    return this._flagged.size
  }
  failureModes() {
    const counts = {}
    for (const f of this.findings) counts[f.check] = (counts[f.check] || 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }
}

/* -------------------------------------------------------- Wikidata resolver */

const CACHE_PATH = path.join(REPORTS, '.wikidata-cache.json')
let wdCache = {}
let wdFetched = 0

function loadCache() {
  if (fs.existsSync(CACHE_PATH)) {
    try {
      wdCache = readJson(CACHE_PATH)
    } catch {
      wdCache = {}
    }
  }
}
function saveCache() {
  fs.mkdirSync(REPORTS, { recursive: true })
  fs.writeFileSync(CACHE_PATH, JSON.stringify(wdCache), 'utf8')
}

/** Fetch up to 50 QIDs per call via wbgetentities. Returns nothing; fills cache. */
async function fetchWikidata(qids) {
  const todo = qids.filter((q) => !(q in wdCache))
  for (let i = 0; i < todo.length; i += 50) {
    if (wdFetched >= WD_LIMIT) break
    const batch = todo.slice(i, i + 50)
    const url =
      'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims' +
      `&ids=${batch.join('|')}`
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'carta-content-audit/1.0 (read-only validity sweep)' },
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const json = await res.json()
      for (const q of batch) {
        const ent = json.entities?.[q]
        if (!ent || ent.missing !== undefined) {
          wdCache[q] = { missing: true }
          continue
        }
        const claims = ent.claims || {}
        const coord = claims.P625?.[0]?.mainsnak?.datavalue?.value
        const instanceOf = (claims.P31 || [])
          .map((c) => c.mainsnak?.datavalue?.value?.id)
          .filter(Boolean)
        const country = (claims.P17 || [])
          .map((c) => c.mainsnak?.datavalue?.value?.id)
          .filter(Boolean)
        wdCache[q] = {
          lat: coord?.latitude ?? null,
          lon: coord?.longitude ?? null,
          p31: instanceOf,
          p17: country,
        }
      }
      wdFetched += batch.length
      await new Promise((r) => setTimeout(r, 120))
    } catch (err) {
      for (const q of batch) if (!(q in wdCache)) wdCache[q] = { error: String(err.message || err) }
    }
  }
  saveCache()
}

/**
 * Which Wikidata classes are compatible with which layer.
 *
 * These are the direct P31 values we accept without a subclass walk. A QID not on
 * the list is reported as "unverified class", NOT as a wrong class, because the
 * item may sit several subclass hops below an acceptable root. Only members of
 * the explicit conflict set are called wrong.
 */
const CLASS_OK = {
  lakes: new Set([
    'Q23397', 'Q131681', 'Q3253281', 'Q9430', 'Q185113', 'Q12284', 'Q1172599',
    'Q1207866', 'Q47521', 'Q124714', 'Q187223', 'Q205895', 'Q30198', 'Q1322134',
    'Q192599', 'Q3253281', 'Q2166161', 'Q13230', 'Q8514', 'Q56059276',
  ]),
  mountains: new Set([
    'Q8502', 'Q207326', 'Q54050', 'Q1437459', 'Q133056', 'Q75520', 'Q23442',
    'Q1210950', 'Q46831', 'Q39816', 'Q271669', 'Q2042028', 'Q3777462', 'Q12518',
    'Q1988123', 'Q4176098', 'Q150784', 'Q160091',
  ]),
  beaches: new Set([
    'Q40080', 'Q9430', 'Q93352', 'Q1798622', 'Q1233637', 'Q205495', 'Q184358',
    'Q2042028', 'Q28503', 'Q42523',
  ]),
}

/** A P31 here is flatly incompatible with the layer, not merely unlisted. */
const CLASS_CONFLICT = {
  lakes: new Set([
    'Q8502', 'Q41176', 'Q16970', 'Q515', 'Q532', 'Q33837', 'Q23442', 'Q207326',
    'Q22698', 'Q811979', 'Q4989906', 'Q11303',
  ]),
  mountains: new Set([
    'Q23397', 'Q41176', 'Q515', 'Q532', 'Q4989906', 'Q11303', 'Q16970', 'Q22698',
    'Q811979', 'Q40080', 'Q12280', 'Q4022',
  ]),
  beaches: new Set([
    'Q8502', 'Q41176', 'Q515', 'Q532', 'Q16970', 'Q4989906', 'Q11303', 'Q23397',
    'Q12280', 'Q4022', 'Q33506',
  ]),
}

/** Wikidata classes with no single meaningful point: river, canal, stream, estuary. */
const LINEAR_P31 = ['Q4022', 'Q12284', 'Q47521', 'Q1321885', 'Q2465754', 'Q355304', 'Q63565252']

async function checkWikidata(report, rows, layerKey) {
  if (!WIKIDATA) return
  const withQid = rows.filter((r) => r.qid && /^Q\d+$/.test(r.qid))
  await fetchWikidata([...new Set(withQid.map((r) => r.qid))])

  for (const r of withQid) {
    const wd = wdCache[r.qid]
    if (!wd) continue
    if (wd.missing) {
      report.add(r.id, 'wikidata_missing', 'high', `Wikidata item ${r.qid} does not exist`, {
        qid: r.qid,
      })
      continue
    }
    if (wd.error) continue

    if (isNum(r.lat) && isNum(r.lon) && isNum(wd.lat) && isNum(wd.lon)) {
      const km = haversineKm({ lat: r.lat, lon: r.lon }, { lat: wd.lat, lon: wd.lon })
      // A river or canal has no single point: Wikidata's P625 marks its source
      // or its mouth, while we store the bathing site on it. The Inn's source
      // is 371 km from the designated stretch at Passau, and both are right.
      // So the 5 km test cannot apply to a linear feature.
      const linear = r.kind === 'river' || LINEAR_P31.some((c) => (wd.p31 || []).includes(c))
      if (km > 5 && !linear) {
        report.add(
          r.id,
          'wikidata_coord_mismatch',
          km > 50 ? 'high' : 'medium',
          `Published coordinates are ${km.toFixed(1)} km from Wikidata ${r.qid}`,
          { qid: r.qid, km: Number(km.toFixed(2)), published: [r.lat, r.lon], wikidata: [wd.lat, wd.lon] },
        )
      }
    }

    const ok = CLASS_OK[layerKey]
    const bad = CLASS_CONFLICT[layerKey]
    if (ok && Array.isArray(wd.p31) && wd.p31.length) {
      const anyOk = wd.p31.some((c) => ok.has(c))
      const anyBad = wd.p31.some((c) => bad?.has(c))
      if (anyBad && !anyOk) {
        report.add(
          r.id,
          'wikidata_class_conflict',
          'high',
          `Wikidata ${r.qid} is instance of ${wd.p31.join(', ')}, incompatible with the ${layerKey} layer`,
          { qid: r.qid, p31: wd.p31 },
        )
      } else if (!anyOk) {
        report.add(
          r.id,
          'wikidata_class_unverified',
          'low',
          `Wikidata ${r.qid} instance-of ${wd.p31.join(', ')} is not on the accepted list for ${layerKey}; needs a subclass walk to confirm`,
          { qid: r.qid, p31: wd.p31 },
        )
      }
    }
  }
}

/* ------------------------------------------------------------ image checks */

/**
 * An image entry is "usable" if it has a URL. It is "credited" if the licence and
 * the author are both recorded. Wikimedia Commons files are CC BY-SA or similar
 * and legally require both, so a missing author is a licence compliance finding,
 * not a cosmetic one.
 */
function checkImages(report, id, images, { requireAuthor = true } = {}) {
  const list = (images || []).filter(Boolean)
  if (!list.length) {
    report.add(id, 'no_image', 'medium', 'Item has no image')
    return
  }
  for (const [i, img] of list.entries()) {
    const url = img.url || img.u || img.big || img.thumb || img.src
    if (!url) {
      report.add(id, 'image_no_url', 'high', `Image ${i} has no URL`)
      continue
    }
    if (typeof url === 'string' && !/^https?:\/\//.test(url)) {
      report.add(id, 'image_bad_url', 'high', `Image ${i} URL is not absolute: ${url}`)
    }
    const licence = img.licence || img.license || img.lic
    const author = img.author || img.by || img.credit_author
    if (!licence) {
      report.add(id, 'image_no_licence', 'high', `Image ${i} has no licence recorded`, { url })
    }
    // Public domain and CC0 files owe nobody a name. This mirrors the rule the
    // pipeline gates on (NO_CREDIT_LIC in pipeline/photos/credit.py), which is
    // deliberately a whitelist of EXEMPTIONS so an unfamiliar licence fails
    // closed: GFDL demands a name and would pass a "starts with CC BY" test.
    const noCreditOwed = /^(CC0|Public domain|PD([-\s]|$)|United States Government Work)/i.test(
      String(licence || ''),
    )
    if (requireAuthor && !author && licence && !noCreditOwed) {
      report.add(id, 'image_no_author', 'high', `Image ${i} is under ${licence}, which requires attribution, but records no author`, { url, licence })
    }
  }
}

/* ------------------------------------------------------------- prose checks */

/**
 * Editorial prose that was generated rather than harvested makes specific claims
 * that no field in the data backs. We look for the claim shapes that are cheap to
 * state and expensive to be wrong about.
 */
const CLAIM_PATTERNS = [
  {
    key: 'superlative',
    // "the largest in Europe", "the highest in the world", "Europe's oldest"
    re: /\b(the|its|Europe's|the world's)?\s*(largest|biggest|highest|tallest|deepest|longest|oldest|smallest|finest|most (?:beautiful|visited|famous|popular))\b[^.]{0,60}\b(in (?:Europe|the world|the country|the region|[A-Z][a-z]+)|on the continent)\b/gi,
  },
  {
    key: 'price',
    re: /(?:€|EUR\s?|£|\$)\s?\d[\d.,]*(?:\s?(?:per|a|\/)\s?(?:person|night|day|head|adult|entry))?/g,
  },
  {
    key: 'opening_time',
    re: /\b(?:open|opens|closes|closed|open daily)\b[^.]{0,40}\b(?:\d{1,2}[:.]\d{2}|\d{1,2}\s?(?:am|pm))\b/gi,
  },
  // Distances and elevations were the noisiest check by an order of magnitude
  // (1,466 hits) and almost none of it was a claim worth auditing: "Pic de
  // Comapedrosa, 2,942 m" is a summit height, stable for as long as the
  // mountain is. A measurement of the landscape is not a perishable claim.
  // What perishes is a promise about the JOURNEY: how long a transfer takes.
  {
    key: 'travel_time',
    re: /(?:takes|allow|about|roughly|around)s+d{1,2}(?:s?h(?:s?d{2})?|s?(?:hours?|minutes?|mins?))[^.]{0,30}?(?:from|to|by|drive|walk|bus|train|ferry|transfer)/gi,
  },
  {
    key: 'capacity_or_count',
    re: /(?:over|more than|nearly)s+[d.,]+s+(?!km|m|metres|meters|minutes|hours)w+/gi,
  },
  {
    key: 'phone_or_booking',
    re: /\+\d{1,3}[\s\d]{6,}|\b(?:reservations?|book(?:ings?)?)\s+(?:online\s+)?at\s+\S+/gi,
  },
]

function scanProse(report, id, text, field, backingValues) {
  if (!text || typeof text !== 'string') return
  // Split into sentences; a claim is attributed to the sentence that carries it.
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z0-9*])/)
  for (const sentence of sentences) {
    const plain = sentence.replace(/\*\*/g, '')
    for (const { key, re } of CLAIM_PATTERNS) {
      re.lastIndex = 0
      const hits = plain.match(re)
      if (!hits) continue
      for (const hit of new Set(hits)) {
        const token = hit.trim()
        // If the literal number appears in a data field, the claim is backed.
        if (isBacked(token, backingValues)) continue
        report.add(id, `prose_${key}`, key === 'superlative' ? 'medium' : 'low', `Unbacked ${key} claim in ${field}: "${token}"`, {
          field,
          claim: token,
          sentence: plain.trim().slice(0, 300),
        })
      }
    }
  }
}

/** Does any number in the claim appear in a field of the item's own data? */
function isBacked(token, backingValues) {
  if (!backingValues || !backingValues.size) return false
  const nums = token.match(/\d[\d.,]*/g)
  if (!nums) return false
  return nums.every((n) => {
    const clean = n.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')
    const v = Number(clean)
    if (!Number.isFinite(v)) return false
    for (const b of backingValues) {
      if (Math.abs(b - v) < Math.max(1, Math.abs(v) * 0.02)) return true
    }
    return false
  })
}

/** Harvest every number anywhere in an object, to test prose claims against. */
function numericFields(obj, out = new Set(), depth = 0) {
  if (depth > 6 || !obj) return out
  if (typeof obj === 'number' && Number.isFinite(obj)) {
    out.add(obj)
    // km <-> m, and hours <-> minutes, are the same claim in different units
    out.add(Math.round(obj / 1000))
    out.add(Math.round(obj * 1000))
    out.add(Math.round(obj / 60))
    return out
  }
  if (Array.isArray(obj)) {
    for (const v of obj) numericFields(v, out, depth + 1)
    return out
  }
  if (typeof obj === 'object') {
    for (const v of Object.values(obj)) numericFields(v, out, depth + 1)
  }
  return out
}

/* ------------------------------------------------------------ shared checks */

function baseChecks(report, r, { requireCoords = true, requireImage = true } = {}) {
  if (!r.name || typeof r.name !== 'string' || !r.name.trim()) {
    report.add(r.id, 'no_name', 'high', 'Item has no name')
  }
  if (requireCoords) {
    if (!isNum(r.lat) || !isNum(r.lon)) {
      report.add(r.id, 'no_coords', 'high', 'Item has no usable coordinates')
    } else if (r.lat === 0 && r.lon === 0) {
      report.add(r.id, 'null_island', 'high', 'Coordinates are 0,0')
    } else if (
      Math.abs(r.lat * 10 - Math.round(r.lat * 10)) < 1e-9 &&
      Math.abs(r.lon * 10 - Math.round(r.lon * 10)) < 1e-9
    ) {
      // Both coordinates landing exactly on a tenth of a degree is a rounded
      // placeholder, not a measurement: a tenth of a degree is about 11 km, so
      // the map pin can sit in the wrong town. Zwartven ships 51.3,5.5 while
      // Wikidata puts it at 51.06, 27 km away.
      report.add(r.id, 'coords_low_precision', 'medium', `Coordinates ${r.lat},${r.lon} are rounded to a tenth of a degree, about 11 km of slop`)
    } else if (outsideEurope(r.lat, r.lon)) {
      const zone = overseasZone(r.lat, r.lon)
      if (zone) {
        report.add(r.id, 'overseas_territory', 'low', `Item sits in ${zone}, outside geographic Europe`, {
          coords: [r.lat, r.lon],
        })
      } else {
        report.add(r.id, 'coords_outside_europe', 'high', `Coordinates ${r.lat},${r.lon} fall outside the European envelope`)
      }
    }
  }
  if (requireImage) checkImages(report, r.id, r.images)
}

/* ----------------------------------------------------------------- layers */

function auditBeaches() {
  const report = new Report('beaches')
  for (const file of listJson(path.join(PUB, 'beaches'))) {
    const j = readJson(path.join(PUB, 'beaches', file))
    const rows = [...(j.beaches || []), ...(j.listed || [])]
    for (const b of rows) {
      report.items++
      baseChecks(report, b)

      // Category: a beach must sit on water. A "beach" whose own tags say lake or
      // reservoir is a lake shore mis-shelved, which is exactly the failure asked for.
      const tags = new Set([...(b.tags || []), ...(b.bestFor || [])])
      const whyKinds = new Set((b.why || []).map((w) => w.k))
      if (b.water && typeof b.water === 'object' && b.water.type) {
        const t = String(b.water.type).toLowerCase()
        if (/lake|reservoir|pond/.test(t)) {
          report.add(b.id, 'category_inland_water', 'medium', `Beach sits on water typed "${b.water.type}"`)
        }
      }
      if (whyKinds.has('kindLake') || tags.has('lake')) {
        report.add(b.id, 'category_inland_water', 'medium', 'Beach carries a lake marker in its own tags')
      }
      if (b.lengthM !== undefined && b.lengthM !== null) {
        if (!isNum(b.lengthM) || b.lengthM <= 0) {
          report.add(b.id, 'implausible_length', 'low', `lengthM is ${b.lengthM}`)
        } else if (b.lengthM > 60000) {
          report.add(b.id, 'implausible_length', 'medium', `lengthM of ${b.lengthM} exceeds 60 km`)
        }
      }
    }
  }
  return { report, qidRows: collectQids(path.join(PUB, 'beaches'), (j) => [...(j.beaches || []), ...(j.listed || [])]) }
}

function auditLakes() {
  const report = new Report('lakes')
  for (const file of listJson(path.join(PUB, 'lakes'))) {
    const j = readJson(path.join(PUB, 'lakes', file))
    const rows = [...(j.lakes || []), ...(j.listed || [])]
    for (const l of rows) {
      report.items++
      baseChecks(report, l)

      // This layer is swimmable inland water, not strictly lakes. River and
      // geothermal entries are EEA-designated bathing sites on rivers and hot
      // springs, and the app labels them honestly: lakeStory.js maps kindRiver
      // to lake.tagRiver, "River". So they are in scope, and only a kind the
      // app has no label for is a finding.
      const LAKE_KINDS = new Set([
        'lake', 'reservoir', 'lagoon', 'crater', 'tarn', 'pond', 'loch',
        'pool', 'river', 'geothermal',
      ])
      if (l.kind && !LAKE_KINDS.has(l.kind)) {
        report.add(l.id, 'category_wrong_kind', 'medium', `Lake layer holds an item of kind "${l.kind}", which the app has no label for`)
      }
      // swim is authoritative safety data; a swim verdict with no backing source is
      // a claim the product should not be making.
      if (l.swim && typeof l.swim === 'object' && l.swim.ok === true && !l.swim.src && !l.measured) {
        report.add(l.id, 'unsourced_swim_verdict', 'medium', 'Swim verdict is positive but carries no source and is not measured')
      }
      if (isNum(l.size?.km2) && l.size.km2 <= 0) {
        report.add(l.id, 'implausible_area', 'low', `Area is ${l.size.km2} km2`)
      }
    }
  }
  return { report, qidRows: collectQids(path.join(PUB, 'lakes'), (j) => [...(j.lakes || []), ...(j.listed || [])]) }
}

/**
 * Islands and island countries: the high point of one of these has the sea on
 * every side, so its prominence equals its elevation. A mainland country high
 * point does not qualify (it can sit on a ridge continuing across a border),
 * so only insular cases are listed.
 */
const ISLAND_HIGHPOINTS = new Set([
  'Sicily', 'Sardinia', 'Corsica', 'Crete', 'Cyprus', 'Malta', 'Iceland',
  'Ireland', 'Majorca', 'Mallorca', 'Ibiza', 'Menorca', 'Tenerife',
  'Gran Canaria', 'La Palma', 'Madeira', 'Rhodes', 'Corfu', 'Euboea',
  'Gotland', 'Bornholm', 'Faroe Islands', 'Isle of Man', 'Jersey', 'Guernsey',
  'Elba', 'Capri', 'Ischia', 'Lesbos', 'Naxos', 'Samothrace', 'Thasos',
])

function auditMountains() {
  const report = new Report('mountains')
  for (const file of listJson(path.join(PUB, 'mountains'))) {
    const j = readJson(path.join(PUB, 'mountains', file))
    const rows = [...(j.mountains || []), ...(j.listed || [])]
    for (const m of rows) {
      report.items++
      baseChecks(report, m)

      const PEAK_KINDS = new Set(['peak', 'volcano', 'ridge', 'massif', 'rock', 'plateau', 'hill', 'pass', 'range', 'cliff'])
      if (m.kind && !PEAK_KINDS.has(m.kind)) {
        report.add(m.id, 'category_wrong_kind', 'medium', `Mountain layer holds an item of kind "${m.kind}"`)
      }
      // A "mountain" that is a building, a tower or a mast.
      // "Tour" and "Torre" name real Alpine and Mediterranean summits (Tour Salliere,
      // Aiguille du Tour), so they are deliberately not in this list.
      if (typeof m.name === 'string' && /\b(tower|turm|toren|mast|antenna|pylon|church|kirche|chapel|museum|hotel|monument)\b/i.test(m.name)) {
        report.add(m.id, 'category_looks_like_structure', 'medium', `Name suggests a structure, not a landform: "${m.name}"`)
      }
      if (m.ele !== undefined && m.ele !== null) {
        if (!isNum(m.ele)) {
          report.add(m.id, 'implausible_elevation', 'low', `Elevation is ${m.ele}`)
        } else if (m.ele > 5700) {
          report.add(m.id, 'implausible_elevation', 'high', `Elevation of ${m.ele} m exceeds the highest point in Europe`)
        } else if (m.ele < 100 && m.kind === 'peak') {
          report.add(m.id, 'implausible_elevation', 'low', `Peak listed at ${m.ele} m`)
        }
      }
      // Prominence can never exceed elevation.
      if (isNum(m.ele) && isNum(m.prom) && m.prom > m.ele + 1) {
        report.add(m.id, 'prominence_exceeds_elevation', 'high', `Prominence ${m.prom} m exceeds elevation ${m.ele} m`)
      }
      // An island or country high point descends to the sea on every side, so
      // its prominence IS its elevation. A computed value far below that is a
      // windowed DEM search that closed before it found the real col: Etna,
      // the high point of Sicily at 3,357 m, came back with 83 m. The guard in
      // peak_index.prominence_of() can only catch a prominence that is too
      // HIGH; this catches the opposite error, which is why it lives here.
      if (m.highpointOf && isNum(m.ele) && isNum(m.prom) && m.prom < m.ele * 0.9) {
        const looksInsular = ISLAND_HIGHPOINTS.has(String(m.highpointOf))
        if (looksInsular) {
          report.add(
            m.id,
            'highpoint_prominence_too_low',
            'medium',
            `${m.name} is the high point of ${m.highpointOf} but publishes ${m.prom} m of prominence against ${m.ele} m of elevation; an island high point descends to the sea`,
            { ele: m.ele, prom: m.prom, promSrc: m.promSrc || 'published' },
          )
        }
      }

      // "highest point of X" is a superlative the data must back.
      if (m.highpointOf && !isNum(m.ele)) {
        report.add(m.id, 'unbacked_highpoint', 'medium', `Claims to be the high point of ${m.highpointOf} but carries no elevation`)
      }
    }
  }
  return { report, qidRows: collectQids(path.join(PUB, 'mountains'), (j) => [...(j.mountains || []), ...(j.listed || [])]) }
}

function auditTrails() {
  const report = new Report('trails')
  for (const file of listJson(path.join(PUB, 'trails'))) {
    const j = readJson(path.join(PUB, 'trails', file))
    const rows = [...(j.trips || []), ...(j.listed || [])]
    for (const t of rows) {
      report.items++
      if (!t.name) report.add(t.id, 'no_name', 'high', 'Trail has no name')

      const geom = t.geometry
      const coords = geom?.coordinates
      const nSeg = Array.isArray(coords) ? coords.length : 0
      if (!geom || !nSeg) {
        report.add(t.id, 'no_geometry', 'high', 'Trail has no geometry')
      } else {
        // bbox and geometry must agree; a trail whose bbox is elsewhere is a splice bug
        const flat = []
        const walk = (c) => {
          if (Array.isArray(c) && isNum(c[0]) && isNum(c[1])) flat.push(c)
          else if (Array.isArray(c)) c.forEach(walk)
        }
        walk(coords)
        if (!flat.length) {
          report.add(t.id, 'no_geometry', 'high', 'Geometry carries no coordinate pairs')
        } else {
          const bad = flat.find(([lon, lat]) => !isNum(lat) || !isNum(lon) || outsideEurope(lat, lon))
          if (bad) {
            report.add(t.id, 'geometry_outside_europe', 'high', `Geometry contains the point ${bad[1]},${bad[0]}`)
          }
          if (Array.isArray(t.bbox) && t.bbox.length === 4) {
            const [minLon, minLat, maxLon, maxLat] = t.bbox
            const off = flat.find(
              ([lon, lat]) =>
                lon < minLon - 0.01 || lon > maxLon + 0.01 || lat < minLat - 0.01 || lat > maxLat + 0.01,
            )
            if (off) {
              report.add(t.id, 'bbox_geometry_mismatch', 'medium', `Geometry point ${off[1]},${off[0]} falls outside the declared bbox`)
            }
          }
        }
      }

      // A "trail" that is a road. OSM highway class is not carried through, so we
      // use the name, which is where motorways announce themselves.
      if (typeof t.name === 'string' && /\b(autobahn|autostrada|autoroute|motorway|snelweg|A\d{1,3}\b\s?(?:motorway|autobahn))\b/i.test(t.name)) {
        report.add(t.id, 'category_looks_like_road', 'medium', `Name suggests a road, not a trail: "${t.name}"`)
      }
      const TRAIL_CATS = new Set(['hike', 'citytrip', 'walk', 'foot', 'mtb', 'ski', 'run'])
      if (t.category && !TRAIL_CATS.has(t.category)) {
        report.add(t.id, 'category_wrong_kind', 'medium', `Trail layer holds category "${t.category}"`)
      }

      if (isNum(t.distance_m)) {
        if (t.distance_m <= 0) report.add(t.id, 'implausible_distance', 'medium', `distance_m is ${t.distance_m}`)
        else if (t.distance_m > 5_000_000) report.add(t.id, 'implausible_distance', 'medium', `distance_m of ${t.distance_m} exceeds 5,000 km`)
      }
      if (isNum(t.ascent_m) && isNum(t.distance_m) && t.distance_m > 0) {
        // More than 400 m of climb per kilometre is a cliff, not a path.
        const grade = t.ascent_m / (t.distance_m / 1000)
        if (grade > 400) {
          report.add(t.id, 'implausible_ascent', 'medium', `Ascent of ${t.ascent_m} m over ${(t.distance_m / 1000).toFixed(1)} km is ${grade.toFixed(0)} m/km`)
        }
      }
      if (!t.license && !t.attribution_text) {
        report.add(t.id, 'no_licence', 'high', 'Trail carries neither a licence nor attribution text')
      }
      // Trail thumbs are {u} pointers; the file licence lives in the photo layer, so
      // require only a usable URL here.
      const timg = t.img?.u || t.img?.url
      if (t.img && !timg) report.add(t.id, 'image_no_url', 'high', 'Trail image entry has no URL')
      else if (timg && !/^https?:\/\//.test(timg)) report.add(t.id, 'image_bad_url', 'high', `Trail image URL is not absolute: ${timg}`)
      if (!timg) report.add(t.id, 'no_image', 'low', 'Trail has no image')
      if (t.summary) {
        scanProse(report, t.id, t.summary, 'summary', numericFields(t))
      }
    }
  }
  return { report, qidRows: [] }
}

function auditCycling() {
  const report = new Report('cycling')
  for (const file of listJson(path.join(PUB, 'cycling'))) {
    const j = readJson(path.join(PUB, 'cycling', file))
    const rows = [...(j.routes || []), ...(j.listed || []), ...(j.tours || [])]
    for (const c of rows) {
      report.items++
      // A null name is deliberate on this layer: where OSM had only a bare
      // number, the export ships no name and the app composes a title from the
      // network level and the ref (routeTitle() in src/lib/cycleStory.js), so
      // "Regional route 45" beats shipping "(45)" as a name. Only a row with
      // neither a name nor a ref is unnameable.
      if (!c.name && !c.ref) {
        report.add(c.id, 'no_name', 'high', 'Route has neither a name nor a ref, so no title can be composed')
      }

      const coords = c.geometry?.coordinates
      const flat = []
      const walk = (x) => {
        if (Array.isArray(x) && isNum(x[0]) && isNum(x[1])) flat.push(x)
        else if (Array.isArray(x)) x.forEach(walk)
      }
      if (coords) walk(coords)
      if (!flat.length) {
        // A cycle route with no geometry is the failure named in the brief.
        report.add(c.id, 'no_geometry', 'high', 'Cycle route has no geometry')
      } else {
        const bad = flat.find(([lon, lat]) => outsideEurope(lat, lon))
        if (bad) report.add(c.id, 'geometry_outside_europe', 'high', `Geometry contains ${bad[1]},${bad[0]}`)
      }

      if (isNum(c.km)) {
        if (c.km <= 0) report.add(c.id, 'implausible_distance', 'medium', `km is ${c.km}`)
        else if (c.km > 20000) report.add(c.id, 'implausible_distance', 'medium', `km of ${c.km} exceeds 20,000`)
      } else {
        report.add(c.id, 'no_distance', 'low', 'Route carries no distance')
      }
      if (!c.lic && !c.src) report.add(c.id, 'no_licence', 'high', 'Route carries neither licence nor source')
      const cimg = c.img?.u || c.img?.url || (typeof c.img === 'string' ? c.img : null)
      if (c.img && !cimg) report.add(c.id, 'image_no_url', 'high', 'Route image entry has no URL')
      else if (cimg && !/^https?:\/\//.test(cimg)) report.add(c.id, 'image_bad_url', 'high', `Route image URL is not absolute: ${cimg}`)
    }
  }
  return { report, qidRows: [] }
}

function auditTrips() {
  const report = new Report('trips')
  for (const file of listJson(path.join(PUB, 'trips'))) {
    const j = readJson(path.join(PUB, 'trips', file))
    for (const t of j.trips || []) {
      report.items++
      if (!t.id) report.add(t.id ?? file, 'no_name', 'high', 'Trip has no id')
      if (!isNum(t.lat) || !isNum(t.lon)) {
        report.add(t.id, 'no_coords', 'high', 'Trip has no anchor coordinates')
      } else if (outsideEurope(t.lat, t.lon)) {
        report.add(t.id, 'coords_outside_europe', 'high', `Anchor ${t.lat},${t.lon} is outside Europe`)
      }
      // Trip heroes are Commons thumbs carrying `credit` (the subject) and `page`.
      // There is no per-file licence on this layer by design, so only absence or a
      // broken URL is a finding.
      if (!t.img?.url) {
        report.add(t.id, 'no_image', 'medium', 'Trip has no hero image')
      } else {
        if (!/^https?:\/\//.test(t.img.url)) {
          report.add(t.id, 'image_bad_url', 'high', `Hero URL is not absolute: ${t.img.url}`)
        }
        if (!t.img.credit && !t.img.page) {
          report.add(t.id, 'image_no_credit', 'medium', 'Hero image records neither a credit nor a source page')
        }
      }

      // nights and days must agree with the city stops the trip actually lists.
      const cityNights = (t.cities || []).reduce((s, c) => s + (c.n || 0), 0)
      if (isNum(t.nights) && cityNights && Math.abs(cityNights - t.nights) > 1) {
        report.add(t.id, 'nights_mismatch', 'medium', `Trip declares ${t.nights} nights but its stops total ${cityNights}`)
      }
      if (isNum(t.days) && isNum(t.nights) && t.days < t.nights) {
        report.add(t.id, 'days_mismatch', 'medium', `Trip has ${t.days} days but ${t.nights} nights`)
      }
      // Sights are named without a backing POI record on the trip itself.
      if (Array.isArray(t.sights) && t.sights.length && !t.detail) {
        report.add(t.id, 'sights_unbacked', 'low', `Trip names ${t.sights.length} sights but carries no detail payload`)
      }
    }
  }
  return { report, qidRows: [] }
}

function auditJourneys() {
  const report = new Report('journeys')
  const dir = path.join(PUB, 'journeys', 'journey')
  for (const file of listJson(dir)) {
    const j = readJson(path.join(dir, file))
    report.items++
    const id = j.slug || file

    if (!j.title) report.add(id, 'no_name', 'high', 'Journey has no title')
    // Journey heroes follow the trip-hero convention: `credit` names the
    // subject and `page` links the source, with the Commons notice carried once
    // at layer level in journeys/index.json. So the finding here is an absent
    // or unattributable hero, not a missing per-file licence string.
    if (!j.hero?.url) {
      report.add(id, 'no_image', 'medium', 'Journey has no hero image')
    } else if (!/^https?:\/\//.test(j.hero.url)) {
      report.add(id, 'image_bad_url', 'high', `Hero URL is not absolute: ${j.hero.url}`)
    } else if (!j.hero.credit && !j.hero.page) {
      report.add(id, 'image_no_credit', 'medium', 'Hero image records neither a credit nor a source page')
    }

    // This layer carries its own provenance. Honour it.
    if (j.summaryGenerated === true) {
      report.add(id, 'prose_generated', 'medium', 'Summary is flagged as generated rather than harvested')
    }
    if (j.provenance?.synthesized === true) {
      report.add(id, 'prose_generated', 'medium', 'Journey is flagged as synthesized in its own provenance block')
    }
    if (isNum(j.verifyFlagCount) && j.verifyFlagCount > 0) {
      report.add(id, 'self_declared_verify_flag', 'medium', `Journey carries ${j.verifyFlagCount} unresolved verify flags`, {
        flags: j.verifyFlags,
      })
    }
    if (j.volatilePricing === true) {
      report.add(id, 'volatile_pricing', 'low', 'Journey is flagged as carrying volatile pricing')
    }
    if (!j.sources || (typeof j.sources === 'object' && !Object.keys(j.sources).length)) {
      report.add(id, 'no_sources', 'high', 'Journey carries no sources block')
    }

    const backing = numericFields({
      durationDays: j.durationDays,
      budget: j.budget,
      coordinates: j.coordinates,
      snapshot: j.snapshot,
      budgetTierRange: j.budgetTierRange,
    })
    // The sources block is harvested evidence: a claim repeated there is backed.
    const sourceText = JSON.stringify(j.sources || {})
    const verifiedNums = new Set((sourceText.match(/\d[\d.,]*/g) || []).map((n) => Number(n.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'))).filter(Number.isFinite))
    for (const v of verifiedNums) backing.add(v)

    scanProse(report, id, j.summary, 'summary', backing)
    for (const [i, tip] of (j.proTips || []).entries()) {
      scanProse(report, id, tip, `proTips[${i}]`, backing)
    }
    for (const [i, day] of (j.itinerary || []).entries()) {
      for (const slot of ['morning', 'afternoon', 'evening']) {
        scanProse(report, id, day?.[slot], `itinerary[${i}].${slot}`, backing)
      }
    }
  }
  return { report, qidRows: [] }
}

function auditRegion() {
  const report = new Report('region')
  const emptyRegions = []
  for (const file of listJson(path.join(PUB, 'region'))) {
    const j = readJson(path.join(PUB, 'region', file))
    report.items++
    const id = j.region?.id || file.replace(/\.json$/, '')
    if (!j.region?.name) report.add(id, 'no_name', 'high', 'Region has no name')

    const rows = [...(j.rated || []), ...(j.listed || [])]
    // An empty region file is deliberate, not missing data: under public/ a
    // missing JSON is served as the SPA index with status 200, so "no file"
    // would read as HTML rather than as "nothing here". Counted, not flagged.
    if (!rows.length) emptyRegions.push(id)
    for (const r of rows) {
      // Every cross-layer row must say which layer it came from and carry a licence.
      if (!r.layer) {
        report.add(id, 'row_no_layer', 'medium', `Row ${r.id} (${r.name}) does not declare its source layer`)
      }
      // Provenance is spelled differently per source layer: trails carry license +
      // attribution_text, the nature layers carry a credit[] array.
      // Three spellings, one meaning: trails ship license/attribution_text, the
      // nature layers ship a credit[] array, cycling ships the short lic/src.
      const hasCredit =
        r.license ||
        r.attribution_text ||
        r.lic ||
        r.src ||
        (Array.isArray(r.credit) ? r.credit.length > 0 : Boolean(r.credit))
      if (!hasCredit) {
        report.add(id, 'row_no_licence', 'high', `Row ${r.id} (${r.name}) carries no licence, attribution or credit`, {
          row_layer: r.layer || null,
        })
      }
      // Region thumbs are pointers into the source layer, which holds the credit.
      // Only a broken or relative URL is a finding here.
      if (r.img?.u && !/^https?:\/\//.test(r.img.u)) {
        report.add(id, 'image_bad_url', 'high', `Row ${r.id} thumb URL is not absolute: ${r.img.u}`)
      }
    }
    if (j.editorial) {
      scanProse(report, id, typeof j.editorial === 'string' ? j.editorial : j.editorial.body, 'editorial', numericFields(j.rated || []))
    }
  }
  report.note = { empty_regions: emptyRegions.length }
  return { report, qidRows: [] }
}

function auditDossier() {
  const report = new Report('dossier')
  let groundedIntros = 0
  const dir = path.join(PUB, 'dossier')
  const bySlug = new Map()

  for (const file of listJson(dir)) {
    // index.json is the manifest, not a dossier.
    if (file === 'index.json') continue
    const d = readJson(path.join(dir, file))
    report.items++
    const id = file.replace(/\.json$/, '')

    if (d.slug) {
      if (!bySlug.has(d.slug)) bySlug.set(d.slug, [])
      bySlug.get(d.slug).push(file)
    } else {
      report.add(id, 'no_slug', 'high', 'Dossier has no slug')
    }

    const p = d.place || {}
    if (!p.name) report.add(id, 'no_name', 'high', 'Dossier has no place name')
    if (!isNum(p.lat) || !isNum(p.lon)) report.add(id, 'no_coords', 'high', 'Dossier has no coordinates')
    else if (outsideEurope(p.lat, p.lon)) report.add(id, 'coords_outside_europe', 'high', `Coordinates ${p.lat},${p.lon} are outside Europe`)

    const gallery = d.gallery || []
    if (!gallery.length) report.add(id, 'no_image', 'medium', 'Dossier has an empty gallery')
    checkImages(report, id, gallery, { requireAuthor: true })

    // Every image the page shows must be represented in the credits payload.
    const credits = d.credits || []
    const creditKeys = new Set(credits.map((c) => c.key))
    const usesCommons = gallery.some((g) => /wikimedia\.org/.test(g.url || ''))
    if (usesCommons && !creditKeys.has('commons') && !credits.some((c) => /commons|wikimedia/i.test(c.name || ''))) {
      report.add(id, 'credits_missing_source', 'high', 'Gallery uses Wikimedia Commons but the credits payload does not name it')
    }
    for (const hl of d.highlights || []) {
      if (hl.image) checkImages(report, id, [hl.image], { requireAuthor: true })
    }

    // Highlights far from the place they belong to.
    if (isNum(p.lat) && isNum(p.lon)) {
      for (const hl of d.highlights || []) {
        if (isNum(hl.lat) && isNum(hl.lon)) {
          const km = haversineKm({ lat: p.lat, lon: p.lon }, { lat: hl.lat, lon: hl.lon })
          if (km > 60) {
            report.add(id, 'highlight_too_far', 'medium', `Highlight "${hl.name}" is ${km.toFixed(0)} km from ${p.name}`)
          }
          if (isNum(hl.dist_km) && Math.abs(hl.dist_km - km) > Math.max(2, km * 0.25)) {
            report.add(id, 'highlight_distance_wrong', 'medium', `Highlight "${hl.name}" states ${hl.dist_km} km but is ${km.toFixed(1)} km away`)
          }
        }
      }
    }

    // Intro prose: grounded if it carries a grounding block, suspect otherwise.
    const intro = d.intro
    if (intro?.body) {
      if (!intro.grounding || !intro.grounding.length) {
        report.add(id, 'prose_ungrounded', 'medium', 'Intro prose carries no grounding sources')
      }
      const backing = numericFields({
        place: p,
        sleep: d.sleep,
        verdict: d.verdict,
        water: d.water,
        around: d.around?.counts,
      })
      // Grounding text is harvested evidence; numbers in it back the prose.
      const gtext = JSON.stringify(intro.grounding || [])
      for (const n of (gtext.match(/\d[\d.,]*/g) || [])) {
        const v = Number(n.replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.'))
        if (Number.isFinite(v)) backing.add(v)
      }
      // Prompt 6.1 asks for prose that was GENERATED rather than harvested.
      // A dossier intro with a grounding block is quoted from Wikivoyage or
      // Wikipedia under CC BY-SA, with the article and licence on record, so
      // "Aalborg is the largest city in North Jutland" is a sourced claim,
      // not an invented one. Only ungrounded prose is scanned; the missing
      // grounding block is itself reported above.
      if (intro.grounding && intro.grounding.length) {
        groundedIntros++
      } else {
        scanProse(report, id, intro.body, 'intro.body', backing)
      }
    }

    if (d.verdict && !d.verdict.confidence) {
      report.add(id, 'verdict_no_confidence', 'low', 'Verdict carries no confidence marker')
    }
  }

  // Slug collisions: two files answering to one URL. These also block the SEO work.
  for (const [slug, files] of bySlug) {
    if (files.length > 1) {
      report.add(slug, 'slug_collision', 'high', `Slug "${slug}" is claimed by ${files.length} files: ${files.join(', ')}`, {
        slug,
        files,
      })
    }
  }

  return { report, qidRows: [] }
}

/* --------------------------------------------------- Wikidata row collection */

function collectQids(dir, pick) {
  const rows = []
  for (const file of listJson(dir)) {
    const j = readJson(path.join(dir, file))
    for (const it of pick(j)) {
      const qid = it.wd || it.wikidata || it.qid || (typeof it.id === 'string' ? (it.id.match(/(Q\d+)$/) || [])[1] : null)
      if (qid) rows.push({ id: it.id, qid, lat: it.lat, lon: it.lon, name: it.name, kind: it.kind })
    }
  }
  return rows
}

/* -------------------------------------------------------------------- main */

const LAYERS = {
  trips: auditTrips,
  journeys: auditJourneys,
  trails: auditTrails,
  beaches: auditBeaches,
  lakes: auditLakes,
  mountains: auditMountains,
  cycling: auditCycling,
  region: auditRegion,
  dossier: auditDossier,
}

async function main() {
  fs.mkdirSync(REPORTS, { recursive: true })
  loadCache()

  const names = ONLY.length ? ONLY : Object.keys(LAYERS)
  const summaries = []

  for (const name of names) {
    const fn = LAYERS[name]
    if (!fn) {
      console.error(`unknown layer: ${name}`)
      continue
    }
    process.stderr.write(`auditing ${name} ... `)
    const { report, qidRows } = fn()
    if (WIKIDATA && qidRows.length) {
      process.stderr.write(`wikidata(${qidRows.length}) ... `)
      await checkWikidata(report, qidRows, name)
    }

    const out = {
      layer: report.layer,
      generated_at: new Date().toISOString(),
      wikidata_checked: WIKIDATA && qidRows.length > 0,
      items: report.items,
      items_flagged: report.flagged,
      findings_total: report.findings.length,
      failure_modes: Object.fromEntries(report.failureModes()),
      severity: report.findings.reduce((a, f) => ((a[f.severity] = (a[f.severity] || 0) + 1), a), {}),
      findings: report.findings,
    }
    fs.writeFileSync(path.join(REPORTS, `content-${name}.json`), JSON.stringify(out, null, 2), 'utf8')
    summaries.push({ layer: name, ...out })
    process.stderr.write(`${report.items} items, ${report.flagged} flagged\n`)
  }

  // Combined summary, so one file answers "how is the catalogue doing".
  const allModes = {}
  for (const s of summaries) {
    for (const [k, v] of Object.entries(s.failure_modes)) allModes[k] = (allModes[k] || 0) + v
  }
  const top = Object.entries(allModes).sort((a, b) => b[1] - a[1])
  fs.writeFileSync(
    path.join(REPORTS, 'content-summary.json'),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        wikidata_checked: WIKIDATA,
        layers: summaries.map((s) => ({
          layer: s.layer,
          items: s.items,
          items_flagged: s.items_flagged,
          findings: s.findings_total,
          top_modes: Object.entries(s.failure_modes).slice(0, 5),
        })),
        top_failure_modes: top,
      },
      null,
      2,
    ),
    'utf8',
  )

  // Table
  const pad = (s, n) => String(s).padEnd(n)
  const padL = (s, n) => String(s).padStart(n)
  console.log('')
  console.log(pad('layer', 12) + padL('items', 9) + padL('flagged', 9) + padL('pct', 7) + padL('findings', 10) + '  top failure mode')
  console.log('-'.repeat(86))
  for (const s of summaries) {
    const pct = s.items ? ((s.items_flagged / s.items) * 100).toFixed(1) + '%' : '-'
    const first = Object.entries(s.failure_modes)[0]
    console.log(
      pad(s.layer, 12) +
        padL(s.items, 9) +
        padL(s.items_flagged, 9) +
        padL(pct, 7) +
        padL(s.findings_total, 10) +
        '  ' +
        (first ? `${first[0]} (${first[1]})` : 'none'),
    )
  }
  console.log('-'.repeat(86))
  const tot = summaries.reduce((a, s) => ({ i: a.i + s.items, f: a.f + s.items_flagged, n: a.n + s.findings_total }), { i: 0, f: 0, n: 0 })
  console.log(pad('TOTAL', 12) + padL(tot.i, 9) + padL(tot.f, 9) + padL(tot.i ? ((tot.f / tot.i) * 100).toFixed(1) + '%' : '-', 7) + padL(tot.n, 10))
  console.log('')
  console.log('Top 5 failure modes across all layers')
  for (const [mode, n] of top.slice(0, 5)) console.log(`  ${padL(n, 8)}  ${mode}`)
  console.log('')
  console.log(`Reports written to ${path.relative(ROOT, REPORTS)}/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
