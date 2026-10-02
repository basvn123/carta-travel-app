/* Splits the free-text gatewayAirport into airport rows.
   The wire carries one string such as
     "TLS Toulouse-Blagnac, 2 h 30 to Vielha; BCN Barcelona El Prat 4 h"
   written by hand, so the shapes vary. This reads the two clean shapes
   ("CODE Name, transfer" and "Name (CODE), transfer"), joins any segment that
   starts with neither onto the row before it, and reports `complete: false`
   when something would not fit a row (a sentence, a second airport inside a
   row, a long transfer). The caller then shows the primary airport and keeps
   the whole original text behind the info button, so nothing is lost. */

const CODE_FIRST = /^([A-Z]{3})\b[,\s]*\s*(.*)$/;
const NAME_FIRST = /^(?:Fly\s+)?([^()]{2,40}?)\s*\(([A-Z]{3})\)\s*[,.]?\s*(.*)$/;
const MAX_DETAIL = 70;

function splitName(rest) {
  // The name runs to the first comma, " is ", or a space before a digit.
  const m = rest.match(/^(.*?)(?:,\s+|\s+(?=\d)|\s+is\s+|\s+has\s+|$)(.*)$/);
  return { name: (m ? m[1] : rest).trim(), detail: (m ? m[2] : '').trim() };
}

export function parseGateway(text) {
  const src = String(text || '').replace(/\*\*/g, '').trim();
  if (!src) return { rows: [], complete: false };
  const rows = [];
  let complete = true;
  for (const seg of src.split(/\s*;\s*/)) {
    if (!seg) continue;
    let row = null;
    const a = seg.match(CODE_FIRST);
    const b = !a && seg.match(NAME_FIRST);
    if (a) {
      const { name, detail } = splitName(a[2]);
      row = { code: a[1], name, detail };
    } else if (b) {
      row = { code: b[2], name: b[1].trim(), detail: b[3].trim().replace(/^(is|has)\s+/, '') };
    } else if (rows.length) {
      const last = rows[rows.length - 1];
      last.detail = `${last.detail}; ${seg}`.replace(/^;\s*/, '');
      continue;
    } else {
      complete = false;
      continue;
    }
    rows.push(row);
  }
  // A sentence break inside a row means prose, not a transfer time. Checked
  // after the loop, because continuation segments are joined onto the row.
  for (const row of rows) {
    if (/[.!?]\s+\S/.test(row.detail) || /\([A-Z]{3}\)/.test(row.detail)
        || row.detail.length > MAX_DETAIL || row.name.length > 40) complete = false;
  }
  if (!rows.length) complete = false;
  return { rows, complete };
}
