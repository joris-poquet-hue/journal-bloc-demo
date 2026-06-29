import { ChevronRight, NotebookTabs } from 'lucide-react';
import { useMemo } from 'react';

import { InternalAvatar } from '../components/InternalAvatar';
import {
  formatInterventionCardDate,
  SurgeryInterventionCard,
} from '../components/SurgeryInterventionCard';
import { useAppContext } from '../context/AppContext';
import {
  formatDisplayName,
  formatSeniorDisplayName,
  getChoiceLabel,
  hydrateAdminInterventionEvaluations,
} from '../data/mockData';
import { AdminInterventionEvaluation } from '../types';

const ADMIN_EVALUATIONS_STORAGE_KEY =
  'journal-bord:admin-intervention-evaluations:v1';
const HOME_TROPHY_SHOWCASE = [
  {
    id: 'showcase-salpingectomie-1',
    title: 'Première salpingectomie',
    imageSrc: '/images/badges/salpingectomie-operateur-principal-1.png',
    label: 'À venir',
  },
  {
    id: 'showcase-colpocleisis-1',
    title: 'Premier colpoclésis',
    imageSrc: '/images/badges/colpocleisis-operateur-principal-1.png',
    label: 'À venir',
  },
  {
    id: 'showcase-salpingectomie-as',
    title: 'As de la salpingectomie',
    imageSrc: '/images/badges/salpingectomie-as.png',
    label: 'Collection',
  },
] as const;

function loadStoredAdminEvaluations() {
  if (typeof window === 'undefined') {
    return hydrateAdminInterventionEvaluations();
  }

  try {
    const rawValue = window.localStorage.getItem(ADMIN_EVALUATIONS_STORAGE_KEY);

    if (!rawValue) {
      return hydrateAdminInterventionEvaluations();
    }

    const parsedValue = JSON.parse(rawValue);

    return parsedValue && typeof parsedValue === 'object'
      ? hydrateAdminInterventionEvaluations(
          parsedValue as Record<string, AdminInterventionEvaluation>
        )
      : hydrateAdminInterventionEvaluations();
  } catch {
    return hydrateAdminInterventionEvaluations();
  }
}

export function WelcomeScreen() {
  const {
    selectedInternal,
    savedInterventions,
    selectableSeniors,
    surgicalProcedureOptions,
    goToBadges,
    goToNotebook,
    goToSurgeryHistory,
  } = useAppContext();

  const adminEvaluations = useMemo(loadStoredAdminEvaluations, []);

  if (!selectedInternal) {
    return null;
  }

  const latestInterventions = savedInterventions
    .filter((intervention) => intervention.internalId === selectedInternal.id)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 3);
  const fullName = formatDisplayName(
    selectedInternal.firstName,
    selectedInternal.lastName
  );
  const trainingHospital = 'CHU de Nantes';
  const recentTrophies = [...(selectedInternal.achievementBadges ?? [])]
    .sort((left, right) => right.awardedAt.localeCompare(left.awardedAt))
    .slice(0, 3);
  const trophyPreview =
    recentTrophies.length > 0
      ? recentTrophies.map((badge) => ({
          id: badge.id,
          imageSrc: badge.imageSrc,
          label: 'Obtenu',
          title: badge.title,
        }))
      : HOME_TROPHY_SHOWCASE;

  return (
    <main className="screen-shell dashboard-screen">
      <div className="screen-shell__frame">
        <header className="dashboard-home-header">
          <h1>Mon Journal de Bloc</h1>
        </header>

        <section className="dashboard-profile-card" aria-label="Profil interne">
          <div className="dashboard-profile-card__copy">
            <span className="dashboard-profile-card__eyebrow">Bonjour</span>
            <h1>{fullName}</h1>
            <p className="dashboard-profile-card__status">
              Interne · {selectedInternal.semester}
            </p>
            <p className="dashboard-profile-card__rotation">{selectedInternal.currentRotation}</p>
            <p className="dashboard-profile-card__hospital">{trainingHospital}</p>
          </div>
          <InternalAvatar
            className="dashboard-profile-card__avatar"
            firstName={selectedInternal.firstName}
            imageSrc={selectedInternal.avatarImageSrc}
            lastName={selectedInternal.lastName}
          />
        </section>

        <button className="dashboard-note-link" onClick={goToNotebook} type="button">
          <span className="dashboard-note-link__icon" aria-hidden="true">
            <NotebookTabs strokeWidth={2.1} />
          </span>
          <span className="dashboard-note-link__copy">
            <strong>Bloc-notes</strong>
            <span>Notes personnelles</span>
          </span>
          <ChevronRight aria-hidden="true" className="dashboard-note-link__chevron" />
        </button>

        <section className="dashboard-card">
          <header className="dashboard-card__header">
            <h2>Mes derniers trophées</h2>
            <button className="dashboard-card__link" onClick={goToBadges} type="button">
              Voir tout
              <ChevronRight aria-hidden="true" />
            </button>
          </header>
          <div className="dashboard-trophy-strip" role="list" aria-label="Aperçu des trophées">
            {trophyPreview.map((badge) => (
              <article
                className={`dashboard-trophy-chip ${
                  badge.label === 'Obtenu' ? '' : 'dashboard-trophy-chip--upcoming'
                }`}
                key={badge.id}
                role="listitem"
              >
                <img alt={badge.title} src={badge.imageSrc} />
                <span>{badge.label}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-card">
          <header className="dashboard-card__header">
            <h2>Mes dernières interventions</h2>
            <button
              className="dashboard-card__link"
              onClick={() => goToSurgeryHistory()}
              type="button"
            >
              Voir tout l’historique
              <ChevronRight aria-hidden="true" />
            </button>
          </header>
          {latestInterventions.length ? (
            <div className="dashboard-intervention-list">
              {latestInterventions.map((intervention) => {
                const evaluation = adminEvaluations[intervention.id];
                const isValidated = Boolean(
                  evaluation?.globalPerformance && evaluation.categoryDifficulty
                );
                const senior = selectableSeniors.find(
                  (candidate) => candidate.id === intervention.seniorId
                );
                return (
                  <SurgeryInterventionCard
                    dateLabel={formatInterventionCardDate(intervention.date)}
                    intervention={intervention}
                    isValidated={isValidated}
                    key={intervention.id}
                    onPress={
                      isValidated
                        ? () => goToSurgeryHistory(intervention.date)
                        : undefined
                    }
                    procedureLabel={getChoiceLabel(
                      surgicalProcedureOptions,
                      intervention.procedure
                    )}
                    seniorLabel={
                      senior ? formatSeniorDisplayName(senior) : 'Senior non renseigné'
                    }
                  />
                );
              })}
            </div>
          ) : (
            <p className="dashboard-empty">
              Aucune intervention enregistrée pour le moment
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
