# Journalist list (K10, T1131)

`journalist-list-template.csv` is a template of outlets and desks only. It holds **no personal contact details**. Filling in names and addresses is an owner step (register T1131-b), done by hand from each outlet's public masthead or contact page.

## Columns

| Column | Meaning |
|---|---|
| `outlet` | Publication or newsletter |
| `desk` | Section that would carry the story (verify it exists) |
| `country` | `BE` or `NL` |
| `why_they_would_care` | One line: the angle for that desk |
| `beat` | travel, tech, business, personal finance, consumer |
| `owner_fills_name` | Journalist name, filled by the owner |
| `owner_fills_contact` | Public editorial address, filled by the owner |
| `status` | `to_research`, `ready`, `sent`, `replied`, `declined` |
| `notes` | Free text, never private data |

## Selection rule

An outlet goes on the list only if it is Belgian or Dutch (the launch market), has a travel, personal finance or tech desk, and has published on budget travel, flight prices or travel apps in the last 12 months. Add a row only with a written angle in `why_they_would_care` that Carta can back with a figure (no superlatives). Target about 40 rows; this template starts with 13. UK outlets from ROADMAP K10 are a later pass.

## Privacy

Use only addresses outlets publish for editorial contact. Do not commit personal mobiles or private mail; keep the filled-in list outside the repo or in a private sheet (GDPR, see `docs/legal/ARTICLE30.md`).
