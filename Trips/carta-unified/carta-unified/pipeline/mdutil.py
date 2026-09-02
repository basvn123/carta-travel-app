"""Small markdown helpers shared by the four source parsers."""
from __future__ import annotations

import re


def split_frontmatter(text: str):
    """Return (frontmatter_string_or_None, body)."""
    if text.startswith("---"):
        m = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
        if m:
            return m.group(1), m.group(2)
    return None, text


def sections(body: str, level: int = 2):
    """Split markdown into [(heading_text, content), ...] at the given heading level."""
    marker = "#" * level
    pattern = re.compile(rf"^{marker} (?!#)(.+)$", re.M)
    out = []
    matches = list(pattern.finditer(body))
    for i, m in enumerate(matches):
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        out.append((m.group(1).strip(), body[start:end].strip()))
    return out


def find_section(body: str, *names, level: int = 2, prefix: bool = True):
    """Return the content of the first section whose heading matches any name."""
    for heading, content in sections(body, level):
        h = heading.strip().lower()
        for name in names:
            n = name.strip().lower()
            if h == n or (prefix and h.startswith(n)):
                return content
    return None


def blockquote_hook(body: str):
    m = re.search(r"^> (.+?)(?:\n\n|\n#|$)", body, re.M | re.S)
    if not m:
        return None
    return re.sub(r"\s*\n>\s*", " ", m.group(1)).strip()


def bullet_items(text: str):
    """Top-level '-'/'*'/'1.' list items, joining wrapped continuation lines."""
    if not text:
        return []
    items, current = [], None
    for line in text.split("\n"):
        if re.match(r"^\s*(?:[-*]|\d+\.)\s+", line):
            if current is not None:
                items.append(current.strip())
            current = re.sub(r"^\s*(?:[-*]|\d+\.)\s+", "", line)
        elif current is not None and line.strip() and not line.startswith("#"):
            current += " " + line.strip()
        elif current is not None and not line.strip():
            items.append(current.strip())
            current = None
    if current is not None:
        items.append(current.strip())
    return [i for i in items if i]


LABELLED = re.compile(r"^\*\*(.+?)[.:]?\*\*[:.]?\s*(.*)$", re.S)


def labelled_item(item: str):
    """'**Connectivity:** EU roaming...' -> ('Connectivity', 'EU roaming...')."""
    m = LABELLED.match(item.strip())
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return None, item.strip()


def markdown_table(text: str):
    """Parse the first 2-column markdown table into an ordered dict of key -> value."""
    out = {}
    if not text:
        return out
    for line in text.split("\n"):
        line = line.strip()
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) < 2:
            continue
        if set("".join(cells)) <= set("-: "):
            continue
        key = re.sub(r"\*\*", "", cells[0]).strip()
        val = " · ".join(c for c in cells[1:] if c).strip()
        if key and key.lower() not in ("field", "") and val:
            out[key] = val
    return out


def strip_bold(text: str):
    return re.sub(r"\*\*(.+?)\*\*", r"\1", text or "")
