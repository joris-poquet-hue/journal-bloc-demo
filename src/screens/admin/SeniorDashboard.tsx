import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileDown,
  LogOut,
  Mail,
  Pencil,
  RefreshCw,
  Settings,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ApproachIcon } from '../../components/ApproachIcon';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScreenContainer } from '../../components/ScreenContainer';
import { SectionCard } from '../../components/SectionCard';
import { buildSupportMailto } from '../../supportConfig';
import {
  formatDisplayName,
  getChoiceLabel,
  getInternalById,
} from '../../data/mockData';
import type {
  AdminInterventionEvaluation,
  ChoiceOption,
  InternalProfile,
  InterventionType,
  SavedIntervention,
  Senior,
  SurgicalInterventionDefinition,
  UpdateSeniorCredentialsInput,
  UpdateSeniorCredentialsResult,
} from '../../types';
import { downloadSeniorInstitutionInterventionsExcel } from '../../utils/export';
import { PASSWORD_POLICY_HELP, validatePasswordStrength } from '../../utils/passwordPolicy';
import { type AdminFeedback as FeedbackState } from './AdminFeedbackMessage';
import { InternalStatisticsPanel } from './InternalStatisticsPanel';
import { hasCompleteAdminEvaluation } from './adminEvaluationModel';
import {
  loadSeniorDashboardNavigationState,
  saveSeniorDashboardNavigationState,
} from './seniorDashboardNavigation';
import {
  SENIOR_FALLBACK_INTERVENTION_KEY,
  SENIOR_POPULATION_OPTIONS,
  formatLongFrenchDate,
  formatSeniorInterventionLabel,
  getSeniorSemesterTone,
  type SeniorPopulationFilter,
} from './seniorDashboardModel';

