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
