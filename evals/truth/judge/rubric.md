# Truth set text check: rubric 1 (T1144, ROADMAP D4)

Judge one short text that Carta shows a traveller against the source it cites. Use the source only: your own knowledge of the place does not count, and a claim the source does not state is not supported even when it is true.

Steps:

1. Split the text into its claims: each fact, number, name or judgement that a reader could check (for example "covers 13.2 km", "a waymarked route", "Venetian harbour", "the prettiest old town").
2. For each claim, look for it in the source. For a trail the source is a set of facts from OpenStreetMap and Carta's measured numbers; a number matches when it is within 0.1 km or 5 m of the source figure. For a place the source is the cited Wikivoyage text.
3. Mark each claim:
   - supported: the source states it or directly implies it
   - unsupported: the source does not say it, and nothing in the source conflicts with it
   - contradicted: the source says something that conflicts with it (another number, another place, the opposite)
4. The verdict of the whole text: contradicted if any claim is contradicted; else unsupported if any claim that a traveller would rely on (a number, a name, a fact about the place) is unsupported; else supported. A mild adjective of taste ("charming", "lovely") is not a claim a traveller relies on.

Answer in JSON only, in this shape, with the evidence quoted word for word from the source (empty when there is none):

{"verdict": "supported" | "unsupported" | "contradicted", "claims": [{"claim": "...", "verdict": "supported" | "unsupported" | "contradicted", "evidence": "..."}], "reason": "one sentence"}

Do not reward length or style. Judge every text on its own, in the order given.
