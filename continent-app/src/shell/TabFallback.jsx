import { useI18n } from '../i18n/index.jsx';
import { LoadingBlock } from '../components/StateBlocks.jsx';

// A quiet placeholder while a lazy chunk downloads or the full catalogue
// arrives. It sits in the tab's own region, between the top bar and the
// bottom nav, so both stay usable while it shows (T381; carta-design
// "Loading"): it used to cover the whole window at z-index 100, which left no
// way to change tab until the chunk landed.
export function TabFallback() {
  const { t } = useI18n();
  return (
    <div className="tab-fallback">
      <LoadingBlock label={t('state.loading')} rows={3} shape="card" />
    </div>
  );
}
