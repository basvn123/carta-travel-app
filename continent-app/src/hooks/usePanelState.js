import { useState } from 'react';

/**
 * Visibility state for the app's panels and modals: the compare tray, the
 * sign-in modal (and its mode), the account and saved-trips panels, and the
 * lifestyle editor. These are pure UI toggles with no effects, grouped so App's
 * top-level state reads as concerns rather than a flat wall of booleans.
 */
export function usePanelState() {
  const [compareOpen, setCompareOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('signin');
  const [accountOpen, setAccountOpen] = useState(false);
  const [savedTripsOpen, setSavedTripsOpen] = useState(false);
  const [lifestyleOpen, setLifestyleOpen] = useState(false);
  return {
    compareOpen, setCompareOpen,
    authModalOpen, setAuthModalOpen,
    authModalMode, setAuthModalMode,
    accountOpen, setAccountOpen,
    savedTripsOpen, setSavedTripsOpen,
    lifestyleOpen, setLifestyleOpen,
  };
}
