# Carta, Europe Travel App

Reads `public/app_data.json` and renders an interactive map of European
destinations priced two ways for the dates and lifestyle you pick:

1. **Flights**, the cheapest real Ryanair round-trip, plus optional baggage.
2. **On-the-ground**, your chosen lifestyle (dinners, lunches, drinks, coffees,
   self-catered days) priced at each destination's real local rates.

The map shows the full trip total; the detail panel breaks it down. Cost prices
come from Numbeo anchors + Eurostat PLI scaling (see notebook `03_costs`).

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

For a production build:

```bash
npm run build
npm run preview
```

## What the UI gives you

### Filter bar (top, two rows)

**Row 1, trip parameters** (these affect the price):
- Depart date and Return date (any pair in the data window)
- Nights (derived from the dates)
- People (group size)
- Baggage (free / 10 kg priority / 20 kg checked)
- Lifestyle, opens a panel with profile presets (Backpacker / Balanced / Foodie
  / Party) and frequency steppers: dinners, casual meals, fast food, bar drinks,
  club nights, coffees, self-catered days, each priced at real local rates

**Row 2, view filters** (these affect what's shown):
- **Show: Total / Per person**, flips every price display globally
- **Country dropdown**, filter to one country
- **Price range slider**, dual-handle, auto-rescales when toggling Total / Per person
- **Trip type**, opens the trip-type panel below
- **Reset**, clears all filters when active

**Trip-type panel** (click "Trip type"):
- Multi-select chips: City / Beach / Nature / Mountains / Cultural / Island /
  Nightlife / Food-Wine / Romantic. A destination matches if any of its category
  tags overlap any selected chip.

The stats on the right show "X of Y destinations · cheapest EUR N" and update live.

### Map

Each destination is a price pill on its lat/lon. Cheapest 25% are highlighted in
the rust accent ("deal"). Click any pill to open the detail panel.

### Detail panel (right side)

- Trip total: round-trip flight fare + baggage, then on-the-ground spend broken
  out by activity (dinners, lunches, drinks, coffees, groceries). Values switch
  between total and per-person based on the global toggle. "Adjust lifestyle"
  opens the lifestyle panel.
- **Verify the flight price**, opens Skyscanner for the chosen origin,
  destination, and dates so you can compare against other carriers. For gems, the
  panel notes the anchor airport you fly into and the ground transfer time.

## How it works under the hood

- **`public/app_data.json`**, the dataset. Drop in the real one from notebook 04
  when the pipeline finishes; for now there is a mock with 45 destinations across
  the May-Aug 2026 window. Run `python gen_mock_data.py` to regenerate the mock.
- **`src/runtime_pricing.js`**, `composeTrip()` looks up the cheapest fare for
  the dates, adds baggage, and adds the lifestyle ground spend from `dest.costs`.
  `buildFlightLinks()` produces the Skyscanner deeplink.
- **`src/LifestylePanel.jsx`**, the frequency steppers + live spend preview.
- **`src/MapView.jsx`**, MapLibre with Carto Voyager basemap (free, no API key).
- **`src/FilterBar.jsx`**, top filter strip with the dual-row layout.
- **`src/DetailPanel.jsx`**, right slide-in panel.
- **`src/styles.css`**, editorial/cartographic design. Fraunces serif, Inter
  Tight, JetBrains Mono.

See `../SCHEMA.md` for the full `app_data.json` contract.

## Swapping in real data

When notebook 04 finishes, copy `app_data/app_data.json` over
`public/app_data.json`. No code changes needed, both are schema v6.

## Accounts

Sign up, sign in, password reset, and saved trips/settings are backed by
Supabase (`src/auth/`, `src/lib/supabaseClient.js`). Without
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set (see `.env.example`),
the app runs guest-only and the account UI stays hidden. To enable it,
create a free Supabase project, run `../supabase/schema.sql` in its SQL
editor, and set the two env vars.

## What's not in this app

- No marker clustering (fine for ~45-450 destinations)
- No live booking, `buildFlightLinks` opens Skyscanner
- The Ryanair fare is what `ryanair-py` returns from Ryanair's price-calendar API.
  It is the same data Ryanair's own site shows, but lead time and cabin selection
  on the actual booking page may add a few euros (seat selection, payment fees).
