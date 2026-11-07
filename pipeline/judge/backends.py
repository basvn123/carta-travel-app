"""The judge's two backends (T1188). Never the Claude API.

session   offline, in a Claude Code (or Cowork) session: write_prompts() puts
          one prompt file per item and a manifest in a folder; the session
          reads them and writes a verdicts file (core.verdicts_file shape,
          backend "session") by hand; read_session() checks it against the
          manifest. No model is called from code.
gemini    through the pipeline gateway (pipeline/ai_gateway.py), feature
          "judge": JSON against core.JUDGE_SCHEMA, the model chain and
          temperature from config.json `gemini`, `votes` calls per item and
          the majority verdict. Needs GEMINI_API_KEY.
"""
from __future__ import annotations

import json
import os

from .core import (
    JUDGE_SCHEMA,
    build_prompt,
    config,
    item_id,
    judge_prompt,
    load_json,
    majority,
    normalise_verdict,
    prompt_sha,
    read_verdicts,
    rel,
    verdicts_file,
    write_json,
)

MANIFEST = "manifest.json"


# ---- session ----

def write_prompts(items, out_dir, items_label=None, p=None):
    """One <text_id>.txt per item plus manifest.json (the ids, the prompt hash and
    where the verdicts file goes). Returns the manifest."""
    p = p or judge_prompt()
    os.makedirs(out_dir, exist_ok=True)
    ids = []
    for it in items:
        tid = item_id(it)
        with open(os.path.join(out_dir, f"{tid}.txt"), "w", encoding="utf-8", newline="\n") as fh:
            fh.write(build_prompt(it, p))
        ids.append(tid)
    man = {"prompt": p.id, "prompt_version": p.version, "prompt_sha": prompt_sha(p), "items": items_label,
           "ids": ids,
           "answer": "write one verdicts file: {schema, backend: \"session\", model, prompt, prompt_version, "
                     "prompt_sha (from this manifest), at, items, verdicts: {text_id: the JSON the prompt asks for}}"}
    with open(os.path.join(out_dir, MANIFEST), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(man, indent=1) + "\n")
    return man


def read_session(path, manifest=None, p=None):
    """A session verdicts file, checked: backend session, every manifest id answered
    with a usable verdict. Returns (verdicts, problems)."""
    v = read_verdicts(path, p)
    problems = []
    if v.get("backend") != "session":
        problems.append(f"backend is {v.get('backend')!r}, not 'session'")
    if v["stale"]:
        problems.append(f"made on prompt {v.get('prompt_sha')}, current is {v['current_sha']}")
    man = load_json(manifest) if isinstance(manifest, str) else manifest
    for tid in (man or {}).get("ids") or []:
        if not v["verdicts"].get(tid):
            problems.append(f"{tid}: no usable verdict")
    return v, problems


# ---- gemini ----

def ensure_feature(gateway_mod, cfg=None):
    """The gateway feature the judge calls, with batch timings like the other jobs.
    Added here while pipeline/ai_gateway.py has no `judge` entry (register row T1188-c)."""
    cfg = cfg or config()
    g = cfg.get("gemini") or {}
    name = g.get("feature", "judge")
    if name not in gateway_mod.FEATURES:
        gateway_mod.FEATURES[name] = {
            "provider": "gemini", "models": list(g.get("models") or gateway_mod.GEMINI_CHAIN),
            "budget_s": 600, "first_s": 120, "later_s": 120, "min_s": 10, "retry_429_s": 30,
            "min_interval_s": 6.5, "max_prompt_chars": 60_000, "max_output_chars": 60_000}
    return name


class GeminiJudge:
    """judge = GeminiJudge(); file = judge.run(items, "label")."""

    def __init__(self, cfg=None, env=None, opener=None, sleep=None, models=None, p=None):
        import ai_gateway  # pipeline/ is on sys.path (core.py)
        self.cfg = cfg or config()
        self.g = self.cfg.get("gemini") or {}
        self.p = p or judge_prompt()
        feature = ensure_feature(ai_gateway, self.cfg)
        self.refusal = ai_gateway.AIRefusal
        self.parse = ai_gateway.parse_model_json
        self.gw = ai_gateway.Gateway(feature, models=models, env=env, opener=opener, sleep=sleep)

    def judge(self, item):
        votes = []
        for _ in range(max(1, int(self.g.get("votes", 1)))):
            # Screen only the harvested text and source: the rubric itself names instructions.
            screen = [str(item.get("text") or ""), json.dumps(item.get("source"), ensure_ascii=False)]
            res = self.gw.call(build_prompt(item, self.p), json=True, schema=JUDGE_SCHEMA, screen=screen,
                               temperature=float(self.g.get("temperature", 1.0)), max_tokens=4096)
            votes.append(normalise_verdict(self.parse(res.text, loose=True)))
            self.model = res.model
        return majority(votes)

    def run(self, items, items_label=None):
        self.model = None
        out = {}
        for it in items:
            try:
                out[item_id(it)] = self.judge(it) or {"verdict": None, "reason": "unusable answer"}
            except self.refusal as e:
                out[item_id(it)] = {"verdict": None, "reason": f"{e.code}: {getattr(e, 'reason', '')}"[:160]}
        return verdicts_file("gemini", self.model or self.gw.model, out, items_label, self.p)


def save(verdicts, out_path):
    return rel(write_json(out_path, verdicts))
