import { useI18n } from '../../i18n/index.jsx';
import { AlertIcon } from '../Icons.jsx';

// A table the database is missing, named on screen rather than shown as a
// silent zero. It sits above every tab, the account view included, which
// is why the shell renders it rather than the overview.
export function MissingTables({ stats, health }) {
  const { t } = useI18n();
  const missing = (stats?.missing || []).concat(
    health?.tables
      ? Object.entries(health.tables).filter(([, present]) => !present).map(([k]) => k)
      : [],
  );
  const missingUnique = [...new Set(missing)];
  if (missingUnique.length === 0) return null;
  return (
    <div className="adminpage-warn" role="status">
      <AlertIcon size={15} />
      <span>{t('admin.missingTables', { tables: missingUnique.join(', ') })}</span>
    </div>
  );
}
