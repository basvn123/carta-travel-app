"""Fold a finished phase's task reports into one Execution/P{n}/_DIGEST.md (T1034).

usage: python -I scripts/execution_digest.py Execution <archive tag> P15 [P16 ...]
Tag the commit first (git tag archive/<name>) so each entry's `git show` works.
Prints FOLDED <path> per report; git rm those, keep _OPEN-*.md beside the digest.
"""
import re, sys
from pathlib import Path

ROOT = Path(sys.argv[1])
TAG = sys.argv[2]
PHASES = sys.argv[3:]
HEAD = re.compile(r'^(#{1,4})\s+(.*)$')
DATE = re.compile(r'20\d\d-\d\d-\d\d')
TASK = re.compile(r'\bT\d{3,4}\b')


def clean(text):
    text = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', text)          # images
    text = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', text)      # links -> label
    text = re.sub(r'\s+', ' ', text).strip()
    return text.replace('—', ',').replace('–', '-')  # no em dashes


def cap(text, n):
    if len(text) <= n:
        return text
    cut = text[:n]
    stop = cut.rfind('. ')
    return (cut[:stop + 1] if stop > n * 0.5 else cut.rstrip() + '...')


def sections(lines):
    """Yield (heading, level, body_lines) for each heading block."""
    cur, lvl, body = None, 0, []
    for ln in lines:
        m = HEAD.match(ln)
        if m:
            if cur is not None:
                yield cur, lvl, body
            cur, lvl, body = m.group(2).strip(), len(m.group(1)), []
        else:
            body.append(ln)
    if cur is not None:
        yield cur, lvl, body


def broke_rows(body):
    rows = []
    for ln in body:
        if ln.startswith('|') and not re.match(r'^\|\s*-', ln) and 'Cause' not in ln:
            cells = [clean(c) for c in ln.strip().strip('|').split('|')]
            cells = [c for c in cells if c]
            if cells:
                rows.append(' / '.join(cells))
    if not rows:
        txt = clean(' '.join(body))
        return [] if re.match(r'^(no issues|none|nothing)', txt, re.I) or not txt else [txt]
    return rows


def digest_one(path):
    lines = path.read_text(encoding='utf-8', errors='replace').splitlines()
    title = next((HEAD.match(l).group(2) for l in lines if HEAD.match(l)), path.stem)
    date = ''
    for i, l in enumerate(lines):
        if re.match(r'^#+\s*Date', l):
            for nxt in lines[i + 1:i + 6]:
                m = DATE.search(nxt)
                if m:
                    date = m.group(0)
                    break
            break
    if not date:
        m = DATE.search('\n'.join(lines[:40]))
        date = m.group(0) if m else ''
    changed, broke, label = [], [], ''
    for head, lvl, body in sections(lines):
        if TASK.match(head) and not re.match(r'(?i)task id', head):
            label = TASK.match(head).group(0)
        h = head.lower()
        if h.startswith('what changed') or h == 'summary':
            txt = clean(' '.join(body))
            if txt:
                changed.append((label, txt))
        elif h.startswith('what broke'):
            for r in broke_rows(body):
                broke.append((label, r))
    out = [f'### {clean(title)}' + (f' ({date})' if date else '')]
    multi = len(changed) > 1
    per = 1000 // max(1, len(changed)) if multi else 700
    for lab, txt in changed:
        out.append((f'{lab}: ' if multi and lab else '') + cap(txt, max(per, 260)))
    if not changed:
        body = clean(' '.join(l for l in lines[1:] if not HEAD.match(l)))
        if body:
            out.append(cap(body, 600))
    if broke:
        out.append('Broke: ' + cap('; '.join((f'{l} ' if multi and l else '') + r for l, r in broke), 350))
    rel = path.relative_to(ROOT.parent).as_posix()
    out.append(f'Full: `git show {TAG}:"{rel}"`')
    return '\n\n'.join(out)


for ph in PHASES:
    d = ROOT / ph
    if not d.is_dir():
        continue
    files = sorted(p for p in d.rglob('*.md')
                   if not p.name.startswith('_OPEN') and p.name != '_DIGEST.md')
    if not files:
        continue
    keep = sorted(p.name for p in d.glob('_OPEN*.md'))
    parts = [f'# {ph} digest',
             f'{len(files)} task reports folded. Each entry keeps what changed '
             f'and what broke; the full report, commands, files and rollback are in git under the '
             f'tag `{TAG}` (command under each entry). Open items live in `Execution/_OPEN.md`.'
             + (f' Owner procedures kept beside this file: {", ".join(keep)}.' if keep else '')]
    for f in files:
        parts.append(digest_one(f))
        print('FOLDED ' + f.relative_to(ROOT.parent).as_posix())
    (d / '_DIGEST.md').write_text('\n\n'.join(parts) + '\n', encoding='utf-8', newline='\n')
