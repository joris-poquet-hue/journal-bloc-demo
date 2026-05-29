import { AppProvider } from './context/AppContext';
import { AppNavigator } from './navigation/AppNavigator';

export default function App() {
  return (
    <AppProvider>
      <AppNavigator />
    </AppProvider>
  );
}
