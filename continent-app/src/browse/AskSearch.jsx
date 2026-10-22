import React from 'react';
import { Button } from '../components/ui/index.js';
import { SparkIcon } from '../components/Icons.jsx';
import { AskBar } from './AskBar.jsx';
import '../styles/75-ask.css';

/**
 * Ask Carta's door (T558): the field-shaped trigger, in the first bundle;
 * the panel and everything behind it (the parser, ranking, retrieval, the
 * written answer) load on the first open from AskSearchFull.jsx and then
 * stay mounted, so a closed panel keeps its question and answer. Props are
 * AskSearchFull's. With `bar` (Explore, T568) the door is AskBar, a real
 * field: what is typed there is asked as soon as the panel has loaded.
 */
const AskSearchFull = React.lazy(() => import('./AskSearchFull.jsx'));

export function AskSearch(props) {
  const { t, mode = 'explore', inHeader = false, bar = false, places = [], requestOpen = false, askSeed = null } = props;
  const [wanted, setWanted] = React.useState(false);
  const [seed, setSeed] = React.useState(null);
  const placeholder = mode === 'plan' ? t('ask.placeholderPlan') : t('ask.placeholder');
  const door = bar ? (
    <AskBar t={t} places={places}
      onAsk={(q) => { if (q) setSeed({ text: q, n: Date.now() }); setWanted(true); }}
      onOpen={() => setWanted(true)} />
  ) : (
    <div className={`gsearch ask${inHeader ? ' is-header' : ''}${mode === 'plan' ? ' is-plan' : ''}`}>
      <Button variant="secondary" className="gsearch-trigger" iconStart={<SparkIcon size={18} />}
        onClick={() => setWanted(true)} aria-haspopup="dialog" aria-expanded={false}>
        <span className="gsearch-placeholder">{placeholder}</span>
      </Button>
    </div>
  );
  if (!wanted && !requestOpen && !askSeed) return door;
  return (
    <React.Suspense fallback={door}>
      <AskSearchFull {...props} askSeed={!seed || (askSeed && askSeed.n > seed.n) ? askSeed : seed}requestOpen={requestOpen || wanted === true} onOpenRequested={() => {
        if (wanted === true) setWanted('open');
        props.onOpenRequested?.();
      }} />
    </React.Suspense>
  );
}
