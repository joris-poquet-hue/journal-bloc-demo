import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import { formatDisplayName } from '../data/mockData';

export function ProfileScreen() {
  const { selectedInternal, logout } = useAppContext();

  if (!selectedInternal) {
    return null;
  }

  return (
    <ScreenContainer
      eyebrow="Profil"
      title="Mon profil"
      subtitle="Informations de session et paramètres du compte."
    >
      <SectionCard title="Profil connecté">
        <div className="profile-detail">
          <strong className="profile-detail__name">
            {formatDisplayName(selectedInternal.firstName, selectedInternal.lastName)}
          </strong>
          <div className="profile-detail__grid">
            <div className="info-block">
              <span className="info-block__label">Promotion</span>
              <strong className="info-block__value">{selectedInternal.promotion}</strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Semestre</span>
              <strong className="info-block__value">{selectedInternal.semester}</strong>
            </div>
            <div className="info-block profile-detail__field--full">
              <span className="info-block__label">Stage actuel</span>
              <strong className="info-block__value">
                {selectedInternal.currentRotation}
              </strong>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Compte"
        description="Les identifiants sont générés et gérés par l’administrateur du service."
      >
        <div className="action-stack">
          <PrimaryButton
            label="Se déconnecter"
            onPress={logout}
            variant="danger"
          />
        </div>
      </SectionCard>
    </ScreenContainer>
  );
}
