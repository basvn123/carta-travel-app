"""Four photographs should be four views, not four crops of one file.

Two passes, cheapest first:

  pHash    catches the same file re-hosted, resized, recompressed or
           watermark-cropped across Commons and Geograph. Perceptual, so
           a 500 px thumb and its 1280 px parent hash the same.
  cosine   CLIP embeddings catch what pHash cannot: the same viewpoint on
           a different day, the postcard angle everybody shoots. Runs only
           on the pHash survivors, on vectors the cache already holds.

The output is clusters. Selection (selection.py) keeps the top-scoring
representative per cluster, so a gallery is one photograph per view.

imagehash is used when installed; a numpy DCT fallback computes the same
64-bit hash when it is not, so the pipeline never grows a hard dependency
for eight lines of signal processing.

ASCII clean, no em dashes, per project convention.
"""

import io

# Hamming distance at or under this is "the same file". 6 of 64 bits is
# the usual re-encode tolerance; raising it starts merging genuinely
# different frames of the same shore.
PHASH_SAME = 6

# Cosine similarity at or above this is "the same view". Tuned wide of the
# obvious duplicates on purpose; the labelled set will narrow it if two
# honest views ever merge.
COSINE_SAME = 0.93


def phash(data):
    """64-bit perceptual hash of one image's bytes, or None."""
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data))
    except Exception:
        return None
    try:
        import imagehash
        return int(str(imagehash.phash(img)), 16)
    except ImportError:
        pass
    # The classic DCT pHash: 32x32 grayscale, top-left 8x8 of the DCT
    # (minus the DC term's dominance via median), one bit per cell.
    try:
        import numpy as np
        arr = np.asarray(img.convert("L").resize((32, 32)),
                         dtype="float64")
        # Orthonormal DCT-II via matrix multiply; scipy is not a dep.
        n = 32
        k = np.arange(n)
        basis = np.cos(np.pi * (2 * k[None, :] + 1) * k[:, None] / (2 * n))
        basis[0] /= np.sqrt(2)
        basis *= np.sqrt(2.0 / n)
        dct = basis @ arr @ basis.T
        low = dct[:8, :8].flatten()
        bits = low > np.median(low)
        return int("".join("1" if b else "0" for b in bits), 2)
    except Exception:
        return None


def hamming(a, b):
    return bin(a ^ b).count("1")


class _Union:
    def __init__(self, n):
        self.parent = list(range(n))

    def find(self, i):
        while self.parent[i] != i:
            self.parent[i] = self.parent[self.parent[i]]
            i = self.parent[i]
        return i

    def join(self, i, j):
        ri, rj = self.find(i), self.find(j)
        if ri != rj:
            self.parent[rj] = ri


def clusters(items, *, hash_of, embedding_of=None):
    """Group near-duplicates. Returns a list of lists of the ITEMS.

    `hash_of(item)` returns the stored pHash int or None; `embedding_of`
    the cached CLIP vector or None. An item with neither signal is its own
    cluster: an unmeasured file is not evidence of a duplicate
    (invariant 6). O(n^2) over one row's candidates, which is a few dozen
    files, not a corpus."""
    n = len(items)
    uf = _Union(n)
    hashes = [hash_of(item) for item in items]
    for i in range(n):
        if hashes[i] is None:
            continue
        for j in range(i + 1, n):
            if hashes[j] is None:
                continue
            if hamming(hashes[i], hashes[j]) <= PHASH_SAME:
                uf.join(i, j)
    if embedding_of is not None:
        vecs = [embedding_of(item) for item in items]
        for i in range(n):
            if vecs[i] is None:
                continue
            for j in range(i + 1, n):
                if vecs[j] is None or uf.find(i) == uf.find(j):
                    continue
                if float(vecs[i] @ vecs[j]) >= COSINE_SAME:
                    uf.join(i, j)
    grouped = {}
    for i, item in enumerate(items):
        grouped.setdefault(uf.find(i), []).append(item)
    return list(grouped.values())