export function SeniorDashboard({
  adminEvaluations,
  customSurgicalInterventions,
  internalProfiles,
  onEvaluate,
  onLogout,
  refreshBackendData,
  savedInterventions,
  selectableSeniors,
  selectedSenior,
  surgicalProcedureOptions,
  requestEmailChange,
  updateSeniorCredentials,
  updateSeniorManagedInternals,
}: {
  adminEvaluations: Record<string, AdminInterventionEvaluation>;
  customSurgicalInterventions: SurgicalInterventionDefinition[];
  internalProfiles: InternalProfile[];
  onEvaluate: (interventionId: string) => void;
  onLogout: () => void;
  refreshBackendData: () => Promise<void>;
  savedInterventions: SavedIntervention[];
  selectableSeniors: Senior[];
  selectedSenior: Senior;
  surgicalProcedureOptions: ChoiceOption<InterventionType>[];
  requestEmailChange: (
    contactEmail: string,
    currentPassword: string
  ) => Promise<{ message: string; success: boolean }>;
  updateSeniorCredentials: (
    seniorId: string,
    input: UpdateSeniorCredentialsInput
  ) => Promise<UpdateSeniorCredentialsResult>;
  updateSeniorManagedInternals: (
    seniorId: string,
    internalIds: string[]
  ) => Promise<void>;
}) {
  const seniorName = formatDisplayName(
    selectedSenior.firstName,
    selectedSenior.lastName
  );
  const pendingEvaluationsPreviewLimit = 5;
  const [initialNavigationState] = useState(() =>
    loadSeniorDashboardNavigationState(selectedSenior.id)
  );
  const [populationFilter, setPopulationFilter] =
    useState<SeniorPopulationFilter>(initialNavigationState.populationFilter);
  const [isInternalSettingsSheetOpen, setIsInternalSettingsSheetOpen] =
    useState(false);
  const [isPasswordSheetOpen, setIsPasswordSheetOpen] = useState(false);
  const [isEmailSheetOpen, setIsEmailSheetOpen] = useState(false);
  const [isPendingEvaluationsSheetOpen, setIsPendingEvaluationsSheetOpen] =
    useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [managedInternalIdsDraft, setManagedInternalIdsDraft] = useState<string[]>(
    selectedSenior.managedInternalIds ?? []
  );
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    nextPassword: '',
    confirmPassword: '',
  });
  const [passwordFeedback, setPasswordFeedback] = useState<FeedbackState>(null);
  const [emailForm, setEmailForm] = useState({
    contactEmail: '',
    currentPassword: '',
  });
  const [emailFeedback, setEmailFeedback] = useState<FeedbackState>(null);
  const [exportFeedback, setExportFeedback] = useState<FeedbackState>(null);
  const [internalSettingsFeedback, setInternalSettingsFeedback] =
    useState<FeedbackState>(null);
  const [isSavingManagedInternals, setIsSavingManagedInternals] =
    useState(false);
  const [isRefreshingPendingEvaluations, setIsRefreshingPendingEvaluations] =
    useState(false);
  const isRefreshingDashboardRef = useRef(false);
  const [selectedInterventionKey, setSelectedInterventionKey] = useState(
    SENIOR_FALLBACK_INTERVENTION_KEY
  );
  const [selectedInternalId, setSelectedInternalId] = useState<string | null>(null);
  const internalStripRef = useRef<HTMLDivElement | null>(null);
  const populationChangeScrollYRef = useRef<number | null>(null);

  const refreshedInternalProfiles = internalProfiles;
  const refreshedManagedInternalIds = selectedSenior.managedInternalIds ?? [];
  const refreshedSavedInterventions = savedInterventions;
  const refreshedAdminEvaluations = adminEvaluations;
  const refreshedCustomSurgicalInterventions = customSurgicalInterventions;

  const alphabeticalProfiles = useMemo(
    () =>
      [...refreshedInternalProfiles].sort((left, right) =>
        formatDisplayName(left.firstName, left.lastName).localeCompare(
          formatDisplayName(right.firstName, right.lastName),
          'fr-FR',
          { sensitivity: 'base' }
        )
      ),
    [refreshedInternalProfiles]
  );

  const seniorSavedInterventions = useMemo(
    () =>
      refreshedSavedInterventions.filter(
        (intervention) => intervention.seniorId === selectedSenior.id
      ),
    [refreshedSavedInterventions, selectedSenior.id]
  );

  const pendingEvaluations = useMemo(
    () =>
      [...seniorSavedInterventions]
        .filter(
          (intervention) =>
            !hasCompleteAdminEvaluation(refreshedAdminEvaluations[intervention.id])
        )
        .sort((left, right) => right.savedAt.localeCompare(left.savedAt)),
    [refreshedAdminEvaluations, seniorSavedInterventions]
  );

  const refreshPendingEvaluations = useCallback(async () => {
    if (isRefreshingDashboardRef.current) {
      return;
    }

    isRefreshingDashboardRef.current = true;
    setIsRefreshingPendingEvaluations(true);

    try {
      await refreshBackendData();
    } catch (error) {
      console.warn('Unable to refresh pending senior evaluations.', error);
    } finally {
      isRefreshingDashboardRef.current = false;
      setIsRefreshingPendingEvaluations(false);
    }
  }, [refreshBackendData]);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshPendingEvaluations();
      }
    };

    void refreshPendingEvaluations();
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshPendingEvaluations]);

  const isNativeApp =
    typeof window !== 'undefined' &&
    Boolean(
      (window as Window & { __MONJDB_NATIVE_APP__?: boolean })
        .__MONJDB_NATIVE_APP__
    );

  const relatedProfilesByRecency = useMemo(() => {
    const latestByInternal = new Map<string, string>();

    seniorSavedInterventions.forEach((intervention) => {
      if (!intervention.internalId) {
        return;
      }

      const current = latestByInternal.get(intervention.internalId);

      if (!current || current < intervention.savedAt) {
        latestByInternal.set(intervention.internalId, intervention.savedAt);
      }
    });

    return Array.from(latestByInternal.entries())
      .sort((left, right) => right[1].localeCompare(left[1]))
      .map(([internalId]) =>
        refreshedInternalProfiles.find((profile) => profile.id === internalId) ?? null
      )
      .filter((profile): profile is InternalProfile => profile != null);
  }, [refreshedInternalProfiles, seniorSavedInterventions]);

  const managedProfiles = useMemo(
    () =>
      alphabeticalProfiles.filter((profile) =>
        refreshedManagedInternalIds.includes(profile.id)
      ),
    [alphabeticalProfiles, refreshedManagedInternalIds]
  );

  const visibleProfiles = useMemo(() => {
    if (populationFilter === 'all') {
      return alphabeticalProfiles;
    }

    if (populationFilter === 'mine') {
      return managedProfiles;
    }

    return relatedProfilesByRecency;
  }, [
    managedProfiles,
    populationFilter,
    relatedProfilesByRecency,
  ]);
  const activePopulationOption =
    SENIOR_POPULATION_OPTIONS.find(
      (option) => option.value === populationFilter
    ) ?? SENIOR_POPULATION_OPTIONS[0];
  const activePopulationIndex = SENIOR_POPULATION_OPTIONS.findIndex(
    (option) => option.value === populationFilter
  );
  const nextPopulationOption =
    SENIOR_POPULATION_OPTIONS[
      (activePopulationIndex + 1) % SENIOR_POPULATION_OPTIONS.length
    ];

  const selectedInternal =
    visibleProfiles.find((profile) => profile.id === selectedInternalId) ??
    visibleProfiles[0] ??
    null;

  const selectedInternalSavedInterventions = useMemo(() => {
    if (!selectedInternal) return [];

    return refreshedSavedInterventions.filter(
      (intervention) => intervention.internalId === selectedInternal.id
    );
  }, [refreshedSavedInterventions, selectedInternal]);

  useEffect(() => {
    if (!isInternalSettingsSheetOpen) {
      return;
    }

    setManagedInternalIdsDraft(refreshedManagedInternalIds);
    setInternalSettingsFeedback(null);
    setIsSavingManagedInternals(false);
  }, [isInternalSettingsSheetOpen, refreshedManagedInternalIds]);

  useEffect(() => {
    if (!isPasswordSheetOpen) {
      return;
    }

    setPasswordForm({
      currentPassword: '',
      nextPassword: '',
      confirmPassword: '',
    });
    setPasswordFeedback(null);
  }, [isPasswordSheetOpen]);

  useEffect(() => {
    if (
      selectedInternalId &&
      visibleProfiles.some((profile) => profile.id === selectedInternalId)
    ) {
      return;
    }

    setSelectedInternalId(visibleProfiles[0]?.id ?? null);
  }, [selectedInternalId, visibleProfiles]);

  useLayoutEffect(() => {
    const scrollY = populationChangeScrollYRef.current;

    if (scrollY == null || typeof window === 'undefined') return;

    if (internalStripRef.current) {
      internalStripRef.current.scrollLeft = 0;
    }

    window.scrollTo({
      behavior: 'auto',
      left: window.scrollX,
      top: scrollY,
    });
    populationChangeScrollYRef.current = null;
  }, [populationFilter]);

  useEffect(() => {
    saveSeniorDashboardNavigationState({ populationFilter });
  }, [populationFilter]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (internalStripRef.current) {
        internalStripRef.current.scrollLeft =
          initialNavigationState.internalStripScrollLeft;
      }

      window.scrollTo({
        behavior: 'auto',
        top: initialNavigationState.windowScrollY,
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [initialNavigationState]);

  const handleSupportClick = () => {
    setIsSettingsMenuOpen(false);

    if (typeof window !== 'undefined') {
      window.location.href = buildSupportMailto({
        body: [
          'Bonjour,',
          '',
          'Je rencontre le problème suivant :',
          '',
          '[Décrivez votre demande ici]',
          '',
          `Nom : Dr ${seniorName}`,
          `Établissement : ${selectedSenior.institution}`,
          'Espace : Senior',
        ].join('\n'),
        subject: 'Support espace senior',
      });
    }
  };

  const handleInstitutionExport = () => {
    setIsSettingsMenuOpen(false);
    setExportFeedback(null);

    try {
      const exportedCount = downloadSeniorInstitutionInterventionsExcel(
        selectedSenior,
        refreshedSavedInterventions,
        refreshedInternalProfiles,
        refreshedCustomSurgicalInterventions,
        refreshedAdminEvaluations,
        selectableSeniors
      );

      setExportFeedback(
        exportedCount > 0
          ? {
              kind: 'success',
              message: `${exportedCount} intervention${
                exportedCount > 1 ? 's' : ''
              } de l’établissement exportée${exportedCount > 1 ? 's' : ''}.`,
            }
          : {
              kind: 'error',
              message: 'Aucune intervention de l’établissement à exporter.',
            }
      );
    } catch (error) {
      setExportFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Impossible de préparer l’export.',
      });
    }
  };

  const toggleManagedInternal = (internalId: string) => {
    setManagedInternalIdsDraft((current) =>
      current.includes(internalId)
        ? current.filter((id) => id !== internalId)
        : [...current, internalId]
    );
  };

  const handleSaveManagedInternals = async () => {
    setInternalSettingsFeedback(null);
    setIsSavingManagedInternals(true);

    try {
      await updateSeniorManagedInternals(
        selectedSenior.id,
        managedInternalIdsDraft
      );
      await refreshPendingEvaluations();
      setPopulationFilter('mine');
      setIsInternalSettingsSheetOpen(false);
    } catch (error) {
      setInternalSettingsFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Impossible d’enregistrer votre sélection.',
      });
    } finally {
      setIsSavingManagedInternals(false);
    }
  };

  const handlePasswordFieldChange = (
    field: 'currentPassword' | 'nextPassword' | 'confirmPassword',
    value: string
  ) => {
    setPasswordForm((current) => ({
      ...current,
      [field]: value,
    }));
    setPasswordFeedback(null);
  };

  const handleSaveSeniorPassword = async () => {
    const currentPassword = passwordForm.currentPassword;
    const nextPassword = passwordForm.nextPassword;
    const confirmPassword = passwordForm.confirmPassword;

    if (!currentPassword) {
      setPasswordFeedback({
        kind: 'error',
        message: 'Renseigne le mot de passe actuel.',
      });
      return;
    }

    if (!nextPassword || !confirmPassword) {
      setPasswordFeedback({
        kind: 'error',
        message: 'Renseigne le nouveau mot de passe et sa confirmation.',
      });
      return;
    }

    const passwordValidation = validatePasswordStrength(nextPassword);

    if (!passwordValidation.isValid) {
      setPasswordFeedback({
        kind: 'error',
        message: passwordValidation.message,
      });
      return;
    }

    if (nextPassword !== confirmPassword) {
      setPasswordFeedback({
        kind: 'error',
        message: 'La confirmation du nouveau mot de passe ne correspond pas.',
      });
      return;
    }

    const result = await updateSeniorCredentials(selectedSenior.id, {
      currentPassword,
      loginId: selectedSenior.loginId ?? '',
      mustChangePassword: false,
      password: nextPassword,
    });

    setPasswordFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.success
        ? 'Le mot de passe a bien été mis à jour.'
        : result.message,
    });

    if (!result.success) {
      return;
    }

    setPasswordForm({
      currentPassword: '',
      nextPassword: '',
      confirmPassword: '',
    });
  };

  const handleRequestEmailChange = async () => {
    setEmailFeedback(null);
    const result = await requestEmailChange(
      emailForm.contactEmail,
      emailForm.currentPassword
    );

    setEmailFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.message,
    });

    if (result.success) {
      setEmailForm({ contactEmail: '', currentPassword: '' });
    }
  };

  const handleEvaluateIntervention = (interventionId: string) => {
    saveSeniorDashboardNavigationState(
      {
        internalStripScrollLeft: internalStripRef.current?.scrollLeft ?? 0,
        populationFilter,
        windowScrollY: window.scrollY,
      }
    );
    setIsPendingEvaluationsSheetOpen(false);
    onEvaluate(interventionId);
  };

  const scrollInternalStrip = (direction: 'left' | 'right') => {
    internalStripRef.current?.scrollBy({
      left: direction === 'left' ? -280 : 280,
      behavior: 'smooth',
    });
  };

  const cyclePopulationFilter = () => {
    if (typeof window !== 'undefined') {
      populationChangeScrollYRef.current = window.scrollY;
    }

    setPopulationFilter(nextPopulationOption.value);
  };

  const renderPendingEvaluationCard = (intervention: SavedIntervention) => {
    const internal =
      getInternalById(intervention.internalId, refreshedInternalProfiles) ?? null;
    const procedureLabel = getChoiceLabel(
      surgicalProcedureOptions,
      intervention.procedure
    );

    return (
      <button
        className="senior-evaluation-card senior-evaluation-card--clickable"
        key={intervention.id}
        onClick={() => handleEvaluateIntervention(intervention.id)}
        type="button"
      >
        <ApproachIcon intervention={intervention} />
        <div className="senior-evaluation-card__content">
          <div className="senior-evaluation-card__headline">
            <span className="senior-evaluation-card__date">
              {formatLongFrenchDate(intervention.date)}
            </span>
            <span className="senior-evaluation-card__separator" aria-hidden="true">
              |
            </span>
            <strong>
              {formatSeniorInterventionLabel(
                procedureLabel,
                intervention.procedure,
                intervention.approach
              )}
            </strong>
          </div>
          <span className="senior-evaluation-card__internal">
            Interne :{' '}
            {internal
              ? formatDisplayName(internal.firstName, internal.lastName)
              : 'Interne non retrouvé'}
          </span>
        </div>
        <span className="senior-evaluation-card__action">
          <span>Évaluer</span>
          <ChevronRight aria-hidden="true" />
        </span>
      </button>
    );
  };

  const internalSelector = (
    <div className="senior-internal-strip-shell">
      <button
        aria-label="Faire défiler la liste des internes vers la gauche"
        className="senior-strip-arrow"
        onClick={() => scrollInternalStrip('left')}
        type="button"
      >
        <ChevronLeft aria-hidden="true" />
      </button>

      <button
        aria-label={`${activePopulationOption.label}. Afficher ensuite : ${nextPopulationOption.label}`}
        className="senior-internal-card senior-internal-card--selected senior-population-cycle-card"
        data-senior-population-filter={populationFilter}
        onClick={cyclePopulationFilter}
        type="button"
      >
        <span className="senior-avatar senior-avatar--blue" aria-hidden="true">
          <Users />
        </span>
        <span className="senior-internal-card__copy senior-population-cycle-card__copy">
          <strong>{activePopulationOption.label}</strong>
        </span>
        <RefreshCw
          aria-hidden="true"
          className="senior-population-cycle-card__icon"
        />
      </button>

      <div className="senior-internal-strip" ref={internalStripRef}>
        {visibleProfiles.map((profile) => {
          const isSelected = profile.id === selectedInternal?.id;
          const semesterTone = getSeniorSemesterTone(profile.semester);

          return (
            <button
              aria-pressed={isSelected}
              className={`senior-internal-card ${
                isSelected ? 'senior-internal-card--selected' : ''
              }`.trim()}
              key={profile.id}
              onClick={() => setSelectedInternalId(profile.id)}
              type="button"
            >
              <span
                className={`senior-avatar senior-avatar--${semesterTone}`}
                aria-hidden="true"
              >
                <UserRound />
              </span>
              <span className="senior-internal-card__copy">
                <strong>
                  {formatDisplayName(profile.firstName, profile.lastName)}
                </strong>
                <span>{profile.semester}</span>
              </span>
            </button>
          );
        })}
      </div>

      <button
        aria-label="Faire défiler la liste des internes vers la droite"
        className="senior-strip-arrow"
        onClick={() => scrollInternalStrip('right')}
        type="button"
      >
        <ChevronRight aria-hidden="true" />
      </button>
    </div>
  );

  const internalStatistics = selectedInternal ? (
    <InternalStatisticsPanel
      adminEvaluations={refreshedAdminEvaluations}
      customSurgicalInterventions={refreshedCustomSurgicalInterventions}
      internalId={selectedInternal.id}
      interventions={selectedInternalSavedInterventions}
      onSelectedProcedureKeyChange={setSelectedInterventionKey}
      selectableSeniors={selectableSeniors}
      selectedProcedureKey={selectedInterventionKey}
      surgicalProcedureOptions={surgicalProcedureOptions}
    />
  ) : (
    <div className="validation-box">
      <strong>Aucun interne disponible</strong>
      <span>
        {populationFilter === 'recent'
          ? 'Les internes ayant récemment enregistré une intervention avec ce senior référent apparaîtront ici.'
          : populationFilter === 'mine'
            ? 'Les internes ajoutés dans "Mes internes" apparaîtront ici.'
            : 'Les profils internes apparaîtront ici dès qu’ils seront créés.'}
      </span>
    </div>
  );

  return (
    <ScreenContainer
      bodyClassName={
        isNativeApp ? undefined : 'senior-screen__body senior-screen__body--web-panorama'
      }
      eyebrow={isNativeApp ? undefined : 'Espace senior'}
      frameWidth="wide"
      heroClassName="senior-screen__hero"
      shellClassName={`dashboard-screen senior-screen ${
        isNativeApp
          ? 'monjdb-native-senior-screen'
          : 'senior-screen--web-panorama'
      }`.trim()}
      title={`Dr ${seniorName}`}
      subtitle={`Service de gynécologie-obstétrique – ${selectedSenior.institution}`}
      headerAction={
        <div className="senior-header-actions">
          {isNativeApp ? null : (
            <button
              className="senior-header-support-button"
              onClick={handleSupportClick}
              type="button"
            >
              <Mail aria-hidden="true" />
              <span>Support</span>
            </button>
          )}
          <div className="senior-settings">
            <button
              aria-expanded={isSettingsMenuOpen}
              aria-haspopup="menu"
              aria-label="Ouvrir le menu senior"
              className="senior-settings__button"
              onClick={() => setIsSettingsMenuOpen((current) => !current)}
              type="button"
            >
              <Settings aria-hidden="true" />
            </button>

            {isSettingsMenuOpen ? (
              <div className="senior-settings__menu" role="menu">
                <button
                  className={`senior-settings__menu-item ${
                    isNativeApp ? 'monjdb-native-internal-settings-button' : ''
                  }`.trim()}
                  onClick={() => {
                    setIsSettingsMenuOpen(false);
                    setIsInternalSettingsSheetOpen(true);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Users aria-hidden="true" />
                  <span>Configurer mes internes</span>
                </button>
                <button
                  className="senior-settings__menu-item"
                  onClick={() => {
                    setIsSettingsMenuOpen(false);
                    setEmailForm({ contactEmail: '', currentPassword: '' });
                    setEmailFeedback(null);
                    setIsEmailSheetOpen(true);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Mail aria-hidden="true" />
                  <span>Modifier l’adresse e-mail</span>
                </button>
                <button
                  className="senior-settings__menu-item"
                  onClick={() => {
                    setIsSettingsMenuOpen(false);
                    setIsPasswordSheetOpen(true);
                  }}
                  role="menuitem"
                  type="button"
                >
                  <Pencil aria-hidden="true" />
                  <span>Modifier le mot de passe</span>
                </button>
                <button
                  className="senior-settings__menu-item"
                  onClick={handleInstitutionExport}
                  role="menuitem"
                  type="button"
                >
                  <FileDown aria-hidden="true" />
                  <span>Exporter les interventions</span>
                </button>
                {isNativeApp ? (
                  <button
                    className="senior-settings__menu-item monjdb-native-support-button"
                    onClick={handleSupportClick}
                    role="menuitem"
                    type="button"
                  >
                    <Mail aria-hidden="true" />
                    <span>Contacter le support</span>
                  </button>
                ) : null}
                <button
                  className={`senior-settings__menu-item senior-settings__menu-item--danger ${
                    isNativeApp ? 'monjdb-native-logout-button' : ''
                  }`.trim()}
                  onClick={() => {
                    setIsSettingsMenuOpen(false);
                    onLogout();
                  }}
                  role="menuitem"
                  type="button"
                >
                  <LogOut aria-hidden="true" />
                  <span>Déconnexion</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      }
    >
      {isNativeApp ? (
        <div aria-hidden="true" className="monjdb-native-safe-area-shield" />
      ) : null}
      {!isNativeApp && exportFeedback ? (
        <div
          className={`senior-web-feedback ${
            exportFeedback.kind === 'success' ? 'auth-success' : 'auth-error'
          }`}
          role="status"
        >
          {exportFeedback.message}
        </div>
      ) : null}
      <SectionCard
        className="senior-section-card senior-evaluations-overview"
        description={
          isNativeApp
            ? undefined
            : 'Les demandes qui vous sont personnellement attribuées.'
        }
        headerAction={
          isNativeApp ? (
            <button
              aria-label="Actualiser les interventions à évaluer"
              aria-busy={isRefreshingPendingEvaluations}
              className={`monjdb-native-refresh-button ${
                isRefreshingPendingEvaluations
                  ? 'monjdb-native-refresh-button--loading'
                  : ''
              }`.trim()}
              disabled={isRefreshingPendingEvaluations}
              onClick={() => void refreshPendingEvaluations()}
              title="Actualiser"
              type="button"
            >
              <RefreshCw aria-hidden="true" />
            </button>
          ) : (
            <span className="senior-evaluation-count">
              {pendingEvaluations.length} en attente
            </span>
          )
        }
        title="Interventions à évaluer"
      >
        {pendingEvaluations.length ? (
          <>
            <div className="senior-evaluation-list">
              {pendingEvaluations
                .slice(0, pendingEvaluationsPreviewLimit)
                .map(renderPendingEvaluationCard)}
            </div>

            {pendingEvaluations.length > pendingEvaluationsPreviewLimit ? (
              <button
                className="senior-section-link"
                onClick={() => setIsPendingEvaluationsSheetOpen(true)}
                type="button"
              >
                <span>
                  Voir toutes les interventions à évaluer ({pendingEvaluations.length})
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            ) : null}
          </>
        ) : (
          <div className="validation-box">
            <strong>Aucune intervention en attente d’évaluation</strong>
            <span>Vous semblez à jour dans vos évaluations.</span>
          </div>
        )}
      </SectionCard>

      {isNativeApp ? (
        <SectionCard
          className="senior-section-card"
          description="Consultez les statistiques détaillées par type d’intervention."
          title="Aperçu des statistiques par interne"
        >
          {internalSelector}
          {internalStatistics}
        </SectionCard>
      ) : (
        <>
          <SectionCard
            className="senior-section-card senior-internal-selector-card"
            description="Tous les internes de votre établissement restent consultables."
            title="Choisir un interne"
          >
            {internalSelector}
          </SectionCard>
          <SectionCard
            className="senior-section-card senior-statistics-card"
            description="Autonomie selon les filtres sélectionnés."
            title={
              selectedInternal
                ? `Progression de ${formatDisplayName(
                    selectedInternal.firstName,
                    selectedInternal.lastName
                  )}`
                : 'Progression'
            }
          >
            {internalStatistics}
          </SectionCard>
        </>
      )}

      {isNativeApp ? (
        <SectionCard className="senior-section-card">
          {exportFeedback ? (
            <div
              className={
                exportFeedback.kind === 'success' ? 'auth-success' : 'auth-error'
              }
              role="status"
            >
              {exportFeedback.message}
            </div>
          ) : null}
          <div className="action-stack">
            <PrimaryButton
              label="Contacter le support"
              onPress={handleSupportClick}
              variant="secondary"
            />
            <PrimaryButton
              label="Se déconnecter"
              onPress={onLogout}
              variant="danger"
            />
          </div>
        </SectionCard>
      ) : null}

      {isInternalSettingsSheetOpen ? (
        <div
          className="account-sheet-backdrop"
          onClick={() => setIsInternalSettingsSheetOpen(false)}
        >
          <div
            aria-labelledby="senior-internal-settings-title"
            aria-modal="true"
            className="account-sheet senior-account-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="account-sheet__header">
              <div className="account-sheet__heading">
                <h3 id="senior-internal-settings-title">Mes paramètres internes</h3>
                <p className="account-sheet__text">
                  Choisissez les internes qui alimentent le filtre “Mes internes”.
                </p>
              </div>
              <button
                aria-label="Fermer la fenêtre des paramètres internes"
                className="account-sheet__close"
                onClick={() => setIsInternalSettingsSheetOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="senior-account-sheet__section">
              <div className="senior-account-sheet__section-header">
                <strong>Mes internes</strong>
                <span>
                  {managedInternalIdsDraft.length} sélectionné
                  {managedInternalIdsDraft.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="senior-account-sheet__list">
                {alphabeticalProfiles.map((profile) => {
                  const isSelected = managedInternalIdsDraft.includes(profile.id);

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`senior-account-internal ${
                        isSelected ? 'senior-account-internal--selected' : ''
                      }`.trim()}
                      key={profile.id}
                      onClick={() => toggleManagedInternal(profile.id)}
                      type="button"
                    >
                      <span className="senior-account-internal__copy">
                        <strong>
                          {formatDisplayName(profile.firstName, profile.lastName)}
                        </strong>
                        <span>{profile.semester}</span>
                      </span>
                      <span
                        className={`senior-account-internal__check ${
                          isSelected ? 'senior-account-internal__check--selected' : ''
                        }`.trim()}
                        aria-hidden="true"
                      >
                        <Check />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {internalSettingsFeedback ? (
              <div className="auth-error" role="alert">
                {internalSettingsFeedback.message}
              </div>
            ) : null}

            <div className="account-sheet__actions account-sheet__actions--split">
              <button
                className="account-button"
                disabled={isSavingManagedInternals}
                onClick={() => setIsInternalSettingsSheetOpen(false)}
                type="button"
              >
                Fermer
              </button>
              <button
                className="flow-button flow-button--primary"
                disabled={isSavingManagedInternals}
                onClick={handleSaveManagedInternals}
                type="button"
              >
                {isSavingManagedInternals ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPasswordSheetOpen ? (
        <div
          className="account-sheet-backdrop"
          onClick={() => setIsPasswordSheetOpen(false)}
        >
          <div
            aria-labelledby="senior-password-settings-title"
            aria-modal="true"
            className="account-sheet senior-account-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="account-sheet__header">
              <div className="account-sheet__heading">
                <h3 id="senior-password-settings-title">Modifier mot de passe</h3>
                <p className="account-sheet__text">
                  Mettez à jour votre mot de passe à tout moment.
                </p>
              </div>
              <button
                aria-label="Fermer la fenêtre de modification du mot de passe"
                className="account-sheet__close"
                onClick={() => setIsPasswordSheetOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            {passwordFeedback ? (
              <div className={passwordFeedback.kind === 'success' ? 'auth-success' : 'auth-error'}>
                {passwordFeedback.message}
              </div>
            ) : null}

            <div className="account-sheet__stack">
              <label className="account-sheet__field">
                <span>Mot de passe actuel</span>
                <input
                  autoComplete="current-password"
                  className="account-sheet__input"
                  onChange={(event) =>
                    handlePasswordFieldChange('currentPassword', event.target.value)
                  }
                  required
                  type="password"
                  value={passwordForm.currentPassword}
                />
              </label>

              <label className="account-sheet__field">
                <span>Nouveau mot de passe</span>
                <input
                  autoComplete="new-password"
                  className="account-sheet__input"
                  onChange={(event) =>
                    handlePasswordFieldChange('nextPassword', event.target.value)
                  }
                  minLength={8}
                  required
                  type="password"
                  value={passwordForm.nextPassword}
                />
              </label>

              <label className="account-sheet__field">
                <span>Confirmer le nouveau mot de passe</span>
                <input
                  autoComplete="new-password"
                  className="account-sheet__input"
                  onChange={(event) =>
                    handlePasswordFieldChange('confirmPassword', event.target.value)
                  }
                  minLength={8}
                  required
                  type="password"
                  value={passwordForm.confirmPassword}
                />
              </label>
            </div>

            <p className="field-helper">{PASSWORD_POLICY_HELP}</p>

            <div className="account-sheet__actions account-sheet__actions--split">
              <button
                className="account-button"
                onClick={() => setIsPasswordSheetOpen(false)}
                type="button"
              >
                Fermer
              </button>
              <button
                className="flow-button flow-button--primary"
                onClick={handleSaveSeniorPassword}
                type="button"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEmailSheetOpen ? (
        <div
          className="account-sheet-backdrop"
          onClick={() => setIsEmailSheetOpen(false)}
        >
          <div
            aria-labelledby="senior-email-settings-title"
            aria-modal="true"
            className="account-sheet senior-account-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="account-sheet__header">
              <div className="account-sheet__heading">
                <h3 id="senior-email-settings-title">Modifier l’adresse e-mail</h3>
                <p className="account-sheet__text">
                  La nouvelle adresse sera utilisée après confirmation du lien reçu.
                </p>
              </div>
              <button
                aria-label="Fermer la fenêtre de modification de l’adresse e-mail"
                className="account-sheet__close"
                onClick={() => setIsEmailSheetOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            {emailFeedback ? (
              <div
                className={
                  emailFeedback.kind === 'success' ? 'auth-success' : 'auth-error'
                }
                role="status"
              >
                {emailFeedback.message}
              </div>
            ) : null}

            <div className="account-sheet__stack">
              <p className="account-sheet__text">
                Adresse actuelle :{' '}
                <strong>{selectedSenior.contactEmail || 'Non renseignée'}</strong>
              </p>
              <label className="account-sheet__field">
                <span>Nouvelle adresse e-mail</span>
                <input
                  autoCapitalize="none"
                  autoComplete="email"
                  className="account-sheet__input"
                  onChange={(event) => {
                    setEmailForm((current) => ({
                      ...current,
                      contactEmail: event.target.value,
                    }));
                    setEmailFeedback(null);
                  }}
                  required
                  type="email"
                  value={emailForm.contactEmail}
                />
              </label>
              <label className="account-sheet__field">
                <span>Mot de passe actuel</span>
                <input
                  autoComplete="current-password"
                  className="account-sheet__input"
                  onChange={(event) => {
                    setEmailForm((current) => ({
                      ...current,
                      currentPassword: event.target.value,
                    }));
                    setEmailFeedback(null);
                  }}
                  required
                  type="password"
                  value={emailForm.currentPassword}
                />
              </label>
            </div>

            <div className="account-sheet__actions account-sheet__actions--split">
              <button
                className="account-button"
                onClick={() => setIsEmailSheetOpen(false)}
                type="button"
              >
                Fermer
              </button>
              <button
                className="flow-button flow-button--primary"
                onClick={handleRequestEmailChange}
                type="button"
              >
                Envoyer le lien de confirmation
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPendingEvaluationsSheetOpen ? (
        <div
          className="account-sheet-backdrop"
          onClick={() => setIsPendingEvaluationsSheetOpen(false)}
        >
          <div
            aria-labelledby="pending-evaluations-sheet-title"
            aria-modal="true"
            className="account-sheet senior-evaluations-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="account-sheet__header">
              <div className="account-sheet__heading">
                <h3 id="pending-evaluations-sheet-title">
                  Interventions à évaluer
                </h3>
                <p>
                  Retrouvez l’ensemble des interventions en attente pour ce
                  senior.
                </p>
              </div>
              <button
                aria-label="Fermer la fenêtre des interventions à évaluer"
                className="account-sheet__close"
                onClick={() => setIsPendingEvaluationsSheetOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="senior-account-sheet__section">
              <div className="senior-account-sheet__section-header">
                <strong>{pendingEvaluations.length} intervention(s)</strong>
                <span>Liste complète</span>
              </div>
              <div className="senior-evaluation-list senior-evaluation-list--sheet">
                {pendingEvaluations.map(renderPendingEvaluationCard)}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </ScreenContainer>
  );
}
