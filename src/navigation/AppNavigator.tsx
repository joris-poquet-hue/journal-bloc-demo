import { Suspense, lazy } from 'react';

import { BottomNavigation } from '../components/BottomNavigation';
import { useAppContext } from '../context/AppContext';
import { LoginScreen } from '../screens/LoginScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { useScrollResetOnChange } from '../utils/useScrollResetOnChange';

const AdminScreen = lazy(() =>
  import('../screens/AdminScreen').then((module) => ({
    default: module.AdminScreen,
  }))
);
const ChecklistScreen = lazy(() =>
  import('../screens/ChecklistScreen').then((module) => ({
    default: module.ChecklistScreen,
  }))
);
const InterventionFormScreen = lazy(() =>
  import('../screens/InterventionFormScreen').then((module) => ({
    default: module.InterventionFormScreen,
  }))
);
const NotebookScreen = lazy(() =>
  import('../screens/NotebookScreen').then((module) => ({
    default: module.NotebookScreen,
  }))
);
const PreBlockScreen = lazy(() =>
  import('../screens/PreBlockScreen').then((module) => ({
    default: module.PreBlockScreen,
  }))
);
const ProfileScreen = lazy(() =>
  import('../screens/ProfileScreen').then((module) => ({
    default: module.ProfileScreen,
  }))
);
const SurgeryHistoryScreen = lazy(() =>
  import('../screens/SurgeryHistoryScreen').then((module) => ({
    default: module.SurgeryHistoryScreen,
  }))
);
const SummaryScreen = lazy(() =>
  import('../screens/SummaryScreen').then((module) => ({
    default: module.SummaryScreen,
  }))
);
const TrophiesScreen = lazy(() =>
  import('../screens/BadgesScreen').then((module) => ({
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

    if (screen === 'checklist') {
      return <ChecklistScreen />;
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
      </div>
    );
  }

  return (
    <div className="app-shell app-shell--with-bottom-nav">
      {syncWarning}
      {renderedScreen}
      <BottomNavigation />
    </div>
  );
}
