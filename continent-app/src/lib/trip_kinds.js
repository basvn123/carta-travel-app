// Trip-kind chips (filter UI) → underlying category tags from the data
//
// A destination matches a kind if any of its `categories` overlap the kind's
// mapped list. This keeps the app filter compatible whether the data is the
// mock (city-level controlled vocab) or the real v3 pipeline (~70-tag vocab).

export const TRIP_KIND_MAP = {
  city:      ["city"],
  beach:     ["beach"],
  nature:    ["nature", "national-park", "wilderness", "fjord", "fjords", "lake", "lakes", "valley", "countryside", "volcanic"],
  mountains: ["alps", "mountains", "skiing"],
  cultural:  ["unesco", "medieval", "renaissance", "baroque", "roman", "byzantine", "ottoman", "historic", "art", "ruins", "cathedral", "castle"],
  island:    ["island", "islands"],
  party:     ["nightlife", "party"],
  romantic:  ["romantic", "iconic"],
  food:      ["food", "wine"],
};

// Display labels (in chip order)
export const TRIP_KINDS = [
  { key: "city",      label: "City"      },
  { key: "beach",     label: "Beach"     },
  { key: "nature",    label: "Nature"    },
  { key: "mountains", label: "Mountains" },
  { key: "cultural",  label: "Cultural"  },
  { key: "island",    label: "Island"    },
  { key: "party",     label: "Nightlife" },
  { key: "food",      label: "Food/Wine" },
  { key: "romantic",  label: "Romantic"  },
];

/** True if a destination's categories include any tag mapped from any active kind. */
export function matchesAnyKind(destCategories, activeKinds) {
  if (!activeKinds || activeKinds.length === 0) return true;
  const wanted = new Set();
  for (const k of activeKinds) {
    for (const t of TRIP_KIND_MAP[k] || []) wanted.add(t);
  }
  return (destCategories || []).some((c) => wanted.has(c));
}

// Reverse lookup: category tag -> trip-kind key (built once from TRIP_KIND_MAP).
const TAG_TO_KIND = (() => {
  const m = {};
  for (const [kind, tags] of Object.entries(TRIP_KIND_MAP)) {
    for (const t of tags) m[t] = kind;
  }
  return m;
})();

/**
 * The trip-kinds a destination offers, as {key, label} in TRIP_KINDS order.
 * Same vocabulary the filter chips use, so what you filter on is what you see.
 */
export function kindsForDest(destCategories) {
  const present = new Set();
  for (const c of destCategories || []) {
    const kind = TAG_TO_KIND[c];
    if (kind) present.add(kind);
  }
  return TRIP_KINDS.filter((k) => present.has(k.key));
}
