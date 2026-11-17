"""Build the static TTF faces the PDF exports embed (G1, house style 2026-11).

jsPDF embeds TrueType only and cannot read woff2 or pick a variable axis, so
the print kit (`src/lib/pdfKit.js`) needs static instances of the two house
faces. They are made from the very woff2 files the screens load
(`src/assets/fonts/`), so print and screen are the same letters:

  Overpass 400, 600, 800   every word and figure
  Sofia Sans Extra Condensed 700   plate names and the wordmark slot

For each weight the latin and latin-ext subsets are instanced and merged into
one file (so Č, Š, ő, ł print instead of falling back), and the tabular
figures are frozen into the default digits (the PDF has no OpenType layout,
and every price column must line up as it does on screen).

Both faces are SIL OFL 1.1 without a Reserved Font Name, so instanced and
merged copies may keep their names; the licence texts ship beside them.

Run (needs `pip install fonttools brotli`), from continent-app/:
    python scripts/print-fonts/build_print_fonts.py
"""
from __future__ import annotations

import os
import shutil
import tempfile

from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(APP, 'src', 'assets', 'fonts')
OUT = os.path.join(APP, 'src', 'assets', 'print-fonts')

FACES = [
    ('Overpass', 'Overpass', 400, 'Regular'),
    ('Overpass', 'Overpass', 600, 'SemiBold'),
    ('Overpass', 'Overpass', 800, 'ExtraBold'),
    ('SofiaSansExtraCondensed', 'SofiaSansExtraCondensed', 700, 'Bold'),
]


def freeze_tnum(font: TTFont) -> None:
    """Point the cmap of each digit at its tabular glyph (GSUB 'tnum')."""
    if 'GSUB' not in font:
        return
    gsub = font['GSUB'].table
    mapping: dict[str, str] = {}
    for rec in gsub.FeatureList.FeatureRecord:
        if rec.FeatureTag != 'tnum':
            continue
        for idx in rec.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[idx]
            for sub in lookup.SubTable:
                if lookup.LookupType == 7:
                    sub = sub.ExtSubTable
                if hasattr(sub, 'mapping'):
                    mapping.update(sub.mapping)
    if not mapping:
        return
    for table in font['cmap'].tables:
        for code, name in list(table.cmap.items()):
            if name in mapping:
                table.cmap[code] = mapping[name]


def instance(path: str, wght: int, tmp: str) -> str:
    font = TTFont(path)
    axes = {a.axisTag: (a.minValue, a.maxValue) for a in font['fvar'].axes}
    lo, hi = axes['wght']
    inst = instantiateVariableFont(font, {'wght': max(lo, min(hi, wght))}, updateFontNames=False)
    freeze_tnum(inst)
    inst.flavor = None
    out = os.path.join(tmp, os.path.basename(path).replace('.woff2', f'-{wght}.ttf'))
    inst.save(out)
    return out


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for src_name, out_name, wght, style in FACES:
            parts = [instance(os.path.join(SRC, f'{src_name}-{sub}.woff2'), wght, tmp)
                     for sub in ('latin', 'latin-ext')]
            merged = Merger().merge(parts)
            # Merged fonts drop GSUB features they cannot reconcile; the
            # digits are already frozen, and print needs no other layout.
            for tag in ('GSUB', 'GPOS', 'GDEF', 'STAT', 'MVAR', 'HVAR'):
                if tag in merged:
                    del merged[tag]
            dest = os.path.join(OUT, f'{out_name}-{style}.ttf')
            merged.save(dest)
            print(f'{dest}  {os.path.getsize(dest) // 1024} KB')
        for lic in ('Overpass-OFL.txt', 'SofiaSansExtraCondensed-OFL.txt'):
            shutil.copy(os.path.join(SRC, lic), os.path.join(OUT, lic))


if __name__ == '__main__':
    main()
