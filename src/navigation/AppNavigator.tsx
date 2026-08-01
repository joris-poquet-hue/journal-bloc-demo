import { Suspense, lazy } from 'react';

import { BottomNavigation } from '../components/BottomNavigation';
import { TrophyCelebration } from '../components/TrophyCelebration';
import { useAppContext } from '../context/AppContext';
import { LoginScreen } from '../screens/LoginScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { lazyImportWithReload } from '../utils/lazyImportWithReload';
import { useScrollResetOnChange } from '../utils/useScrollResetOnChange';

const AdminScreen = lazy(() =>
  lazyImportWithReload(() => import('../screens/AdminScreen')).then((module) => ({
    default: module.AdminScreen,
  }))
);
const ContextVariablesScreen = lazy(() =>
  lazyImportWithReload(() => import('../screens/ContextVariablesScreen')).then((module) => ({
    default: module.ContextVariablesScreen,
  }))
);
const InterventionFormScreen = lazy(() =>
  lazyImportWithReload(() => import('../screens/InterventionFormScreen')).then((module) => ({
    default: module.InterventionFormScreen,
  }))
);
const NotebookScreen = lazy(() =>
  lazyImportWithReload(() => import('../screens/NotebookScreen')).then((module) => ({
    default: module.NotebookScreen,
  }))
);
const PreBlockScreen = lazy(() =>
  lazyImportWithReload(() => import('../screens/PreBlockScreen')).then((module) => ({
    default: module.PreBlockScreen,
  }))
);
const ProfileScreen = lazy(() =>
  lazyImportWithReload(() => import('../screens/ProfileScreen')).then((module) => ({
    default: module.ProfileScreen,
  }))
);
const SurgeryHistoryScreen = lazy(() =>
  lazyImportWithReload(() => import('../screens/SurgeryHistoryScreen')).then((module) => ({
    default: module.SurgeryHistoryScreen,
  }))
);
const SummaryScreen = lazy(() =>
  lazyImportWithReload(() => import('../screens/SummaryScreen')).then((module) => ({
    default: module.SummaryScreen,
  }))
);
const TrophiesScreen = lazy(() =>
  lazyImportWithReload(() => import('../screens/TrophiesScreen')).then((module) => ({
    default: module.TrophiesScreen,
  }))
);

export function AppNavigator() {
  const { isAuthenticated, persistentSyncWarning, screen, sessionRole } = useAppContext();
  useScrollResetOnChange([isAuthenticated, screen, sessionRole]);

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  const currentScreen = (() => {
    if (screen === 'admin') {
      return <AdminScreen />;
    }

    if (screen === 'trophies') {
      return <TrophiesScreen />;
    }

    if (screen === 'surgery-history') {
      return <SurgeryHistoryScreen />;
    }

    if (screen === 'form') {
      return <InterventionFormScreen />;
    }

    if (screen === 'preblock') {
      return <PreBlockScreen />;
    }

    if (screen === 'profile') {
      return <ProfileScreen />;
    }

    if (screen === 'notebook') {
      return <NotebookScreen />;
    }

    if (screen === 'context-variables') {
      return <ContextVariablesScreen />;
    }

    if (screen === 'summary') {
      return <SummaryScreen />;
    }

    return <WelcomeScreen />;
  })();
  const renderedScreen = (
    <Suspense fallback={<div className="app-screen-loading">Chargement...</div>}>
      {currentScreen}
    </Suspense>
  );
  const syncWarning = persistentSyncWarning ? (
    <div className="app-shell__sync-warning auth-error" role="status">
      {persistentSyncWarning}
    </div>
  ) : null;

  if (sessionRole !== 'internal') {
    return (
      <div className="app-shell">
        {syncWarning}
        {renderedScreen}
        <TrophyCelebration />
      </div>
    );
  }

  return (
    <div className="app-shell app-shell--with-bottom-nav">
      {syncWarning}
      {renderedScreen}
      <BottomNavigation />
      <TrophyCelebration />
    </div>
  );
}
