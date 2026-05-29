import { FormEvent, useMemo, useState } from 'react';

import { ProgressBadgeCard } from '../components/ProgressBadgeCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  badgeCatalog,
  contextOptions,
  formatDisplayName,
  getChoiceLabel,
  getInternalById,
  getProgressBadgesForInternal,
  getSeniorById,
  procedureOptions,
  roleOptions,
} from '../data/mockData';
import { CreateInternalProfileInput, InternalProfile } from '../types';
import { formatIsoDate } from '../utils/date';
import { downloadInterventionsCsv } from '../utils/export';

type AdminView = 'home' | 'badges' | 'profile';
type FeedbackState =
  | {
      kind: 'success' | 'error';
      message: string;
    }
  | null;

type AdminInterventionFilters = {
  internalId: string;
  procedure: 'all' | 'salpingectomie' | 'colpoclesis';
  dateFrom: string;
  dateTo: string;
};

const EMPTY_CREATE_FORM: CreateInternalProfileInput = {
  firstName: '',
  lastName: '',
  loginId: '',
  password: '',
  promotion: '',
  semester: '',
  currentRotation: '',
};

const EMPTY_INTERVENTION_FILTERS: AdminInterventionFilters = {
  internalId: 'all',
  procedure: 'all',
  dateFrom: '',
  dateTo: '',
};

const ROTATION_SUGGESTIONS = [
  'Chirurgie',
  'DAN',
  'Pool obstétrical',
  'UGOMPS',
];

function getSemesterTone(semester: string) {
  const semesterNumber = Number(semester.replace('S', ''));

  if (semesterNumber >= 1 && semesterNumber <= 2) {
    return 'blue';
  }

  if (semesterNumber >= 3 && semesterNumber <= 8) {
    return 'green';
  }

  return 'gold';
}

function getTierRank(tier: 'diamond' | 'gold' | 'silver' | 'bronze') {
  if (tier === 'diamond') {
    return 4;
  }

  if (tier === 'gold') {
    return 3;
  }

  if (tier === 'silver') {
    return 2;
  }

  return 1;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Jamais connecté';
  }

  return new Date(value).toLocaleString('fr-FR');
}

function sortEarnedBadges(profile: InternalProfile, savedInterventions: ReturnType<typeof useAppContext>['savedInterventions']) {
  return getProgressBadgesForInternal(profile, savedInterventions)
    .filter((badge) => badge.isEarned)
    .sort((left, right) => {
      const tierDifference = getTierRank(right.tier) - getTierRank(left.tier);

      if (tierDifference !== 0) {
        return tierDifference;
      }

      return (right.awardedAt ?? '').localeCompare(left.awardedAt ?? '');
    });
}

