import { BarChart3, BookOpen, Home, Plus, UserRound } from 'lucide-react';

import { useAppContext } from '../context/AppContext';
import { AppScreen } from '../types';

type NavItem = {
  label: string;
  isActive: (screen: AppScreen) => boolean;
  onPress: () => void;
};

export function BottomNavigation() {
  const {
    screen,
    goToSurgeryPortal,
    goToSurgeryHistory,
    goToPreBlock,
    goToProfile,
    startNewIntervention,
  } = useAppContext();

  const items: NavItem[] = [
    {
      label: 'Accueil',
      isActive: (currentScreen) => currentScreen === 'welcome',
      onPress: goToSurgeryPortal,
    },
    {
      label: 'Progression',
      isActive: (currentScreen) =>
        currentScreen === 'surgery-history' || currentScreen === 'trophies',
      onPress: () => goToSurgeryHistory(),
    },
    {
      label: 'Fiches',
      isActive: (currentScreen) => currentScreen === 'preblock',
      onPress: () => goToPreBlock('surgery'),
    },
    {
      label: 'Profil',
      isActive: (currentScreen) => currentScreen === 'profile',
      onPress: goToProfile,
    },
  ];

  const isAdding =
    screen === 'form' || screen === 'checklist' || screen === 'summary';

  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      <button
        aria-current={items[0].isActive(screen) ? 'page' : undefined}
        className={`bottom-nav__item ${
          items[0].isActive(screen) ? 'bottom-nav__item--active' : ''
        }`}
        onClick={items[0].onPress}
        type="button"
      >
        <Home aria-hidden="true" className="bottom-nav__icon" strokeWidth={2.1} />
        <span>Accueil</span>
      </button>

      <button
        aria-current={items[1].isActive(screen) ? 'page' : undefined}
        className={`bottom-nav__item ${
          items[1].isActive(screen) ? 'bottom-nav__item--active' : ''
        }`}
        onClick={items[1].onPress}
        type="button"
      >
        <BarChart3 aria-hidden="true" className="bottom-nav__icon" strokeWidth={2.1} />
        <span>Progression</span>
      </button>

      <button
        aria-current={isAdding ? 'page' : undefined}
        aria-label="Ajouter une intervention"
        className={`bottom-nav__add ${isAdding ? 'bottom-nav__add--active' : ''}`}
        onClick={startNewIntervention}
        type="button"
      >
        <span className="bottom-nav__add-circle">
          <Plus aria-hidden="true" strokeWidth={2.4} />
        </span>
        <span className="bottom-nav__add-label">Ajouter</span>
      </button>

      <button
        aria-current={items[2].isActive(screen) ? 'page' : undefined}
        className={`bottom-nav__item ${
          items[2].isActive(screen) ? 'bottom-nav__item--active' : ''
        }`}
        onClick={items[2].onPress}
        type="button"
      >
        <BookOpen aria-hidden="true" className="bottom-nav__icon" strokeWidth={2.1} />
        <span>Fiches</span>
      </button>

      <button
        aria-current={items[3].isActive(screen) ? 'page' : undefined}
        className={`bottom-nav__item ${
          items[3].isActive(screen) ? 'bottom-nav__item--active' : ''
        }`}
        onClick={items[3].onPress}
        type="button"
      >
        <UserRound aria-hidden="true" className="bottom-nav__icon" strokeWidth={2.1} />
        <span>Profil</span>
      </button>
    </nav>
  );
}
