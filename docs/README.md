# Documentatie van Carta

Alle documentatie van Carta, per onderwerp. Wat er nog moet gebeuren staat niet hier maar in `Next steps carta/`: `1-manual-steps.md` (jouw stappen), `2-to-do.md` (Claude) en `3-waves.md` (alles wat gedaan is).

## In de root van de repo

| Bestand | Waarvoor |
|---|---|
| `README.md` | Technische opbouw van de repo en hoe de pipeline draait |
| `CLAUDE.md` | Werkregels voor elke Claude-sessie |
| `PRODUCT.md` | Voor wie Carta is, de toon en de toegankelijkheidsregels |
| `DESIGN.md` | De vaste designtokens, gelijk aan `:root` in `styles.css` |

## Overzicht

| Bestand | Waarvoor |
|---|---|
| [1.CARTA.md](1.CARTA.md) | Wat Carta is en waarom de cijfers te vertrouwen zijn: begin hier |

## Data en pipeline (`docs/`)

De technische naslag. Deze bestanden blijven bewust direct in `docs/`, omdat scripts `SCHEMA.md` en `REGIONS.md` op dit pad inlezen.

| Bestand | Waarvoor |
|---|---|
| [PIPELINE.md](PIPELINE.md) | Wat `run_pipeline.py` echt doet, taak per taak |
| [SCHEMA.md](SCHEMA.md) | Het datacontract van `app_data` en de wire (CI leest dit) |
| [ESTIMATION.md](ESTIMATION.md) | Het schattingsmodel en de data-architectuur |
| [COVERAGE.md](COVERAGE.md) | Dekking en eerlijkheid tussen grote en kleine plaatsen |
| [2.SIGNIFICANCE.md](2.SIGNIFICANCE.md) | Hoe Carta bepaalt wat de moeite waard is (POI-scores) |
| [PHOTOS.md](PHOTOS.md) | De foto-engine: bronnen, rangorde, credits |
| [JOINS.md](JOINS.md) | Hoe de lagen aan elkaar gekoppeld worden |
| [REGIONS.md](REGIONS.md) | De regiolaag (een script controleert dit) |
| [BEACHES.md](BEACHES.md) | De strandenlaag |
| [LAKES.md](LAKES.md) | De merenlaag |
| [MOUNTAINS.md](MOUNTAINS.md) | De bergenlaag |
| [TRAILS.md](TRAILS.md) | De wandellaag |
| [TRAILS_DATA_QUALITY.md](TRAILS_DATA_QUALITY.md) | Het vaste kwaliteitscontract voor wandelroutes |
| [ROUTES.md](ROUTES.md) | De routelaag (wandelen en fietsen), stappen R0 tot R8 |
| [CYCLING.md](CYCLING.md) | De fietslaag |
| [trips_layer.md](trips_layer.md) | De trippenlaag |

## Product en ontwerp (`docs/product/`, `docs/design-v6/`)

| Bestand | Waarvoor |
|---|---|
| [product/FIRST_RUN_RESULT.md](product/FIRST_RUN_RESULT.md) | Het eerste geprijsde resultaat dat een bezoeker ziet |
| [product/ONBOARDING_AND_EMPTY_STATES.md](product/ONBOARDING_AND_EMPTY_STATES.md) | De eerste negentig seconden en elk leeg scherm |
| [product/FEEDBACK-LOOP.md](product/FEEDBACK-LOOP.md) | Van "dit klopt niet" tot opgelost |
| [product/IMAGE_BRIEF.md](product/IMAGE_BRIEF.md) | Welke foto's Carta wil en waarom |
| [product/COMPONENT_ROLES.md](product/COMPONENT_ROLES.md) | Welke externe bibliotheek voor welk onderdeel |
| [design-v6/DIRECTION.md](design-v6/DIRECTION.md) | De ontwerprichting van de design waves V1 tot V6 |
| [design-v6/OWNERSHIP.md](design-v6/OWNERSHIP.md) | Welk scherm welke stijlbestanden bezit |
| `design-v6/briefs/`, `design-v6/plans/` | Per scherm de brief en de bouwplannen |

## Beheer (`docs/operations/`)

| Bestand | Waarvoor |
|---|---|
| [operations/BACKUP.md](operations/BACKUP.md) | Back-up en herstel van de live Supabase-database |
| [operations/INCIDENT_RUNBOOK.md](operations/INCIDENT_RUNBOOK.md) | Wat te doen als iets plat ligt |
| [operations/REFUND_SOP.md](operations/REFUND_SOP.md) | De procedure voor een terugbetaling |
| [operations/SUPPORT.md](operations/SUPPORT.md) | De supportmailbox en standaardantwoorden |

## Juridisch (`docs/legal/`, `docs/tos/`)

| Bestand | Waarvoor |
|---|---|
| [legal/ARTICLE30.md](legal/ARTICLE30.md) | Het verwerkingsregister (GDPR artikel 30) |
| [tos/data_licenses.md](tos/data_licenses.md) | Het licentieregister van elke databron |
| `tos/flix_outreach.md`, `tos/omio_outreach.md` | Concepten voor partnercontact |

