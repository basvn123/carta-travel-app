// How many lines a rail card's name needs (G12 round 2, ExploreRails.jsx
// useNameLines), pure so a test can hold it.
/** Greedy line breaking as the browser does it: at spaces and after a
 *  hyphen; a word wider than the line breaks inside (overflow-wrap). */
export function nameLines(text, room, width) {
  let lines = 1;
  let cur = 0;
  const space = width(' ');
  for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
    word.split(/(?<=-)/).forEach((part, i) => {
      const w = width(part);
      const lead = cur > 0 && i === 0 ? space : 0;
      if (cur + lead + w <= room) { cur += lead + w; return; }
      if (cur > 0) lines += 1;
      lines += Math.max(0, Math.ceil(w / room) - 1);
      cur = w > room ? w - Math.floor(w / room) * room : w;
    });
  }
  return lines;
}
