/**
 * The shared place linker as Ask's fallback reader (T1215, row T1153-d).
 *
 * Behind the place linking flag (lib/linking/flag.js): with it on, the
 * linker (lib/linking/linker.js) loads on demand and this returns a
 * function mention -> linkPlace result over the same catalogue, search
 * index and lexicon Ask reads. buildAskVocab keeps it on the vocabulary
 * (vocab.link), and parseIntent links the words its vocabulary left
 * unknown with it. With the flag off it returns null and loads nothing,
 * so the main bundle and Ask's reading are what they were.
 */
import React from 'react';
import { placeLinkingOn } from '../lib/linking/flag.js';

export function usePlaceLink({ open = true, index = null, lexicon = null, rows = null }) {
  const on = React.useMemo(() => placeLinkingOn(), []);
  const [mod, setMod] = React.useState(null);
  React.useEffect(() => {
    if (!on || !open || mod) return undefined;
    let live = true;
    import('../lib/linking/linker.js').then((m) => { if (live) setMod(m); }).catch(() => {});
    return () => { live = false; };
  }, [on, open, mod]);
  return React.useMemo(() => {
    if (!mod || !index) return null;
    const linker = mod.makeLinker({ destinations: rows?.length ? rows : null, searchIndex: index, lexicon: lexicon || null });
    // A question is a whole mention, never a word still being typed.
    return (mention) => mod.linkPlace(linker, mention, { whole: true });
  }, [mod, index, lexicon, rows]);
}
