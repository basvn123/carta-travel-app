# Show HN draft (not posted; posting is the owner's)

**Title:** Show HN: An open CC-BY dataset of 3,800 European destinations (crowding, climate, bathing water)

**Body:**

I am building Carta, a trip planner for Europe. While building it I put together a catalogue of about 3,800 places (airports and smaller towns) and noticed that the open parts are useful on their own, so I am releasing them under CC BY 4.0.

What is in: place identity and population (GeoNames), tourist nights per km2 and a crowding tier from Eurostat NUTS 3, the EEA bathing water class within 15 km, and monthly daytime highs and rainfall from NASA POWER normals. 39 columns, CSV and JSON.

What is not in, and why: our ratings, prices and rankings. They are built partly from OpenStreetMap (ODbL) and Wikipedia (CC BY-SA), so they cannot go out under CC BY. The build script checks every column against the licence of its source and fails if one is not open; the datasheet lists every field, source, licence and the known gaps.

Coordinates are rounded to about 1 km. Missing values are empty, never guessed.

Repo: <link, owner adds>. Feedback on fields people would want is welcome.

**Post only when:** the free part of Carta needs no signup, the repo is public, and the owner has checked the identity-field provenance (T1176-a).
