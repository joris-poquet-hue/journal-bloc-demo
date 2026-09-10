import { AccountSecurityPanel } from '../../components/AccountSecurityPanel';
import { PrimaryButton } from '../../components/PrimaryButton';
import { SectionCard } from '../../components/SectionCard';
import { AdminPageShell } from './AdminPageShell';

export function AdminAccountView({
  onBack,
  onSupport,
}: {
  onBack: () => void;
  onSupport: () => void;
}) {
  return (
    <AdminPageShell
      backLabel="Retour à l’espace administrateur"
      onBack={onBack}
      subtitle="Informations du compte administrateur et accès au support."
      title="Mon profil administrateur"
    >
      <SectionCard className="admin-dashboard-card" title="Compte administrateur">
        <div className="info-grid">
          <div className="info-block">
            <span className="info-block__label">Rôle</span>
            <strong className="info-block__value">Administration</strong>
          </div>
          <div className="info-block">
            <span className="info-block__label">Identifiant</span>
            <strong className="info-block__value">admin</strong>
          </div>
          <div className="info-block">
            <span className="info-block__label">Périmètre</span>
            <strong className="info-block__value">
              Profils, interventions, historique, trophées
            </strong>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        className="admin-dashboard-card"
        description="Consultez et contrôlez chaque session ouverte."
        title="Sécurité et appareils"
      >
        <AccountSecurityPanel />
      </SectionCard>

      <SectionCard
        className="admin-dashboard-card"
        description="Besoin d’un accès, d’une correction de données ou d’une assistance technique ?"
        title="Support"
      >
        <div className="action-stack">
          <PrimaryButton
            label="Contacter le support"
            onPress={onSupport}
            variant="secondary"
          />
        </div>
      </SectionCard>
    </AdminPageShell>
  );
}
