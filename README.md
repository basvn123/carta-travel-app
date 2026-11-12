# Carta

Carta plans a whole trip anywhere in Europe in one place: where to go, how the days run, and what each day costs. It prices a bed plus food and drink per person per day for every place it covers, adds trails, beaches, lakes, mountains, stays and flights, and plans the trip city by city and day by day.

This repo holds both halves:
- a Python data pipeline at the root (`run_pipeline.py`, `pipeline/`) that builds the data;
- the React app in `continent-app/` that travellers use.

## Find your way
- `docs/project-map.md`: every part, where it lives and how it connects. Start here.
- `docs/HANDBOOK.md`: how each feature works (rules, formulas, thresholds). Search it; it is long.
- `ROADMAP.md`: the plan to production.
- `PRODUCT.md` and `DESIGN.md`: who Carta is for, and the design language.
- `docs/decisions/`: why the project works the way it does.
- `docs/owner/`: steps only the owner can take.

## Run it
```
cd continent-app
npm ci
npm run dev        # syncs the data, then starts the dev server
npm test           # unit tests
```

Pipeline (Python 3.11):
```
python -m pip install -r requirements.txt -c constraints.txt
python run_pipeline.py --list
python run_pipeline.py <task>
```

More commands, the checks CI runs and the deploy steps are in `CLAUDE.md`.

## How work is done here
Claude Code sessions work through the crew workflow (`docs/decisions/0001-adopt-crew.md`). Each task leaves a report in `.work/<date>-<slug>/report.md` and a line in `.work/INDEX.md`.
