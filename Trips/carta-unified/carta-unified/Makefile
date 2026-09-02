PY ?= python3

.PHONY: all build validate gaps sql verify clean deps

all: build validate gaps sql verify

deps:
	$(PY) -m pip install --break-system-packages -q pyyaml geonamescache

build:
	$(PY) pipeline/build.py

validate:
	$(PY) pipeline/validate.py

gaps:
	$(PY) pipeline/gap_matrix.py

sql:
	$(PY) pipeline/export_sql.py

verify:
	$(PY) pipeline/verify_roundtrip.py

clean:
	rm -f data/trips.master.json data/trips.flat.csv
	rm -f data/trips/*.json
	rm -f reports/*.md reports/*.json
	rm -f supabase/migrations/*.sql
