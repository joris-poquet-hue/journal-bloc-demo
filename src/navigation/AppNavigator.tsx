import { BottomNavigation } from '../components/BottomNavigation';
import { useAppContext } from '../context/AppContext';
import { AdminScreen } from '../screens/AdminScreen';
import { ChecklistScreen } from '../screens/ChecklistScreen';
import { InterventionFormScreen } from '../screens/InterventionFormScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { NotebookScreen } from '../screens/NotebookScreen';
import { PreBlockScreen } from '../screens/PreBlockScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SurgeryHistoryScreen } from '../screens/SurgeryHistoryScreen';
import { SummaryScreen } from '../screens/SummaryScreen';
import { TrophiesScreen } from '../screens/BadgesScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { useScrollResetOnChange } from '../utils/useScrollResetOnChange';

export function AppNavigator() {
  const { isAuthenticated, persistentSyncWarning, screen, sessionRole } = useAppContext();
  useScrollResetOnChange([isAuthenticated, screen, sessionRole]);

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (screen === 'admin') {
    return <AdminScreen />;
  }

  const currentScreen = (() => {
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
  const syncWarning = persistentSyncWarning ? (
    <div className="app-shell__sync-warning auth-error" role="status">
      {persistentSyncWarning}
    </div>
  ) : null;

  if (sessionRole !== 'internal') {
    return (
      <div className="app-shell">
        {syncWarning}
        {currentScreen}
      </div>
    );
  }

  return (
    <div className="app-shell app-shell--with-bottom-nav">
      {syncWarning}
      {currentScreen}
      <BottomNavigation />
    </div>
  );
}
