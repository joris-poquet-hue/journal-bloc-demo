import { BottomNavigation } from '../components/BottomNavigation';
import { useAppContext } from '../context/AppContext';
import { AdminScreen } from '../screens/AdminScreen';
import { BadgesScreen } from '../screens/BadgesScreen';
import { ChecklistScreen } from '../screens/ChecklistScreen';
import { InterventionFormScreen } from '../screens/InterventionFormScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { NotebookScreen } from '../screens/NotebookScreen';
import { PreBlockScreen } from '../screens/PreBlockScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SurgeryHistoryScreen } from '../screens/SurgeryHistoryScreen';
import { SummaryScreen } from '../screens/SummaryScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';

export function AppNavigator() {
  const { isAuthenticated, screen, sessionRole } = useAppContext();

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (screen === 'admin') {
    return <AdminScreen />;
  }

  const currentScreen = (() => {
    if (screen === 'badges') {
      return <BadgesScreen />;
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

  if (sessionRole !== 'internal') {
    return currentScreen;
  }

  return (
    <div className="app-shell app-shell--with-bottom-nav">
      {currentScreen}
      <BottomNavigation />
    </div>
  );
}
