/**
 * stripImageMeta.js, the metadata pass every uploaded photo goes through
 * before it leaves the traveller's device (T333, destinations spec 2.8).
 *
 * WHY. A phone photo carries the place it was taken (EXIF GPS), the camera's
 * serial number, the owner's name in some cameras, and a date to the second.
 * A photo taken from a holiday flat's balcony therefore publishes where
 * somebody sleeps. Stripping is on by default and cannot be switched off.
 *
 * HOW. This works on the bytes, not on a decoded picture, so it is exact and
 * testable in node: it walks the file's own structure and copies only the
 * parts that draw the image.
 *
 *   JPEG  keeps SOI, JFIF (APP0), the ICC colour profile (APP2 ICC_PROFILE),
 *         Adobe's colour transform flag (APP14), the tables, the frame, the
 *         scans and EOI. Drops EXIF and XMP (APP1), IPTC (APP13), every other
 *         APPn (MPF thumbnails, maker blocks), comments (COM) and anything
 *         after EOI (the trailers some phones append, which can hold a second
 *         full image with its own EXIF).
 *   PNG   keeps every chunk that draws, drops tEXt, zTXt, iTXt, eXIf and tIME,
 *         and anything after IEND.
 *
 * The upload form (community/uploads.js) also re-encodes the photo through a
 * canvas, which bakes in the orientation and caps the size, and then runs the
 * result through here again and refuses to send unless a second pass finds
 * nothing left to remove. A canvas never writes EXIF, so the second pass is a
 * check, not a hope.
 */

const fail = (code) => {
  const e = new Error(code);
  e.code = code;
  return e;
};

const ascii = (b, at, len) => {
  let s = '';
  for (let i = 0; i < len && at + i < b.length; i += 1) s += String.fromCharCode(b[at + i]);
  return s;
};

/** 'jpeg', 'png' or null, from the first bytes. */
export function sniffImage(bytes) {
  const b = bytes;
  if (!b || b.length < 8) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a) return 'png';
  return null;
}

/**
 * True when an EXIF block (the APP1 payload, starting at "Exif\0\0") has a
 * GPS sub-directory in its first directory. Read so the form can say plainly
 * "the place this photo was taken is removed" when that is what happened.
 * Bounds-checked throughout: a malformed block answers false, never throws.
 */
export function exifHasGps(seg, payloadAt) {
  const t = payloadAt + 6; // after "Exif\0\0"
  if (t + 8 > seg.length) return false;
  const order = ascii(seg, t, 2);
  if (order !== 'II' && order !== 'MM') return false;
  const le = order === 'II';
  const u16 = (o) => (le ? seg[o] | (seg[o + 1] << 8) : (seg[o] << 8) | seg[o + 1]);
  const u32 = (o) => (le
    ? (seg[o] | (seg[o + 1] << 8) | (seg[o + 2] << 16)) + seg[o + 3] * 0x1000000
    : seg[o] * 0x1000000 + ((seg[o + 1] << 16) | (seg[o + 2] << 8) | seg[o + 3]));
  const ifd = t + u32(t + 4);
  if (ifd + 2 > seg.length) return false;
  const n = u16(ifd);
  for (let k = 0; k < n; k += 1) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > seg.length) return false;
    if (u16(e) === 0x8825) return true;
  }
  return false;
}

function nameApp(marker, seg) {
  // seg starts at the 0xFF of the marker; the payload starts 4 bytes in.
  const id = ascii(seg, 4, 29);
  if (marker === 0xe1) {
    if (id.startsWith('Exif\0')) return exifHasGps(seg, 4) ? 'exif-gps' : 'exif';
    if (id.startsWith('http://ns.adobe.com/xap')) return 'xmp';
    return 'app1';
  }
  if (marker === 0xed) return 'iptc';
  return `app${marker - 0xe0}`;
}

function keepApp(marker, seg) {
  const id = ascii(seg, 4, 12);
  if (marker === 0xe0) return id.startsWith('JFIF\0') || id.startsWith('JFXX\0');
  if (marker === 0xe2) return id.startsWith('ICC_PROFILE\0');
  if (marker === 0xee) return id.startsWith('Adobe');
  return false;
}

