# Execution

De werkadministratie van Carta. Hier staan huidige bestanden en geschiedenis door elkaar, dus kijk eerst in deze tabel.

| Wat | Soort | Waarvoor |
|---|---|---|
| `_OPEN.md` | Huidig | Het register: één rij per open punt, met eigenaar en status. Rijen worden gesloten, nooit gewist |
| `_ORDER.md` | Huidig | De takenlijst T001 tot T251 in volgorde; de scripts in `_queue/` lezen dit |
| `_TEMPLATE.md` | Huidig | Het sjabloon voor elk taakrapport |
| `_queue/` | Huidig | De scripts die waves klaarzetten, prompts maken en branches mergen |
| `P0/` tot `P15/` | Geschiedenis | Eén rapport per uitgevoerde taak (`T001-...md`). Een rapport wordt nooit meer aangepast |

Wat nog moet gebeuren staat niet hier maar in `Next steps carta/`. Een leesbare samenvatting van alle rapporten staat in `Next steps carta/3-waves.md`.

Oude rapporten noemen soms bestanden die sindsdien verplaatst of verwijderd zijn (bijvoorbeeld `_WAVES.md`, `_OWNER-RUNBOOK.md` of `docs/SEO.md`). De tabel onderaan `docs/README.md` zegt waar ze nu staan.
