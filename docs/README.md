# Documentatie van Carta

Alle documentatie van Carta, per onderwerp. Wat er nog moet gebeuren staat niet hier maar in `Next steps carta/`: `1-manual-steps.md` (jouw stappen), `2-to-do.md` (Claude) en `3-waves.md` (alles wat gedaan is).

## Huidig of geschiedenis

Eén regel: **huidig** is wat nu klopt en bijgewerkt wordt; **geschiedenis** is afgerond en verandert nooit meer. Twijfel je bij een bestand, kijk dan in deze tabel.

| Waar | Soort | Wat het is |
|---|---|---|
| `Next steps carta/1-manual-steps.md`, `2-to-do.md` | Huidig | Wat jij en Claude nog moeten doen |
| `Next steps carta/3-waves.md` | Geschiedenis, groeit aan | Elke uitgevoerde taak in twee zinnen; na elke wave komen er regels bij |
| `README.md`, `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md` (root) | Huidig | Opbouw, werkregels, product, designtokens |
| `docs/` en de mappen `product/`, `operations/`, `legal/`, `launch/`, `design-v6/`, `tos/` | Huidig | Hoe Carta nu werkt en wat nu geldt |
| `docs/history/` | Geschiedenis | Afgeronde plannen en oude versies; elk bestand begint met een banner |
| `Execution/_OPEN.md`, `_ORDER.md`, `_TEMPLATE.md`, `_queue/` | Huidig | Het register, de takenlijst, het rapportsjabloon en de scripts |
| `Execution/P0/` tot `Execution/P15/` | Geschiedenis | Het rapport van elke taak, nooit aangepast (zie `Execution/README.md`) |
| `additional docs/Carta/` | Huidig | Het masterplan: `Carta-Master-Plan.xmind` (de scripts lezen dit) en de businessplannen in `Plan/` |
| `archive/` | Geschiedenis | Oude code die vervangen is |
| `data/reports/`, `reports/` | Gegenereerd | Uitvoer van de pipeline; wordt overschreven bij een nieuwe run |

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

## Geschiedenis (`docs/history/`)

Afgeronde plannen en promptpakketten. Ze blijven bewaard omdat code-commentaar en oude rapporten ernaar verwijzen (bijvoorbeeld "PLAN.md B1"), maar er wordt niet meer aan gewerkt.

| Bestand | Wat het was |
|---|---|
| [history/PLAN.md](history/PLAN.md) | Het plan voor de Explore-herbouw en rating_v4 (fases A tot E) |
| [history/CHANGELOG-explore-v4.md](history/CHANGELOG-explore-v4.md) | Werklog van die herbouw |
| [history/CARTA_TRAILS_BUILD_BRIEF.md](history/CARTA_TRAILS_BUILD_BRIEF.md) | De bouwbrief voor de wandellaag |
| [history/CARTA_CLAUDE_CODE_PROMPTS.md](history/CARTA_CLAUDE_CODE_PROMPTS.md) | Een oud promptpakket voor Claude Code |
| [history/PRODUCT_ROADMAP.md](history/PRODUCT_ROADMAP.md) | De roadmap van september, vervangen door `Next steps carta/` |
| [history/CATEGORY_UI_PLAN.md](history/CATEGORY_UI_PLAN.md) | Plan voor de categorieschermen |
| [history/CYCLING_RESUME.md](history/CYCLING_RESUME.md) | Overdracht van de fietslaag |
| [history/PRICEMAP_CHUNKS.md](history/PRICEMAP_CHUNKS.md) | De prompts voor de uitbreiding van de prijskaart |
| [history/QUALITY_UPGRADE_PLAN.md](history/QUALITY_UPGRADE_PLAN.md) | Het kwaliteitsplan met open data van augustus |
| [history/SHARING_FRIENDS_PLAN.md](history/SHARING_FRIENDS_PLAN.md) | Onderzoek naar delen en vrienden |
| [history/SHARING_FRIENDS_BUILD.md](history/SHARING_FRIENDS_BUILD.md) | Het bouwplan voor delen en vrienden |
| [history/TRAILS_EXPANSION_PLAN.md](history/TRAILS_EXPANSION_PLAN.md) | Het uitbreidingsplan voor wandelroutes |
| [history/trails-daytrips-setup-prompts.md](history/trails-daytrips-setup-prompts.md) | Opstartprompts voor wandelen en dagtrips |
| [history/HANDOFF_LLM_RUNS.md](history/HANDOFF_LLM_RUNS.md) | Overdracht van twee Gemini-runs (afgerond op 2026-09-16) |
| [history/carta-destinations-enhancement-spec-v1.md](history/carta-destinations-enhancement-spec-v1.md) | Eerste versie van de Destinations-spec (versie 2 staat in `additional docs/Carta/Plan/Data Quality/`) |
| [history/LONG_LEAD_TRACKER.md](history/LONG_LEAD_TRACKER.md) | De oude tracker van langlopende contacten, nu in `1-manual-steps.md` |
| [history/TEMPLATE-v0.md](history/TEMPLATE-v0.md) | Het eerste rapportsjabloon, vervangen door `Execution/_TEMPLATE.md` |

## Verplaatst op 2026-10-13

Oude rapporten noemen nog de oude paden. Zo vind je ze terug:

| Oud pad | Nieuw pad |
|---|---|
| `PLAN.md`, `CARTA_CLAUDE_CODE_PROMPTS.md`, `CARTA_TRAILS_BUILD_BRIEF.md`, `CHANGELOG-explore-v4.md` | `docs/history/` |
| `ROUTES.md` | `docs/ROUTES.md` |
| `1.CARTA.md` (oude kopie) | `docs/1.CARTA.md` |
| `docs/FIRST_RUN_RESULT.md`, `ONBOARDING_AND_EMPTY_STATES.md`, `FEEDBACK-LOOP.md`, `IMAGE_BRIEF.md`, `COMPONENT_ROLES.md` | `docs/product/` |
| `docs/BACKUP.md`, `INCIDENT_RUNBOOK.md`, `REFUND_SOP.md`, `SUPPORT.md` | `docs/operations/` |
| `docs/ARTICLE30.md` | `docs/legal/` |
| `docs/SEO.md`, `LAUNCH-METRICS.md`, `LAUNCH-OUTREACH-DRAFTS.md`, `GTM-ACQUISITION-CONSTRAINT.md` | `docs/launch/` |
| De andere plannen uit `docs/` | `docs/history/` |
| `Claude outputs/` | Verwijderd: alles was een kopie uit `additional docs/Carta/`, behalve de eerste Destinations-spec (nu `docs/history/`) |
| `additional docs/Carta/Execution/_LONG_LEAD_TRACKER.md`, `_TEMPLATE.md` | `docs/history/LONG_LEAD_TRACKER.md`, `docs/history/TEMPLATE-v0.md` |
| `PARALLEL-WAVES-PLAN.md`, `Execution/_WAVES.md`, `_OWNER-RUNBOOK.md`, `_OPEN-MASTER.md`, `P2/P3/P9 _OPEN-*.md` | Verwijderd, vervangen door `Next steps carta/` (oude versies in de git-geschiedenis) |
