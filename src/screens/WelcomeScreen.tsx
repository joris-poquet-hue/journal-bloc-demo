import { ChevronRight, LockKeyhole, NotebookTabs } from 'lucide-react';
import { useMemo } from 'react';

import {
  ApproachIcon,
  getInterventionApproachLabel,
} from '../components/ApproachIcon';
import { useAppContext } from '../context/AppContext';
import {
  formatDisplayName,
  formatSeniorDisplayName,
  getChoiceLabel,
  hydrateAdminInterventionEvaluations,
} from '../data/mockData';
import { AdminInterventionEvaluation } from '../types';
import { calculateAutonomyScore } from '../utils/autonomyScore';

const ADMIN_EVALUATIONS_STORAGE_KEY =
  'journal-bord:admin-intervention-evaluations:v1';

function getInitials(firstName: string, lastName: string) {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();
}

function formatDashboardDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
    .format(new Date(year, month - 1, day))
    .replace('.', '');
}

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
    customSurgicalInterventions,
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

  return (
    <main className="screen-shell dashboard-screen">
      <div className="screen-shell__frame">
        <section className="dashboard-profile-card" aria-label="Profil connecté">
          <div className="dashboard-profile-card__copy">
            <span className="dashboard-profile-card__eyebrow">Profil connecté</span>
            <h1>{fullName}</h1>
            <p className="dashboard-profile-card__status">
              Interne – Semestre {selectedInternal.semester.replace('S', '')}
            </p>
            <p className="dashboard-profile-card__rotation">
              Gynécologue – {selectedInternal.currentRotation}
            </p>
          </div>
          <div className="dashboard-profile-card__avatar" aria-hidden="true">
            {getInitials(selectedInternal.firstName, selectedInternal.lastName)}
          </div>
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
          </header>
          <p className="dashboard-empty">
            Aucun trophée n’est encore configuré pour le moment
          </p>
        </section>

        <section className="dashboard-card">
          <header className="dashboard-card__header">
            <h2>Mes dernières interventions</h2>
            <button
              className="dashboard-card__link"
              onClick={goToSurgeryHistory}
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
                const autonomyScore =
                  calculateAutonomyScore(
                    intervention,
                    customSurgicalInterventions,
                    evaluation
                  ) ?? intervention.autonomyScore;
                const content = (
                  <>
                    <ApproachIcon intervention={intervention} />
                    <span className="dashboard-intervention__date">
                      {formatDashboardDate(intervention.date)}
                    </span>
                    <span className="dashboard-intervention__main">
                      <strong>
                        {getChoiceLabel(surgicalProcedureOptions, intervention.procedure)}
                      </strong>
                      <span>{getInterventionApproachLabel(intervention)}</span>
                      <span>
                        {senior ? formatSeniorDisplayName(senior) : 'Senior non renseigné'}
                      </span>
                    </span>
                    <span className="dashboard-intervention__status">
                      <span
                        className={`dashboard-status-pill ${
                          isValidated
                            ? 'dashboard-status-pill--valid'
                            : 'dashboard-status-pill--pending'
                        }`}
                      >
                        {isValidated ? 'Validée' : 'En attente'}
                      </span>
                      {isValidated && autonomyScore != null ? (
                        <span className="dashboard-score-pill">
                          {Math.round(autonomyScore)}%
                        </span>
                      ) : null}
                    </span>
                    {isValidated ? (
                      <ChevronRight
                        aria-hidden="true"
                        className="dashboard-intervention__action-icon"
                      />
                    ) : (
                      <LockKeyhole
                        aria-hidden="true"
                        className="dashboard-intervention__action-icon"
                      />
                    )}
                  </>
                );

                return isValidated ? (
                  <button
                    className="dashboard-intervention dashboard-intervention--clickable"
                    key={intervention.id}
                    onClick={goToSurgeryHistory}
                    type="button"
                  >
                    {content}
                  </button>
                ) : (
                  <article className="dashboard-intervention" key={intervention.id}>
                    {content}
                  </article>
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
