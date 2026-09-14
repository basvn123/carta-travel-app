/**
 * Carta — unified trip schema (v2.0)
 *
 * Hand-maintained companion to `schema/SCHEMA.md`. These types describe both the
 * JSON payload in `data/trips.master.json` (camelCase) and, at the bottom, the
 * row shapes produced by the Supabase migrations (snake_case).
 */

/* ------------------------------------------------------------------ enums */

export const TRIP_TYPES = [
  { id: 1, name: 'Cycling Trips', slug: 'cycling' },
  { id: 2, name: 'Trail Running', slug: 'trail-running' },
  { id: 3, name: 'City Trips', slug: 'city' },
  { id: 4, name: 'Cozy Towns Trips', slug: 'cozy-towns' },
  { id: 5, name: 'Road Trips & Scenic Drives', slug: 'road-trip' },
  { id: 6, name: 'Hiking & Alpine Trekking', slug: 'hiking' },
  { id: 7, name: 'Culinary & Wine Tours', slug: 'culinary' },
  { id: 8, name: 'Winter Sports & Skiing', slug: 'winter-sports' },
  { id: 9, name: 'Nature Escapes & Cabin Stays', slug: 'nature-escape' },
  { id: 10, name: 'Water Sports & Coastal Trips', slug: 'water-sports' },
] as const;

export type TripTypeId = (typeof TRIP_TYPES)[number]['id'];
export type TripTypeName = (typeof TRIP_TYPES)[number]['name'];
export type TripTypeSlug = (typeof TRIP_TYPES)[number]['slug'];

export type RegionKey =
  | 'western-central'
  | 'southern-mediterranean'
  | 'eastern-southeastern'
  | 'northern-baltics';

export type RegionName =
  | 'Western & Central Europe'
  | 'Southern & Mediterranean Europe'
  | 'Eastern & Southeastern Europe'
  | 'Northern Europe & Baltics';

export type BudgetTier = '€' | '€€' | '€€€';
export type FitnessLevel = 'Easy' | 'Moderate' | 'Active' | 'Demanding' | 'Expert';
export type CrowdLevel = 'Low' | 'Moderate' | 'High';
export type DifficultyScore = 1 | 2 | 3 | 4 | 5;
export type MonthNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

/** How a coordinate pair was obtained. `country` is a map pin, not a location. */
export type CoordinatePrecision = 'source' | 'city' | 'gateway' | 'country';

export type BudgetCategory = 'accommodation' | 'food' | 'transport' | 'activities';

/* ------------------------------------------------------------ sub-objects */

export interface CountryRef {
  name: string;
  /** ISO 3166-1 alpha-2 (XK used for Kosovo). */
  code: string;
}

export interface BestPeriod {
  months: MonthNumber[];
  monthNames: string[];
  /** Editorial window, e.g. "mid-January to mid-March". */
  window: string | null;
  note: string | null;
  /** Months or conditions to avoid. */
  avoid: string | null;
  raw: string | null;
}

export interface BudgetRange {
  lowEur: number | null;
  highEur: number | null;
  /** The source's own wording, including per-night or per-day detail. */
  note: string | null;
}

export interface Budget {
  currency: 'EUR';
  totalEur: { low: number | null; high: number | null };
  totalNote: string | null;
  breakdown: Record<BudgetCategory, BudgetRange>;
  perDayEur: { low: number | null; high: number | null };
}

export interface TripProfile {
  difficulty: DifficultyScore | null;
  difficultyLabel: FitnessLevel | null;
  /** The source's own difficulty sentence, kept verbatim. */
  difficultyNote: string | null;
  fitnessLevel: FitnessLevel | null;
  crowdLevel: CrowdLevel | null;
  familyFriendly: boolean | null;
  carRequired: boolean | null;
}

