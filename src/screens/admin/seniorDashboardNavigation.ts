import type { SeniorPopulationFilter } from './seniorDashboardModel';

export type SeniorDashboardNavigationState = {
  internalStripScrollLeft: number;
  populationFilter: SeniorPopulationFilter;
  windowScrollY: number;
};

const STORAGE_KEY = 'journal-bord:senior-dashboard-navigation:v3';
const LEGACY_STORAGE_KEY_PREFIX =
  'journal-bord:senior-dashboard-navigation:v2:';
const FALLBACK_NAVIGATION_STATE: SeniorDashboardNavigationState = {
  internalStripScrollLeft: 0,
  populationFilter: 'all',
  windowScrollY: 0,
};

function removeLegacyNavigationState(seniorId: string) {
  try {
    window.sessionStorage.removeItem(`${LEGACY_STORAGE_KEY_PREFIX}${seniorId}`);
  } catch {
    // A blocked sessionStorage must not prevent dashboard navigation.
  }
}

function isPopulationFilter(value: unknown): value is SeniorPopulationFilter {
  return value === 'recent' || value === 'mine' || value === 'all';
}

function readNavigationState(): SeniorDashboardNavigationState {
  if (typeof window === 'undefined') {
    return FALLBACK_NAVIGATION_STATE;
  }

  try {
    const rawValue = window.sessionStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return FALLBACK_NAVIGATION_STATE;
    }

    const stored = JSON.parse(rawValue) as Partial<SeniorDashboardNavigationState>;

    return {
      internalStripScrollLeft: Math.max(
        0,
        Number(stored.internalStripScrollLeft) || 0
      ),
      populationFilter: isPopulationFilter(stored.populationFilter)
        ? stored.populationFilter
        : FALLBACK_NAVIGATION_STATE.populationFilter,
      windowScrollY: Math.max(0, Number(stored.windowScrollY) || 0),
    };
  } catch {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore cleanup failures and continue with safe defaults.
    }
    return FALLBACK_NAVIGATION_STATE;
  }
}

export function loadSeniorDashboardNavigationState(
  seniorId: string
): SeniorDashboardNavigationState {
  if (typeof window !== 'undefined') {
    removeLegacyNavigationState(seniorId);
  }

  return readNavigationState();
}

export function saveSeniorDashboardNavigationState(
  state: Partial<SeniorDashboardNavigationState>
) {
  if (typeof window === 'undefined') {
    return;
  }

  const current = readNavigationState();
  const nextState: SeniorDashboardNavigationState = {
    internalStripScrollLeft: Math.max(
      0,
      Number(state.internalStripScrollLeft ?? current.internalStripScrollLeft) || 0
    ),
    populationFilter: isPopulationFilter(state.populationFilter)
      ? state.populationFilter
      : current.populationFilter,
    windowScrollY: Math.max(
      0,
      Number(state.windowScrollY ?? current.windowScrollY) || 0
    ),
  };

  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(nextState)
    );
  } catch {
    // Navigation persistence must never prevent the senior dashboard from working.
  }
}
