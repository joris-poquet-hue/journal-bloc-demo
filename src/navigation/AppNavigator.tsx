import { useAppContext } from '../context/AppContext';
import { AdminScreen } from '../screens/AdminScreen';
import { BadgesScreen } from '../screens/BadgesScreen';
import { ChecklistScreen } from '../screens/ChecklistScreen';
import { InterventionFormScreen } from '../screens/InterventionFormScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { ObstetricJournalScreen } from '../screens/ObstetricJournalScreen';
import { ObstetricPortalScreen } from '../screens/ObstetricPortalScreen';
import { PortalSelectionScreen } from '../screens/PortalSelectionScreen';
import { PreBlockScreen } from '../screens/PreBlockScreen';
import { SurgeryHistoryScreen } from '../screens/SurgeryHistoryScreen';
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

  if (screen === 'portal-selection') {
    return <PortalSelectionScreen />;
  }

  if (screen === 'badges') {
    return <BadgesScreen />;
  }

  if (screen === 'surgery-history') {
    return <SurgeryHistoryScreen />;
  }

  if (screen === 'obstetric-portal') {
    return <ObstetricPortalScreen />;
  }

  if (screen === 'obstetric-journal') {
    return <ObstetricJournalScreen />;
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