export interface ItineraryDay {
  day: number; // 1-7
  title: string | null;
  morning: string | null;
  afternoon: string | null;
  evening: string | null;
  /** Free text: km and ascent, drive time, vertical metres, water hours. */
  dayStats: string | null;
  /** Where you sleep that night, where the source states it. */
  sleep: string | null;
}

export interface Accommodation {
  rank: number;
  name: string;
  style: string | null;
  location: string | null;
  description: string | null;
  booking: string | null;
  priceNote: string | null;
}

export interface Logistics {
  connectivity: string | null;
  emergency: string | null;
  weather: string | null;
  bookingWindows: string | null;
  money: string | null;
  transportRules: string | null;
  permits: string | null;
  health: string | null;
  gettingThere: string | null;
  /** Anything the source labelled but that maps to no canonical slot. */
  other: Array<{ label: string | null; text: string }>;
}

/**
 * Trip-type refinements. `raw` always holds every key the source provided;
 * the named slots are the cross-region normalisation of the four refinements
 * the app filters on.
 */
export interface TypeSpecific {
  raw: Record<string, unknown>;
  /** Cycling: surface split / GPX detail. */
  surface: string | null;
  gpxReady: boolean | null;
  distanceKm: number | null;
  elevationM: number | null;
  verticalM: number | null;
  /** Trail running and alpine: technical grade, waymarking, exposure. */
  technicalRating: string | null;
  /** City trips: transit pass and walkability detail. */
  transitPass: string | null;
  /** Hiking: the hut/refuge booking path. */
  hutBooking: string | null;
  /** Winter sports: lift network, pass tiers, piste breakdown. */
  liftNetwork: string | null;
  snowReliability: string | null;
  /** Water sports: wind statistics, tides, water temperature. */
  windConditions: string | null;
  bookingTimeline: string | null;
  audience: string | null;
}

export interface Coordinates {
  lat: number;
  lon: number;
  precision: CoordinatePrecision;
  matchedPlace: string | null;
  source: string;
}

export interface Provenance {
  batch: RegionKey;
  sourceFile: string;
  sourceFormat: string;
  sourceId: string | null;
  ingestedAt: string; // ISO date
  /** True only for records Carta generated to fill a coverage gap. */
  synthesized: boolean;
}

/* ------------------------------------------------------------ the record */

export interface Trip {
  id: string; // {cc}-{typeSlug}-{nameSlug}
  sourceId: string | null;
  slug: string;
  title: string;
  summary: string;
  /** True when the summary was composed from metadata, not written by an editor. */
  summaryGenerated: boolean;
  hook: string | null;

  country: string;
  countryCode: string;
  countries: CountryRef[];
  isMultiCountry: boolean;
  region: RegionName;
  regionKey: RegionKey;
  subRegion: string | null;

  tripType: TripTypeName;
  tripTypeId: TripTypeId;
  tripTypeSlug: TripTypeSlug;
  durationDays: 7;

  bestPeriod: BestPeriod;

  budgetTier: BudgetTier;
  /** [min, max] rank 1-3 when the source gave a straddling tier such as "€–€€". */
  budgetTierRange: [number, number] | null;
  budgetTierRaw: string | null;
  budget: Budget;

  profile: TripProfile;

  basecamps: string[];
  gatewayAirport: string | null;
  gatewayAirportCode: string | null;
  languages: string[];
  currency: string | null;
  emergencyNumber: string | null;
  coordinates: Coordinates | null;

  tags: string[];
  snapshot: Record<string, string>;

  itinerary: ItineraryDay[]; // exactly 7, ordered
  accommodationStrategy: Accommodation[];
  logistics: Logistics;
  proTips: string[];
  typeSpecific: TypeSpecific;
  packingNotes: string[];
  whatCouldGoWrong: string[];
  sources: { verified: string | null; confidenceNotes: string | null };

  /** Inline [VERIFY: …] markers lifted out of the source prose. */
  verifyFlags: string[];
  verifyFlagCount: number;
  volatilePricing: boolean;

