import ReactDOM from 'react-dom/client';

import App from './App';
import { startPrivacySafeObservability } from './observability';
import './styles.css';
import './notification-avatar.css';

type MonJdbWindow = Window & {
  __MONJDB_NATIVE_APP__?: boolean;
};

const nativeAppRequested =
  new URLSearchParams(window.location.search).get('native-app') === '1' ||
  Boolean((window as MonJdbWindow).__MONJDB_NATIVE_APP__);

document.documentElement.classList.toggle('monjdb-native-app', nativeAppRequested);
document.documentElement.classList.toggle('monjdb-web-app', !nativeAppRequested);

startPrivacySafeObservability();

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
