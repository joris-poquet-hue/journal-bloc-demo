import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import { formatDisplayName } from '../data/mockData';

export function PortalSelectionScreen() {
  const {
    selectedInternal,
    goToObstetricPortal,
    goToSurgeryPortal,
    logout,
  } = useAppContext();

  if (!selectedInternal) {
    return null;
  }

  return (
    <ScreenContainer
      eyebrow="Session"
      title="Choix du portail"
      subtitle={`Bienvenue ${formatDisplayName(
        selectedInternal.firstName,
        selectedInternal.lastName
      )}.`}
    >
      <SectionCard
        title="Accès aux portails"
        description="Choisis l’espace que tu veux ouvrir."
      >
        <div className="portal-selection">
          <button
            className="portal-selection__button portal-selection__button--surgery"
            onClick={goToSurgeryPortal}
            type="button"
          >
            Portail chirurgie
          </button>
          <button
            className="portal-selection__button portal-selection__button--obstetric"
            onClick={goToObstetricPortal}
            type="button"
          >
            Portail obstétrique
          </button>
        </div>
      </SectionCard>

      <PrimaryButton
        label="Se déconnecter"
        onPress={logout}
        variant="secondary"
      />
    </ScreenContainer>
  );
}
