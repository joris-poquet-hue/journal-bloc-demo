import { ChevronRight, NotebookTabs, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';

import { InternalTrophyCard } from '../components/InternalTrophyCard';
import { NotificationAvatarButton } from '../components/NotificationAvatarButton';
import { NotificationCenter } from '../components/NotificationCenter';
import {
  formatInterventionCardDate,
  SurgeryInterventionCard,
} from '../components/SurgeryInterventionCard';
import { useAppContext } from '../context/AppContext';
import {
  formatDisplayName,
  formatSeniorDisplayName,
  getProcedureLabel,
} from '../data/mockData';
import {
  buildTrophyDisplayModels,
  TrophyDisplayModel,
} from '../utils/trophyDisplay';
import { formatIsoDate } from '../utils/date';
import { SavedIntervention } from '../types';

function toTimestamp(value: string | null) {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getProgressRatio(item: TrophyDisplayModel) {
  if (
    typeof item.progressCurrent !== 'number' ||
    typeof item.progressTarget !== 'number' ||
    item.progressTarget <= 0
  ) {
    return item.isUnlocked ? 1 : 0;
  }

  return item.progressCurrent / item.progressTarget;
}

function comparePreviewTrophies(left: TrophyDisplayModel, right: TrophyDisplayModel) {
  const timestampDelta = toTimestamp(right.awardedAt) - toTimestamp(left.awardedAt);

  if (timestampDelta !== 0) {
    return timestampDelta;
  }

  const progressDelta = getProgressRatio(right) - getProgressRatio(left);

  if (progressDelta !== 0) {
    return progressDelta;
  }

  return right.isUnlocked === left.isUnlocked ? 0 : right.isUnlocked ? 1 : -1;
}

function getInterventionTime(intervention: SavedIntervention) {
  if (intervention.startTime) {
    return intervention.startTime.slice(0, 5);
  }

  const date = new Date(intervention.savedAt);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function WelcomeScreen() {
  const {
    adminEvaluations,
    adminTrophies,
    customSurgicalInterventions,
    selectedInternal,
    savedInterventions,
    selectableSeniors,
    trophyAwards,
    userNotifications,
    deleteUserNotification,
    goToProfile,
    goToTrophies,
    goToNotebook,
    goToSurgeryHistory,
    markAllUserNotificationsRead,
    markUserNotificationRead,
  } = useAppContext();
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);

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
  const trophyDisplay = useMemo(
    () =>
      buildTrophyDisplayModels({
        adminEvaluations,
        adminTrophies,
        customSurgicalInterventions,
        profile: selectedInternal,
        savedInterventions,
        trophyAwards,
    }),
    [
      adminEvaluations,
      adminTrophies,
      customSurgicalInterventions,
      savedInterventions,
      selectedInternal,
      trophyAwards,
    ]
  );
  const trophyPreview = useMemo(() => {
    return [...trophyDisplay.earned, ...trophyDisplay.progress]
      .sort(comparePreviewTrophies)
      .slice(0, 3);
  }, [trophyDisplay.earned, trophyDisplay.progress]);
  const desktopTrophyFocus = useMemo(() => {
    return (
      [...trophyDisplay.earned, ...trophyDisplay.progress]
        .filter((item) => !item.isSecret || item.isUnlocked)
        .sort(comparePreviewTrophies)[0] ?? null
    );
  }, [trophyDisplay.earned, trophyDisplay.progress]);
  const unreadNotificationCount = userNotifications.filter(
    (notification) => !notification.readAt
  ).length;
  const handleNotificationNavigation = (
    notification: (typeof userNotifications)[number]
  ) => {
    if (notification.actionType === 'trophy') {
      goToTrophies(notification.trophyId ?? notification.actionTarget ?? undefined);
      return;
    }

    if (notification.actionType === 'intervention' && notification.actionTarget) {
      const intervention = savedInterventions.find(
        (candidate) => candidate.id === notification.actionTarget
      );

      if (intervention) {
        goToSurgeryHistory(intervention.date, 'calendar', intervention.id);
      }
      return;
    }

    if (notification.actionType !== 'internal_path') {
      return;
    }

    switch (notification.actionTarget) {
      case '/profil':
        goToProfile();
        break;
      case '/progression':
        goToSurgeryHistory(undefined, 'progress');
        break;
      case '/historique':
        goToSurgeryHistory();
        break;
      case '/trophees':
        goToTrophies();
        break;
      default:
        break;
    }
  };
  const isInterventionValidated = (intervention: SavedIntervention) => {
    const evaluation = adminEvaluations[intervention.id];

    return Boolean(evaluation?.globalPerformance && evaluation.categoryDifficulty);
  };
  const renderInterventionCard = (
    intervention: SavedIntervention,
    showTime = false
  ) => {
    const isValidated = isInterventionValidated(intervention);
    const senior = selectableSeniors.find(
      (candidate) => candidate.id === intervention.seniorId
    );

    return (
      <SurgeryInterventionCard
        dateLabel={formatInterventionCardDate(intervention.date)}
        dateMetaLabel={showTime ? getInterventionTime(intervention) : undefined}
        intervention={intervention}
        isValidated={isValidated}
        onPress={
          isValidated ? () => goToSurgeryHistory(intervention.date) : undefined
        }
        procedureLabel={getProcedureLabel(
          intervention.procedure,
          customSurgicalInterventions
        )}
        seniorLabel={
          senior ? formatSeniorDisplayName(senior) : 'Senior non renseigné'
        }
      />
    );
  };

  return (
    <main className="screen-shell dashboard-screen">
      <div className="screen-shell__frame">
        <section className="dashboard-profile-card" aria-label="Profil interne">
          <div className="dashboard-profile-card__copy">
            <span className="dashboard-profile-card__eyebrow">Bonjour</span>
            <h1>{fullName}</h1>
            <p className="dashboard-profile-card__status">
              Interne · {selectedInternal.semester}
            </p>
            <p className="dashboard-profile-card__hospital">
              {selectedInternal.institution}
            </p>
          </div>
          <NotificationAvatarButton
            className="dashboard-profile-card__avatar"
            firstName={selectedInternal.firstName}
            imageSrc={selectedInternal.avatarImageSrc}
            lastName={selectedInternal.lastName}
            onClick={() => setIsNotificationCenterOpen(true)}
            unreadCount={unreadNotificationCount}
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
          <span className="dashboard-note-link__privacy">Privé</span>
          <ChevronRight aria-hidden="true" className="dashboard-note-link__chevron" />
        </button>

        <section className="dashboard-card dashboard-card--interventions">
          <header className="dashboard-card__header">
            <h2>Dernières interventions</h2>
            <button
              className="dashboard-card__link"
              onClick={() => goToSurgeryHistory()}
              type="button"
            >
              Voir l’historique
              <ChevronRight aria-hidden="true" />
            </button>
          </header>
          {latestInterventions.length ? (
            <>
              <div className="dashboard-intervention-list dashboard-intervention-list--mobile">
                {latestInterventions.map((intervention) => (
                  <div key={intervention.id}>
                    {renderInterventionCard(intervention)}
                  </div>
                ))}
              </div>
              <div
                className={[
                  'dashboard-intervention-feature-grid',
                  latestInterventions.length === 1
                    ? 'dashboard-intervention-feature-grid--single'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="dashboard-intervention-feature">
                  <div className="dashboard-intervention-feature__meta">
                    <span>Dernière intervention</span>
                    <strong
                      className={[
                        'dashboard-intervention-feature__status',
                        isInterventionValidated(latestInterventions[0])
                          ? 'dashboard-intervention-feature__status--validated'
                          : 'dashboard-intervention-feature__status--pending',
                      ].join(' ')}
                    >
                      {isInterventionValidated(latestInterventions[0])
                        ? 'Évaluée'
                        : 'En attente'}
                    </strong>
                  </div>
                  {renderInterventionCard(latestInterventions[0], true)}
                </div>
                {latestInterventions.length > 1 ? (
                  <div className="dashboard-intervention-feature__secondary">
                    {latestInterventions.slice(1).map((intervention) => (
                      <div key={intervention.id}>
                        {renderInterventionCard(intervention, true)}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="dashboard-empty">
              Aucune intervention enregistrée pour le moment
            </p>
          )}
        </section>

        <section className="dashboard-card dashboard-card--trophies">
          <header className="dashboard-card__header">
            <h2>Derniers trophées</h2>
            <button
              className="dashboard-card__link"
              onClick={() => goToTrophies()}
              type="button"
            >
              Voir la vitrine
              <ChevronRight aria-hidden="true" />
            </button>
          </header>
          {trophyPreview.length ? (
            <div
              className="dashboard-trophy-strip dashboard-trophy-strip--mobile"
              role="list"
              aria-label="Aperçu des trophées"
            >
              {trophyPreview.map((item) => (
                <div key={item.id} role="listitem">
                  <InternalTrophyCard item={item} />
                </div>
              ))}
            </div>
          ) : (
            <section className="trophy-empty-state trophy-empty-state--mobile" aria-label="Aucun trophée remporté">
              <div className="trophy-empty-state__icon">
                <Trophy aria-hidden="true" strokeWidth={2.1} />
              </div>
              <strong>Aucun trophée remporté pour le moment</strong>
              <p>Progresse pour remporter des trophées!</p>
            </section>
          )}
          {desktopTrophyFocus ? (
            <div
              aria-label="Aperçu du dernier trophée"
              className="dashboard-trophy-focus"
              role="list"
            >
              <div className="dashboard-trophy-focus__meta">
                <span>
                  {desktopTrophyFocus.isUnlocked
                    ? 'Dernier trophée obtenu'
                    : 'Progression en cours'}
                </span>
                {desktopTrophyFocus.isUnlocked && desktopTrophyFocus.awardedAt ? (
                  <time dateTime={desktopTrophyFocus.awardedAt}>
                    Obtenu le {formatIsoDate(desktopTrophyFocus.awardedAt)}
                  </time>
                ) : null}
              </div>
              <div role="listitem">
                <InternalTrophyCard item={desktopTrophyFocus} />
              </div>
            </div>
          ) : (
            <section
              className="trophy-empty-state trophy-empty-state--desktop"
              aria-label="Aucun trophée remporté"
            >
              <div className="trophy-empty-state__icon">
                <Trophy aria-hidden="true" strokeWidth={2.1} />
              </div>
              <strong>Aucun trophée remporté pour le moment</strong>
              <p>Progresse pour remporter des trophées!</p>
            </section>
          )}
        </section>
      </div>
      <NotificationCenter
        isOpen={isNotificationCenterOpen}
        notifications={userNotifications}
        onClose={() => setIsNotificationCenterOpen(false)}
        onDelete={deleteUserNotification}
        onNavigate={handleNotificationNavigation}
        onRead={markUserNotificationRead}
        onReadAll={markAllUserNotificationsRead}
      />
    </main>
  );
}