  wordCount: number;
  dataVintage: number;
  provenance: Provenance;
}

export interface TripDataset {
  schemaVersion: string;
  dataset: string;
  generated: string;
  tripCount: number;
  regions: Record<RegionKey, number>;
  tripTypes: Array<{ id: number; name: string; slug: string }>;
  trips: Trip[];
}

/* ------------------------------------------------------ Supabase row types */

/** `carta_trips` — the flat row. Nested content lives in the child tables. */
export interface CartaTripRow {
  id: string;
  source_id: string | null;
  title: string;
  summary: string | null;
  summary_generated: boolean;
  hook: string | null;
  country_code: string;
  region_key: RegionKey;
  sub_region: string | null;
  is_multi_country: boolean;
  trip_type_id: TripTypeId;
  duration_days: number;
  best_period_months: number[];
  best_period_window: string | null;
  best_period_note: string | null;
  best_period_avoid: string | null;
  budget_tier: BudgetTier;
  budget_tier_min: number | null;
  budget_tier_max: number | null;
  budget_tier_raw: string | null;
  budget_total_low_eur: number | null;
  budget_total_high_eur: number | null;
  budget_total_note: string | null;
  difficulty: DifficultyScore | null;
  difficulty_label: string | null;
  difficulty_note: string | null;
  fitness_level: FitnessLevel | null;
  crowd_level: CrowdLevel | null;
  family_friendly: boolean | null;
  car_required: boolean | null;
  basecamps: string[];
  gateway_airport: string | null;
  gateway_airport_code: string | null;
  languages: string[];
  currency: string | null;
  emergency_number: string | null;
  lat: number | null;
  lon: number | null;
  coord_precision: CoordinatePrecision | null;
  coord_place: string | null;
  tags: string[];
  type_specific: TypeSpecific;
  snapshot: Record<string, string>;
  logistics: Logistics;
  sources: { verified: string | null; confidenceNotes: string | null };
  packing_notes: string[];
  what_could_go_wrong: string[];
  verify_flags: string[];
  verify_flag_count: number;
  volatile_pricing: boolean;
  word_count: number | null;
  data_vintage: number;
  source_batch: string | null;
  source_file: string | null;
  source_format: string | null;
  synthesized: boolean;
  ingested_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CartaTripDayRow {
  trip_id: string;
  day_number: number;
  title: string | null;
  morning: string | null;
  afternoon: string | null;
  evening: string | null;
  day_stats: string | null;
  sleep: string | null;
}

export interface CartaTripBudgetLineRow {
  trip_id: string;
  category: BudgetCategory;
  low_eur: number | null;
  high_eur: number | null;
  note: string | null;
}

export interface CartaTripAccommodationRow {
  trip_id: string;
  rank: number;
  name: string;
  style: string | null;
  location: string | null;
  description: string | null;
  booking: string | null;
  price_note: string | null;
}

export interface CartaTripProTipRow {
  trip_id: string;
  position: number;
  tip: string;
}

/** `carta_trip_cards` — the denormalised view for list and map screens. */
export interface CartaTripCard {
  id: string;
  title: string;
  summary: string | null;
  sub_region: string | null;
  country: string;
  country_code: string;
  region: RegionName;
  region_key: RegionKey;
  trip_type: TripTypeName;
  trip_type_slug: TripTypeSlug;
  trip_type_id: TripTypeId;
  duration_days: number;
  best_period_months: number[];
  best_period_window: string | null;
  budget_tier: BudgetTier;
  budget_total_low_eur: number | null;
  budget_total_high_eur: number | null;
  difficulty: DifficultyScore | null;
  difficulty_label: string | null;
  fitness_level: FitnessLevel | null;
  lat: number | null;
  lon: number | null;
  coord_precision: CoordinatePrecision | null;
  tags: string[];
  verify_flag_count: number;
  volatile_pricing: boolean;
}
