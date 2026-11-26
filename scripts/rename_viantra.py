"""One-off rename of the product name Carta to Viantra (ROADMAP K1, decision 0018).

Replaces the standalone word "Carta" (and German genitive "Cartas") in text files under the
given folders. Leaves alone: identifiers that contain Carta (openInCarta, useCartaDates, i18n keys),
lowercase carta (storage keys like carta.welcomeSeen, CSS classes, the domain carta-europetravel.com,
Italian "carta" = paper or map), and Italian "Carta d'identita" (ID card).
Keeps each file's bytes and line endings except for the replaced words.

  python scripts/rename_viantra.py --dry-run continent-app supabase services
  python scripts/rename_viantra.py continent-app supabase services
"""
import os
import re
import sys

WORD = re.compile(r"(?<![A-Za-z0-9_$])Carta(s?)(?![A-Za-z0-9_])(?!\s+d['’]identit)")
EXTS = {".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".html", ".css", ".md", ".toml", ".txt", ".svg", ".yml", ".yaml", ".sql"}
SKIP_DIRS = {"node_modules", "public", ".git", "dist", "dist-data", ".fastbuild", "viantra"}  # viantra = the brand kit, which names Carta on purpose


def files(root):
    for d, dirs, names in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
        for n in names:
            if os.path.splitext(n)[1] in EXTS:
                yield os.path.join(d, n)


def main():
    args = sys.argv[1:]
    dry = "--dry-run" in args
    roots = [a for a in args if not a.startswith("--")]
    total_files = total_hits = 0
    for root in roots:
        for path in files(root):
            raw = open(path, "rb").read()
            try:
                text = raw.decode("utf-8")
            except UnicodeDecodeError:
                continue
            new, n = WORD.subn(lambda m: "Viantra" + m.group(1), text)
            if n:
                total_files += 1
                total_hits += n
                if not dry:
                    open(path, "wb").write(new.encode("utf-8"))
    print(f"{'would change' if dry else 'changed'} {total_hits} words in {total_files} files")


if __name__ == "__main__":
    main()
