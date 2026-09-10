import { AppProvider } from './context/AppContext';
import { isLegalInformationPath } from './legalRoutes';
import { AppNavigator } from './navigation/AppNavigator';
import { LegalInformationScreen } from './screens/LegalInformationScreen';

export default function App() {
  if (isLegalInformationPath(window.location.pathname)) {
    return <LegalInformationScreen />;
  }

  return (
    <AppProvider>
      <AppNavigator />
    </AppProvider>
  );
}
