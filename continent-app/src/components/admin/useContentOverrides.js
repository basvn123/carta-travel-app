import { useCallback, useEffect, useState } from 'react';
import { adminListOverrides } from '../../auth/admin.js';

// The override list that src/admin/ContentSection.jsx renders.
export function useContentOverrides(unlocked) {
  const [overrides, setOverrides] = useState([]);

  const loadOverrides = useCallback(async () => {
    try {
      const res = await adminListOverrides(null);
      setOverrides(res.rows || []);
    } catch { setOverrides([]); }
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    loadOverrides();
  }, [unlocked, loadOverrides]);

  return { overrides, loadOverrides };
}
