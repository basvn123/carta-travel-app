# Carta open dataset

A CC BY 4.0 subset of Carta's destination catalogue for Europe: place identity, population, tourist crowding (Eurostat), bathing water classes (EEA) and monthly climate normals (NASA POWER). Every column comes from a source whose own licence allows redistribution with attribution; the full list, with sources, licences and known gaps, is in [DATASHEET.md](DATASHEET.md).

Carta's own ratings, prices and rankings are not included. They are built from OpenStreetMap, Wikipedia and other inputs under share-alike or non-open terms.

## Files

- `destinations.csv` and `destinations.json`: one row per destination (`meta` in the JSON repeats the field list and licences).
- `ATTRIBUTION.txt`: the credit lines to keep when you reuse the data.

## Build

```
python scripts/open_data/export_open_dataset.py            # writes scripts/open_data/out/
python scripts/open_data/export_open_dataset.py --check    # licence policy only
python scripts/open_data/export_open_dataset.py --datasheet  # regenerate DATASHEET.md
```

The build refuses to run if a field points to a source that is not open (derived sources count as their least open input). CI runs the check and `tests/test_open_dataset.py` on every push.

## Licence

CC BY 4.0. Credit "Carta" and the sources in `ATTRIBUTION.txt`.