function concat(parts, total) {
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** JPEG without its metadata. Returns { bytes, removed: [name, ...] }. */
export function stripJpeg(bytes) {
  const b = bytes;
  const n = b.length;
  if (sniffImage(b) !== 'jpeg') throw fail('corrupt');
  const parts = [b.subarray(0, 2)];
  let total = 2;
  const removed = [];
  let i = 2;
  let ended = false;
  while (i < n) {
    if (b[i] !== 0xff) throw fail('corrupt');
    while (i + 1 < n && b[i + 1] === 0xff) i += 1; // fill bytes
    if (i + 1 >= n) throw fail('corrupt');
    const m = b[i + 1];
    if (m === 0xd9) {
      parts.push(b.subarray(i, i + 2));
      total += 2;
      if (i + 2 < n) removed.push('trailer');
      ended = true;
      break;
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
      parts.push(b.subarray(i, i + 2));
      total += 2;
      i += 2;
      continue;
    }
    if (i + 3 >= n) throw fail('corrupt');
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > n) throw fail('corrupt');
    const seg = b.subarray(i, i + 2 + len);
    let keep = true;
    if (m >= 0xe0 && m <= 0xef) {
      keep = keepApp(m, seg);
      if (!keep) removed.push(nameApp(m, seg));
    } else if (m === 0xfe) {
      keep = false;
      removed.push('comment');
    }
    if (keep) { parts.push(seg); total += seg.length; }
    i += 2 + len;
    if (m === 0xda) {
      // Entropy-coded scan data runs to the next marker that is not a
      // stuffed 0xFF00 or a restart marker.
      let j = i;
      while (j < n) {
        if (b[j] === 0xff && j + 1 < n) {
          const nb = b[j + 1];
          if (nb === 0x00 || (nb >= 0xd0 && nb <= 0xd7)) { j += 2; continue; }
          if (nb === 0xff) { j += 1; continue; }
          break;
        }
        j += 1;
      }
      if (j >= n) throw fail('corrupt');
      parts.push(b.subarray(i, j));
      total += j - i;
      i = j;
    }
  }
  if (!ended) throw fail('corrupt');
  return { bytes: concat(parts, total), removed };
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

/** PNG without its text, EXIF and time chunks. Returns { bytes, removed }. */
export function stripPng(bytes) {
  const b = bytes;
  const n = b.length;
  if (sniffImage(b) !== 'png') throw fail('corrupt');
  const parts = [b.subarray(0, 8)];
  let total = 8;
  const removed = [];
  let i = 8;
  let ended = false;
  while (i + 12 <= n) {
    const len = b[i] * 0x1000000 + ((b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > n) throw fail('corrupt');
    if (PNG_DROP.has(type)) {
      removed.push(type === 'eXIf' ? 'exif' : type.toLowerCase());
    } else {
      parts.push(b.subarray(i, end));
      total += end - i;
    }
    i = end;
    if (type === 'IEND') {
      ended = true;
      if (i < n) removed.push('trailer');
      break;
    }
  }
  if (!ended) throw fail('corrupt');
  return { bytes: concat(parts, total), removed };
}

/**
 * Any supported image without its metadata: { bytes, type, removed }.
 * Throws an Error with code 'unsupported' for a format it cannot walk, and
 * 'corrupt' for a file whose structure does not hold together. Never returns
 * the input unchanged when it could not read it: a file this cannot vouch
 * for is not sent.
 */
export function stripImageMetadata(bytes) {
  const type = sniffImage(bytes);
  if (type === 'jpeg') return { type, ...stripJpeg(bytes) };
  if (type === 'png') return { type, ...stripPng(bytes) };
  throw fail('unsupported');
}

/** True when a second pass would find nothing to remove. */
export function isMetadataFree(bytes) {
  try {
    return stripImageMetadata(bytes).removed.length === 0;
  } catch {
    return false;
  }
}
