"""The D23 text and fact judge (T1188, ROADMAP D23 and D4).

One judge for every text Carta shows that cites a source (place intros and
blurbs, trail summaries, trip text, Ask answers, translations), checked
claim by claim against that source with the registry prompt `judge-text`.

  core.py       items, the prompt, verdicts and verdict files
  backends.py   session (a Claude Code session judges from prompt files) and
                gemini (the pipeline gateway, feature "judge"); never the
                Claude API
  calibrate.py  Cohen's kappa, its bootstrap lower bound, Gwet's AC1 and the
                planted fault recall against the D4 labels, and the threshold
                rule of config.json
  __main__.py   the command line: python -I scripts/validation/judge.py --help

The validation runner's text layer is scripts/validation/layer_texts.py.
"""
