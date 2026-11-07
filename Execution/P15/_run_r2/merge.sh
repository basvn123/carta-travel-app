#!/bin/bash
# merge.sh <remote-branch> : merges origin/<b> into the current branch with row union on register and ROADMAP
D=/tmp/claude-0/-home-user-carta-travel-app/74433359-2b2b-5d09-87bb-ede55d4217b4/scratchpad
cd /home/user/carta-travel-app
b=$1
base=$(git merge-base HEAD origin/$b)
git merge --no-ff --no-edit origin/$b -m "Merge $b into $(git branch --show-current)" >/dev/null 2>&1
conf=$(git diff --name-only --diff-filter=U)
for f in $conf; do
  case $f in
    Execution/_OPEN.md|ROADMAP.md|Execution/_OPEN-CLOSED.md) python3 $D/union.py $f; git add $f;;
    docs/reference/*|docs/architecture/lineage.md) git checkout --ours $f; regen=1; git add $f;;
  esac
done
if [ -n "$regen" ]; then python3 -I scripts/docs/build_reference.py >/dev/null 2>&1; python3 -I scripts/docs/build_lineage.py >/dev/null 2>&1; git add docs/reference docs/architecture/lineage.md; fi
left=$(git diff --name-only --diff-filter=U)
if [ -n "$left" ]; then echo "CONFLICTS LEFT: $left"; exit 1; fi
if [ -f .git/MERGE_HEAD ]; then git commit -q -m "Merge $b into $(git branch --show-current)"; fi
# ROADMAP rows the branch changed: restore the branch's version of each row id
python3 - "$base" "origin/$b" <<'PY'
import subprocess, sys, re
base, br = sys.argv[1], sys.argv[2]
def rows(ref):
    t = subprocess.run(['git','show',f'{ref}:ROADMAP.md'],capture_output=True,text=True).stdout
    d={}
    for l in t.splitlines():
        m=re.match(r'^\| ([A-Z]{1,2}-?[A-Z]?\d+[a-z]?) \|', l)
        if m: d.setdefault(m.group(1), l)
    return d
b0, b1 = rows(base), rows(br)
changed = {k:v for k,v in b1.items() if b0.get(k)!=v}
pre = rows('HEAD^1') if subprocess.run(['git','rev-parse','-q','--verify','HEAD^2'],capture_output=True).returncode==0 else rows('HEAD')
both = [k for k in changed if pre.get(k) not in (b0.get(k), changed[k])]
for k in both: changed.pop(k)
if both: print('ROADMAP ROWS CHANGED ON BOTH SIDES, combine by hand:', both)
cur = open('ROADMAP.md').read().splitlines()
fixed=0; out=[]; seen=set()
for l in cur:
    m=re.match(r'^\| ([A-Z]{1,2}-?[A-Z]?\d+[a-z]?) \|', l)
    if m and m.group(1) in changed:
        k=m.group(1)
        if k in seen: fixed+=1; continue   # drop doubled row
        seen.add(k)
        if l!=changed[k]: fixed+=1
        out.append(changed[k]); continue
    out.append(l)
open('ROADMAP.md','w').write('\n'.join(out)+'\n')
print('roadmap rows changed by branch:', sorted(changed), 'restored/deduped:', fixed)
PY
# any ROADMAP row id now doubled: keep HEAD^1's copy (rows the branch changed were already restored above)
python3 - <<'PY'
import subprocess, re, collections
pat=re.compile(r'^\| ([A-Z]{1,2}-?[A-Z]?\d+[a-z]?) \|')
prev={}
for l in subprocess.run(['git','show','HEAD^1:ROADMAP.md'],capture_output=True,text=True).stdout.splitlines():
    m=pat.match(l)
    if m: prev.setdefault(m.group(1), l)
lines=open('ROADMAP.md').read().splitlines()
ids=[pat.match(l).group(1) if pat.match(l) else None for l in lines]
dup={k for k,c in collections.Counter(i for i in ids if i).items() if c>1}
out=[]; done=set()
for l,i in zip(lines,ids):
    if i in dup:
        if i in done: continue
        cands=[x for x,j in zip(lines,ids) if j==i]
        pick=next((x for x in cands if x==prev.get(i)), cands[0])
        out.append(pick); done.add(i); continue
    out.append(l)
if dup: open('ROADMAP.md','w').write('\n'.join(out)+'\n')
print('doubled roadmap ids fixed:', sorted(dup) if dup else 'none')
PY
# rows closed by a round 3 task (T1197 and up) that a merge brought back into _OPEN.md: remove them again
python3 - <<'PY'
import re
closed={}
for l in open('Execution/_OPEN-CLOSED.md'):
    m=re.match(r'^\| ([^|]+?) \|.*closed by T(\d+)', l)
    if m and int(m.group(2))>=1197: closed[m.group(1).strip()]=1
lines=open('Execution/_OPEN.md').read().split('\n')
keep=[l for l in lines if not (l.startswith('| ') and l.split('|')[1].strip() in closed)]
if len(keep)!=len(lines):
    open('Execution/_OPEN.md','w').write('\n'.join(keep)); print('removed reopened round 3 rows:', len(lines)-len(keep))
PY
# doubled register ids
python3 - <<'PY'
import collections
ids=[l.split('|')[1].strip() for l in open('Execution/_OPEN.md') if l.startswith('| ')]
d=[k for k,c in collections.Counter(ids).items() if c>1 and k not in ('ID',)]
print('doubled _OPEN ids:', d[:20] if d else 'none')
PY
git show origin/claude/relaxed-dirac-l8enoy:Execution/P15/_run50/check_closed.py > $D/check_closed.py 2>/dev/null; python3 $D/check_closed.py
if ! git diff --quiet; then git add -A ROADMAP.md Execution/_OPEN.md && git commit -q --amend --no-edit && echo "amended merge with roadmap fix"; fi
git log -1 --oneline