## Lancering (`docs/launch/`)

| Bestand | Waarvoor |
|---|---|
| [launch/SEO.md](launch/SEO.md) | Het plan voor vindbaarheid in zoekmachines |
| [launch/LAUNCH-METRICS.md](launch/LAUNCH-METRICS.md) | De lanceercijfers en waar je elk cijfer leest |
| [launch/LAUNCH-OUTREACH-DRAFTS.md](launch/LAUNCH-OUTREACH-DRAFTS.md) | Concepten voor lanceerberichten |
| [launch/GTM-ACQUISITION-CONSTRAINT.md](launch/GTM-ACQUISITION-CONSTRAINT.md) | De groeibeperking: hoe Carta gebruikers vindt |

## Archief (`docs/archive/`)

Afgeronde plannen en promptpakketten. Ze blijven bewaard omdat code-commentaar en oude rapporten ernaar verwijzen (bijvoorbeeld "PLAN.md B1"), maar er wordt niet meer aan gewerkt.

| Bestand | Wat het was |
|---|---|
| [archive/PLAN.md](archive/PLAN.md) | Het plan voor de Explore-herbouw en rating_v4 (fases A tot E) |
| [archive/CHANGELOG-explore-v4.md](archive/CHANGELOG-explore-v4.md) | Werklog van die herbouw |
| [archive/CARTA_TRAILS_BUILD_BRIEF.md](archive/CARTA_TRAILS_BUILD_BRIEF.md) | De bouwbrief voor de wandellaag |
| [archive/CARTA_CLAUDE_CODE_PROMPTS.md](archive/CARTA_CLAUDE_CODE_PROMPTS.md) | Een oud promptpakket voor Claude Code |
| [archive/PRODUCT_ROADMAP.md](archive/PRODUCT_ROADMAP.md) | De roadmap van september, vervangen door `Next steps carta/` |
| [archive/CATEGORY_UI_PLAN.md](archive/CATEGORY_UI_PLAN.md) | Plan voor de categorieschermen |
| [archive/CYCLING_RESUME.md](archive/CYCLING_RESUME.md) | Overdracht van de fietslaag |
| [archive/PRICEMAP_CHUNKS.md](archive/PRICEMAP_CHUNKS.md) | De prompts voor de uitbreiding van de prijskaart |
| [archive/QUALITY_UPGRADE_PLAN.md](archive/QUALITY_UPGRADE_PLAN.md) | Het kwaliteitsplan met open data van augustus |
| [archive/SHARING_FRIENDS_PLAN.md](archive/SHARING_FRIENDS_PLAN.md) | Onderzoek naar delen en vrienden |
| [archive/SHARING_FRIENDS_BUILD.md](archive/SHARING_FRIENDS_BUILD.md) | Het bouwplan voor delen en vrienden |
| [archive/TRAILS_EXPANSION_PLAN.md](archive/TRAILS_EXPANSION_PLAN.md) | Het uitbreidingsplan voor wandelroutes |
| [archive/trails-daytrips-setup-prompts.md](archive/trails-daytrips-setup-prompts.md) | Opstartprompts voor wandelen en dagtrips |
| [archive/HANDOFF_LLM_RUNS.md](archive/HANDOFF_LLM_RUNS.md) | Overdracht van twee Gemini-runs (afgerond op 2026-09-16) |

## Verplaatst op 2026-10-13

Oude rapporten noemen nog de oude paden. Zo vind je ze terug:

| Oud pad | Nieuw pad |
|---|---|
| `PLAN.md`, `CARTA_CLAUDE_CODE_PROMPTS.md`, `CARTA_TRAILS_BUILD_BRIEF.md`, `CHANGELOG-explore-v4.md` | `docs/archive/` |
| `ROUTES.md` | `docs/ROUTES.md` |
| `1.CARTA.md` (oude kopie) | `docs/1.CARTA.md` |
| `docs/FIRST_RUN_RESULT.md`, `ONBOARDING_AND_EMPTY_STATES.md`, `FEEDBACK-LOOP.md`, `IMAGE_BRIEF.md`, `COMPONENT_ROLES.md` | `docs/product/` |
| `docs/BACKUP.md`, `INCIDENT_RUNBOOK.md`, `REFUND_SOP.md`, `SUPPORT.md` | `docs/operations/` |
| `docs/ARTICLE30.md` | `docs/legal/` |
| `docs/SEO.md`, `LAUNCH-METRICS.md`, `LAUNCH-OUTREACH-DRAFTS.md`, `GTM-ACQUISITION-CONSTRAINT.md` | `docs/launch/` |
| De andere plannen uit `docs/` | `docs/archive/` |
| `PARALLEL-WAVES-PLAN.md`, `Execution/_WAVES.md`, `_OWNER-RUNBOOK.md`, `_OPEN-MASTER.md`, `P2/P3/P9 _OPEN-*.md` | Verwijderd, vervangen door `Next steps carta/` (oude versies in de git-geschiedenis) |
