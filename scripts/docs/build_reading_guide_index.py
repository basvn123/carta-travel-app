"""Fill Appendix A and B of docs/reading-guide.md from git ls-files and check every link (T1084).

Run from anywhere: python -I scripts/docs/build_reading_guide_index.py
"""
import os, re, subprocess, collections, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(ROOT)
GUIDE = 'docs/reading-guide.md'
files = subprocess.run(['git', 'ls-files', '*.md'], capture_output=True, text=True, encoding='utf-8').stdout.split('\n')
files = [f for f in files if f and not f.startswith('continent-app/node_modules')]

def clean(t):
    t = t.replace('|', '/').replace(' — ', ', ').replace('—', ', ').replace(' – ', ' to ').replace('–', ' to ').replace(' · ', ', ').replace('·', ',')
    return t[:110]

def title(f):
    try:
        for line in open(f, encoding='utf-8', errors='replace'):
            line = line.strip()
            if line.startswith('#'):
                return clean(line.lstrip('#').strip())
            if line.startswith('name:'):
                return clean(line[5:].strip())
    except OSError:
        pass
    return ''

def link(f):
    rel = os.path.relpath(f, 'docs').replace(os.sep, '/')
    return f'[{f}]({urllib.parse.quote(rel)})'

def group(f):
    parts = f.split('/')
    if len(parts) == 1:
        return '(repository root)'
    if parts[0] in ('docs', 'Execution', 'data', 'Trips', 'supabase', 'tools', '.claude', 'archive') and len(parts) > 2:
        return '/'.join(parts[:2]) + '/'
    return parts[0] + '/'

def table(fs):
    out = []
    by = collections.OrderedDict()
    for f in sorted(fs, key=lambda x: (group(x), x.lower())):
        by.setdefault(group(f), []).append(f)
    for g, items in by.items():
        out.append(f'**{g}** ({len(items)})\n')
        out.append('| File | Title |\n|---|---|')
        for f in items:
            out.append(f'| {link(f)} | {title(f)} |')
        out.append('')
    return '\n'.join(out)

live = [f for f in files if not f.startswith('archive/')]
arch = [f for f in files if f.startswith('archive/')]
s = open(GUIDE, encoding='utf-8').read()
intro = (f'Generated on 2026-11-06 from `git ls-files`: {len(live)} files outside the archive, grouped by folder, '
         'each with its first heading. Task reports are named `T<number>-<slug>.md`; phase digests `_DIGEST.md`; '
         'owner procedures `_OPEN-<system>.md`. Regenerate with `python -I scripts/docs/build_reading_guide_index.py` when files move; it also checks that every link resolves.\n\n')
s = re.sub(r'<!-- INDEX:START -->.*?<!-- INDEX:END -->', lambda m: '<!-- INDEX:START -->\n' + intro + table(live) + '\n<!-- INDEX:END -->', s, flags=re.S)
s = re.sub(r'<!-- ARCHIVE:START -->.*?<!-- ARCHIVE:END -->', lambda m: '<!-- ARCHIVE:START -->\n' + f'{len(arch)} files.\n\n' + table(arch) + '\n<!-- ARCHIVE:END -->', s, flags=re.S)
open(GUIDE, 'w', encoding='utf-8').write(s)

# Link check: every relative link in the guide must resolve.
bad = []
for m in re.finditer(r'\]\(([^)#]+?)(#[^)]*)?\)', s):
    target = m.group(1)
    if target.startswith('http'):
        continue
    path = os.path.normpath(os.path.join('docs', urllib.parse.unquote(target)))
    if not os.path.exists(path):
        bad.append(target)
print('live', len(live), 'archive', len(arch), 'links checked', len(re.findall(r'\]\(', s)), 'broken', len(bad))
for b in bad[:20]:
    print('  BROKEN', b)