export function AdminScreen() {
  const {
    createInternalProfile,
    deleteInternalProfile,
    deleteSavedInterventions,
    internalProfiles,
    logout,
    savedInterventions,
  } = useAppContext();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [view, setView] = useState<AdminView>('home');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [createForm, setCreateForm] =
    useState<CreateInternalProfileInput>(EMPTY_CREATE_FORM);
  const [interventionFilters, setInterventionFilters] =
    useState<AdminInterventionFilters>(EMPTY_INTERVENTION_FILTERS);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [profileToDelete, setProfileToDelete] = useState<InternalProfile | null>(null);

  const sortedInterventions = useMemo(
    () =>
      [...savedInterventions].sort((left, right) =>
        right.savedAt.localeCompare(left.savedAt)
      ),
    [savedInterventions]
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredInterventions = useMemo(
    () =>
      sortedInterventions.filter((intervention) => {
        if (
          interventionFilters.internalId !== 'all' &&
          intervention.internalId !== interventionFilters.internalId
        ) {
          return false;
        }

        if (
          interventionFilters.procedure !== 'all' &&
          intervention.procedure !== interventionFilters.procedure
        ) {
          return false;
        }

        if (
          interventionFilters.dateFrom &&
          intervention.date < interventionFilters.dateFrom
        ) {
          return false;
        }

        if (
          interventionFilters.dateTo &&
          intervention.date > interventionFilters.dateTo
        ) {
          return false;
        }

        return true;
      }),
    [interventionFilters, sortedInterventions]
  );
  const selectedInterventions = useMemo(
    () => filteredInterventions.filter((intervention) => selectedSet.has(intervention.id)),
    [filteredInterventions, selectedSet]
  );
  const allSelected =
    filteredInterventions.length > 0 &&
    filteredInterventions.every((intervention) => selectedSet.has(intervention.id));
  const hasActiveInterventionFilters = useMemo(
    () =>
      interventionFilters.internalId !== 'all' ||
      interventionFilters.procedure !== 'all' ||
      interventionFilters.dateFrom !== '' ||
      interventionFilters.dateTo !== '',
    [interventionFilters]
  );
  const filteredCountLabel = useMemo(() => {
    if (!hasActiveInterventionFilters) {
      return `${filteredInterventions.length} intervention(s) enregistrée(s)`;
    }

    return `${filteredInterventions.length} intervention(s) affichée(s) sur ${sortedInterventions.length}`;
  }, [filteredInterventions.length, hasActiveInterventionFilters, sortedInterventions.length]);
  const badgeStats = useMemo(
    () =>
      [...badgeCatalog]
        .map((badge) => {
          const obtainedCount = internalProfiles.filter((profile) =>
            getProgressBadgesForInternal(profile, savedInterventions).some(
              (progressBadge) =>
                progressBadge.metricKey === badge.metricKey &&
                progressBadge.target === badge.target &&
                progressBadge.isEarned
            )
          ).length;

          return {
            ...badge,
            obtainedCount,
          };
        })
        .sort((left, right) => {
          const tierDifference = getTierRank(right.tier) - getTierRank(left.tier);

          if (tierDifference !== 0) {
            return tierDifference;
          }

          return left.title.localeCompare(right.title, 'fr');
        }),
    [internalProfiles, savedInterventions]
  );

  const profilesForAdminList = useMemo(
    () =>
      [...internalProfiles].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      ),
    [internalProfiles]
  );

  const selectedProfile =
    internalProfiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const selectedProfileInterventions = useMemo(
    () =>
      selectedProfile
        ? sortedInterventions.filter(
            (intervention) => intervention.internalId === selectedProfile.id
          )
        : [],
    [selectedProfile, sortedInterventions]
  );
  const selectedProfileEarnedBadges = useMemo(
    () => (selectedProfile ? sortEarnedBadges(selectedProfile, savedInterventions) : []),
    [savedInterventions, selectedProfile]
  );

  const selectedProfileStats = useMemo(() => {
    if (!selectedProfile) {
      return null;
    }

    return {
      recordedInterventionsCount: selectedProfileInterventions.length,
      earnedBadgesCount: selectedProfileEarnedBadges.length,
    };
  }, [selectedProfile, selectedProfileEarnedBadges.length, selectedProfileInterventions]);

  const toggleSelection = (interventionId: string) => {
    setSelectedIds((current) =>
      current.includes(interventionId)
        ? current.filter((id) => id !== interventionId)
        : [...current, interventionId]
    );
  };

  const toggleSelectAll = () => {
    const filteredIds = filteredInterventions.map((intervention) => intervention.id);

    setSelectedIds((current) => {
      if (allSelected) {
        return current.filter((id) => !filteredIds.includes(id));
      }

      return [...new Set([...current, ...filteredIds])];
    });
  };

  const handleCreateFieldChange = (
    field: keyof CreateInternalProfileInput,
    value: string
  ) => {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
    setFeedback(null);
  };

  const handleCreateProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = createInternalProfile(createForm);

    setFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.success && result.profile
        ? `${result.message} Identifiant : ${result.profile.loginId} · Mot de passe : ${result.profile.password}`
        : result.message,
    });

    if (!result.success) {
      return;
    }

    setCreateForm(EMPTY_CREATE_FORM);
  };

  const handleInterventionFilterChange = (
    field: keyof AdminInterventionFilters,
    value: string
  ) => {
    setInterventionFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleExport = () => {
    downloadInterventionsCsv(selectedInterventions, internalProfiles);
  };

  const handleSelectedProfileExport = () => {
    downloadInterventionsCsv(selectedProfileInterventions, internalProfiles);
  };

  const handleDelete = () => {
    if (selectedInterventions.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Supprimer ${selectedInterventions.length} intervention(s) du journal administrateur ?`
    );

    if (!confirmed) {
      return;
    }

    deleteSavedInterventions(selectedInterventions.map((intervention) => intervention.id));
    setSelectedIds((current) =>
      current.filter(
        (id) => !selectedInterventions.some((intervention) => intervention.id === id)
      )
    );
  };

  const handleConfirmProfileDeletion = () => {
    if (!profileToDelete) {
      return;
    }

    deleteInternalProfile(profileToDelete.id);
      setFeedback({
        kind: 'success',
        message: `Le profil ${formatDisplayName(profileToDelete.firstName, profileToDelete.lastName)} a été supprimé.`,
      });
    setProfileToDelete(null);
  };

  if (view === 'profile' && selectedProfile && selectedProfileStats) {
    return (
      <ScreenContainer
        eyebrow="Administration"
        title={formatDisplayName(selectedProfile.firstName, selectedProfile.lastName)}
        subtitle={`${selectedProfile.promotion} · ${selectedProfile.semester} · ${selectedProfile.currentRotation}`}
        frameWidth="wide"
      >
        <SectionCard title="Informations du profil">
          <div className="admin-profile-detail__credentials">
            <div className="info-block">
              <span className="info-block__label">Identifiant</span>
              <strong className="info-block__value">{selectedProfile.loginId}</strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Mot de passe prototype</span>
              <strong className="info-block__value">{selectedProfile.password}</strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Créé le</span>
              <strong className="info-block__value">
                {formatDateTime(selectedProfile.createdAt)}
              </strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Dernière connexion</span>
              <strong className="info-block__value">
                {formatDateTime(selectedProfile.lastLoginAt)}
              </strong>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Vue d’ensemble">
          <div className="info-grid">
            <div className="info-block">
              <span className="info-block__label">Badges acquis</span>
              <strong className="info-block__value">
                {selectedProfileStats.earnedBadgesCount}
              </strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Interventions enregistrées</span>
              <strong className="info-block__value">
                {selectedProfileStats.recordedInterventionsCount}
              </strong>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Interventions enregistrées"
        >
          <div className="admin-toolbar">
            <div className="admin-toolbar__actions">
              <button
                className="mini-button mini-button--secondary"
                disabled={selectedProfileInterventions.length === 0}
                onClick={handleSelectedProfileExport}
                type="button"
              >
                Exporter les interventions (.csv)
              </button>
            </div>
          </div>
          {selectedProfileInterventions.length ? (
            <div className="admin-list">
              {selectedProfileInterventions.map((intervention) => {
                const senior = getSeniorById(intervention.seniorId);

                return (
                  <article key={intervention.id} className="admin-item">
                    <strong>{getChoiceLabel(procedureOptions, intervention.procedure)}</strong>
                    <span>Date du bloc : {formatIsoDate(intervention.date)}</span>
                    <span>
                      Enregistrée le : {new Date(intervention.savedAt).toLocaleString('fr-FR')}
                    </span>
                    <span>
                      Senior :{' '}
                      {senior
                        ? `${senior.firstName} ${senior.lastName}`
                        : 'Non renseigné'}
                    </span>
                    <span>
                      Rôle : {getChoiceLabel(roleOptions, intervention.role)}
                    </span>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="validation-box">
              <strong>Aucune intervention enregistrée dans l’application</strong>
              <span>Les futures saisies de cet interne apparaîtront ici.</span>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Badges acquis"
          description={`${selectedProfileEarnedBadges.length} badge(s) obtenu(s).`}
        >
          {selectedProfileEarnedBadges.length ? (
            <div className="badge-grid">
              {selectedProfileEarnedBadges.map((badge) => (
                <ProgressBadgeCard key={badge.id} badge={badge} />
              ))}
            </div>
          ) : (
            <div className="validation-box">
              <strong>Aucun badge acquis pour l’instant</strong>
              <span>Les futurs badges obtenus par cet interne apparaîtront ici.</span>
            </div>
          )}
        </SectionCard>

        <div className="action-stack">
          <PrimaryButton
            label="Retour à la liste des profils"
            onPress={() => {
              setSelectedProfileId(null);
              setView('home');
            }}
            variant="secondary"
          />
        </div>
      </ScreenContainer>
    );
  }

  if (view === 'badges') {
    return (
      <ScreenContainer
        eyebrow="Administration"
        title="Catalogue des badges"
        subtitle="Vue d’ensemble de tous les badges potentiellement obtenables."
        frameWidth="wide"
      >
        <SectionCard title="Catalogue">
          <div className="admin-badge-table-wrapper">
            <table className="admin-badge-table">
              <thead>
                <tr>
                  <th>Badge</th>
                  <th>Nom</th>
                  <th>Condition d’obtention</th>
                  <th>Badge à débloquer avant</th>
                  <th>Internes ayant obtenu</th>
                </tr>
              </thead>
              <tbody>
                {badgeStats.map((badge) => (
                  <tr key={badge.id}>
                    <td>
                      <img
                        alt={badge.title}
                        className="admin-badge-table__image"
                        src={badge.imageSrc}
                      />
                    </td>
                    <td>{badge.title}</td>
                    <td>{badge.criteria}</td>
                    <td>{badge.prerequisiteTitle ?? 'Aucun'}</td>
                    <td>{badge.obtainedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="action-stack">
          <PrimaryButton
            label="Retour aux données administrateur"
            onPress={() => setView('home')}
            variant="secondary"
          />
        </div>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      eyebrow="Administration"
      title="Espace administrateur"
      frameWidth="wide"
    >
      <SectionCard
        title="Accès administrateur"
        description="Cet espace centralise la création de profils et la consultation des données."
      >
        <PrimaryButton
          label="Se déconnecter"
          onPress={logout}
          variant="secondary"
        />
      </SectionCard>

      <SectionCard
        title="Créer un nouvel interne"
      >
        <form className="admin-create-form" onSubmit={handleCreateProfile}>
          <div className="admin-create-form__grid">
            <label className="field-stack">
              <span className="field-stack__label">Prénom</span>
              <input
                className="field-input"
                onChange={(event) =>
                  handleCreateFieldChange('firstName', event.target.value)
                }
                type="text"
                value={createForm.firstName}
              />
            </label>

            <label className="field-stack">
              <span className="field-stack__label">Nom</span>
              <input
                className="field-input"
                onChange={(event) =>
                  handleCreateFieldChange('lastName', event.target.value)
                }
                type="text"
                value={createForm.lastName}
              />
            </label>

            <label className="field-stack">
              <span className="field-stack__label">Identifiant</span>
              <input
                autoCapitalize="none"
                autoCorrect="off"
                className="field-input"
                onChange={(event) =>
                  handleCreateFieldChange('loginId', event.target.value)
                }
                type="text"
                value={createForm.loginId}
              />
            </label>

            <label className="field-stack">
              <span className="field-stack__label">Mot de passe</span>
              <input
                autoCapitalize="none"
                autoCorrect="off"
                className="field-input"
                onChange={(event) =>
                  handleCreateFieldChange('password', event.target.value)
                }
                type="text"
                value={createForm.password}
              />
            </label>

            <label className="field-stack">
              <span className="field-stack__label">Promotion</span>
              <input
                className="field-input"
                onChange={(event) =>
                  handleCreateFieldChange('promotion', event.target.value)
                }
                placeholder="Promo 2026"
                type="text"
                value={createForm.promotion}
              />
            </label>

            <label className="field-stack">
              <span className="field-stack__label">Semestre</span>
              <input
                className="field-input"
                onChange={(event) =>
                  handleCreateFieldChange('semester', event.target.value)
                }
                placeholder="S1"
                type="text"
                value={createForm.semester}
              />
            </label>

            <label className="field-stack admin-create-form__field--full">
              <span className="field-stack__label">Stage actuel</span>
              <input
                className="field-input"
                list="rotation-suggestions"
                onChange={(event) =>
                  handleCreateFieldChange('currentRotation', event.target.value)
                }
                type="text"
                value={createForm.currentRotation}
              />
              <datalist id="rotation-suggestions">
                {ROTATION_SUGGESTIONS.map((rotation) => (
                  <option key={rotation} value={rotation} />
                ))}
              </datalist>
            </label>
          </div>

          {feedback ? (
            <p className={feedback.kind === 'success' ? 'auth-success' : 'auth-error'}>
              {feedback.message}
            </p>
          ) : null}

          <button className="app-button app-button--primary" type="submit">
            Créer le profil
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Profils internes">
        <div className="admin-profile-list">
          {profilesForAdminList.map((profile) => (
              <article
                key={profile.id}
                className={`profile-card profile-card--${getSemesterTone(profile.semester)} profile-card--static`}
              >
                <div className="profile-card__header">
                  <strong
                    className={`profile-card__name-tag profile-card__name-tag--${getSemesterTone(
                      profile.semester
                    )}`}
                  >
                    {formatDisplayName(profile.firstName, profile.lastName)}
                  </strong>
                  <span className="profile-card__badge">{profile.semester}</span>
                </div>
                <div className="profile-card__meta">
                  <span>{profile.promotion}</span>
                  <span>{profile.currentRotation}</span>
                  <span>Identifiant : {profile.loginId}</span>
                  <span>Mot de passe : {profile.password}</span>
                </div>
                <div className="admin-profile-card__actions">
                  <button
                    className="mini-button mini-button--secondary"
                    onClick={() => {
                      setSelectedProfileId(profile.id);
                      setView('profile');
                    }}
                    type="button"
                  >
                    Voir les statistiques
                  </button>
                  <button
                    className="mini-button mini-button--danger"
                    onClick={() => setProfileToDelete(profile)}
                    type="button"
                  >
                    Supprimer le profil
                  </button>
                </div>
              </article>
            ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Catalogue des badges"
      >
        <PrimaryButton
          label="Voir tous les badges"
          onPress={() => setView('badges')}
          variant="secondary"
        />
      </SectionCard>

      <SectionCard
        title="Interventions enregistrées"
        description={`${filteredCountLabel} · export CSV compatible Excel.`}
      >
        {sortedInterventions.length === 0 ? (
          <div className="validation-box">
            <strong>Aucune intervention enregistrée</strong>
            <span>Les saisies réalisées par les internes apparaîtront ici.</span>
          </div>
        ) : (
          <>
            <div className="admin-filter-grid">
              <label className="field-stack">
                <span className="field-stack__label">Interne</span>
                <select
                  className="field-input"
                  onChange={(event) =>
                    handleInterventionFilterChange('internalId', event.target.value)
                  }
                  value={interventionFilters.internalId}
                >
                  <option value="all">Tous les internes</option>
                  {profilesForAdminList.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {formatDisplayName(profile.firstName, profile.lastName)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-stack">
                <span className="field-stack__label">Intervention</span>
                <select
                  className="field-input"
                  onChange={(event) =>
                    handleInterventionFilterChange('procedure', event.target.value)
                  }
                  value={interventionFilters.procedure}
                >
                  <option value="all">Toutes les interventions</option>
                  {procedureOptions.map((procedure) => (
                    <option key={procedure.value} value={procedure.value}>
                      {procedure.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-stack">
                <span className="field-stack__label">Date du bloc à partir du</span>
                <input
                  className="field-input"
                  onChange={(event) =>
                    handleInterventionFilterChange('dateFrom', event.target.value)
                  }
                  type="date"
                  value={interventionFilters.dateFrom}
                />
              </label>

              <label className="field-stack">
                <span className="field-stack__label">Date du bloc jusqu’au</span>
                <input
                  className="field-input"
                  onChange={(event) =>
                    handleInterventionFilterChange('dateTo', event.target.value)
                  }
                  type="date"
                  value={interventionFilters.dateTo}
                />
              </label>
            </div>

            <div className="admin-toolbar">
              <span className="admin-toolbar__status">
                {selectedInterventions.length === 0
                  ? 'Aucune intervention sélectionnée'
                  : `${selectedInterventions.length} intervention(s) sélectionnée(s)`}
              </span>
              <div className="admin-toolbar__actions">
                {hasActiveInterventionFilters ? (
                  <button
                    className="mini-button mini-button--secondary"
                    onClick={() => setInterventionFilters(EMPTY_INTERVENTION_FILTERS)}
                    type="button"
                  >
                    Réinitialiser les filtres
                  </button>
                ) : null}
                <button
                  className="mini-button mini-button--secondary"
                  onClick={toggleSelectAll}
                  type="button"
                  disabled={filteredInterventions.length === 0}
                >
                  {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
                <button
                  className="mini-button mini-button--secondary"
                  disabled={selectedIds.length === 0}
                  onClick={handleExport}
                  type="button"
                >
                  Exporter vers Excel (.csv)
                </button>
                <button
                  className="mini-button mini-button--danger"
                  disabled={selectedIds.length === 0}
                  onClick={handleDelete}
                  type="button"
                >
                  Supprimer la sélection
                </button>
              </div>
            </div>

            {filteredInterventions.length ? (
              <div className="admin-list">
                {filteredInterventions.map((intervention) => {
                const internal = getInternalById(
                  intervention.internalId,
                  internalProfiles
                );
                const senior = getSeniorById(intervention.seniorId);
                const isSelected = selectedSet.has(intervention.id);

                return (
                  <article
                    key={intervention.id}
                    className={`admin-item ${isSelected ? 'admin-item--selected' : ''}`}
                  >
                    <label className="admin-item__checkbox-row">
                      <input
                        checked={isSelected}
                        onChange={() => toggleSelection(intervention.id)}
                        type="checkbox"
                      />
                      <span className="admin-item__checkbox-label">
                        Sélectionner pour export ou suppression
                      </span>
                    </label>
                    <strong>
                      {internal
                        ? formatDisplayName(internal.firstName, internal.lastName)
                        : 'Interne non retrouvée'}
                    </strong>
                    <span>Date du bloc : {formatIsoDate(intervention.date)}</span>
                    <span>
                      Enregistrée le :{' '}
                      {new Date(intervention.savedAt).toLocaleString('fr-FR')}
                    </span>
                    <span>
                      Senior :{' '}
                      {senior
                        ? `${senior.firstName} ${senior.lastName}`
                        : 'Non renseigné'}
                    </span>
                    <span>
                      Intervention :{' '}
                      {getChoiceLabel(procedureOptions, intervention.procedure)}
                    </span>
                    <span>
                      Voie d’abord :{' '}
                      {getChoiceLabel(approachOptions, intervention.approach)}
                    </span>
                    <span>
                      Contexte : {getChoiceLabel(contextOptions, intervention.context)}
                    </span>
                    <span>
                      Rôle : {getChoiceLabel(roleOptions, intervention.role)}
                    </span>
                  </article>
                );
                })}
              </div>
            ) : (
              <div className="validation-box">
                <strong>Aucune intervention ne correspond aux filtres</strong>
                <span>Modifie les filtres pour afficher ou exporter d’autres données.</span>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {profileToDelete ? (
        <div
          aria-modal="true"
          className="confirm-modal"
          onClick={() => setProfileToDelete(null)}
          role="dialog"
        >
          <div
            className="confirm-modal__content"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Supprimer ce profil ?</h2>
              <p>
                Le profil sera supprimé ainsi que les données qui y sont rattachées.
              </p>
            <div className="confirm-modal__actions">
              <button
                className="mini-button mini-button--secondary"
                onClick={() => setProfileToDelete(null)}
                type="button"
              >
                Annuler
              </button>
              <button
                className="mini-button mini-button--danger"
                onClick={handleConfirmProfileDeletion}
                type="button"
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ScreenContainer>
  );
}
