import { useAppContext } from '../context/AppContext';
import { AdminScreen } from '../screens/AdminScreen';
import { BadgesScreen } from '../screens/BadgesScreen';
import { ChecklistScreen } from '../screens/ChecklistScreen';
import { InterventionFormScreen } from '../screens/InterventionFormScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { PreBlockScreen } from '../screens/PreBlockScreen';
import { SummaryScreen } from '../screens/SummaryScreen';
import { WelcomeScreen } from '../screens/WelcomeScreen';

export function AppNavigator() {
  const { isAuthenticated, screen } = useAppContext();

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  if (screen === 'admin') {
    return <AdminScreen />;
  }

  if (screen === 'badges') {
    return <BadgesScreen />;
  }

  if (screen === 'form') {
    return <InterventionFormScreen />;
  }

  if (screen === 'preblock') {
    return <PreBlockScreen />;
  }

  if (screen === 'checklist') {
    return <ChecklistScreen />;
  }

  if (screen === 'summary') {
    return <SummaryScreen />;
  }

  return <WelcomeScreen />;
}
