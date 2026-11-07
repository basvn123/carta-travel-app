import sys,re
p=sys.argv[1]; s=open(p).read()
pat=re.compile(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n',re.S)
def r(m):
    a,b=m.group(1),m.group(2)
    out=a
    for line in b.splitlines(True):
        if line not in a: out+=line
    return out
s2=pat.sub(r,s); open(p,'w').write(s2); print(p, 'left' if '<<<<<<<' in s2 else 'clean')
