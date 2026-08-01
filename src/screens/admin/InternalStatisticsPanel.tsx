import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  FolderOpen,
  Search,
  UserRound,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  ApproachIcon,
  getInterventionApproachLabel,
} from '../../components/ApproachIcon';
import { AutonomyLineChart } from '../../components/AutonomyLineChart';
import { ClinicalContextOverview } from '../../components/ClinicalContextOverview';
import { SectionCard } from '../../components/SectionCard';
import {
  formatSeniorDisplayName,
  formatSurgeryContext,
  getHistoricalChecklistSteps,
  getChoiceLabel,
  roleOptions,
} from '../../data/mockData';
import {
  SENIOR_DIFFICULTY_LABELS,
  SENIOR_PERFORMANCE_LABELS,
} from '../../data/seniorEvaluationLabels';
import type {
  AdminInterventionEvaluation,
  ChecklistLevel,
  ChoiceOption,
  InterventionType,
  SavedIntervention,
  Senior,
  SurgicalApproach,
  SurgicalInterventionDefinition,
} from '../../types';
import { formatIsoDate } from '../../utils/date';
import { getAuthoritativeChecklist } from '../../utils/evaluationChecklist';
import {
  calculateAutonomyScore,
  INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE,
} from '../../utils/autonomyScore';
import { PROGRESS_PERIOD_OPTIONS } from '../../utils/progressStatistics';
import {
  SENIOR_HISTORY_PAGE_SIZE_OPTIONS,
  buildSeniorAutonomySeries,
  buildSeniorProgressApproachOptions,
  buildSeniorProgressProcedureOptions,
  buildSeniorStepStats,
  filterSeniorHistoryInterventions,
  filterSeniorProgressInterventions,
  formatSeniorDateTime,
  getDefaultSeniorProgressApproach,
  getDefaultSeniorProgressProcedureKey,
  getSeniorHistoryStatus,
  getSeniorHistoryStatusClassName,
  getSeniorHistoryStatusLabel,
  getSeniorIndicationLabel,
  type SeniorHistoryStatusFilter,
  type SeniorProgressPeriod,
  type SeniorStatisticsTab,
} from './seniorDashboardModel';

interface InternalStatisticsPanelProps {
  adminEvaluations: Record<string, AdminInterventionEvaluation>;
  customSurgicalInterventions: SurgicalInterventionDefinition[];
  internalId: string;
  interventions: SavedIntervention[];
  onSelectedProcedureKeyChange: (key: string) => void;
  selectedProcedureKey: string;
  selectableSeniors: Senior[];
  surgicalProcedureOptions: ChoiceOption<InterventionType>[];
}

type SeniorProgressView = 'autonomy' | 'steps';

function capitalizeFirstLetter(value: string) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return value;
  }

  return `${normalizedValue.charAt(0).toLocaleUpperCase('fr-FR')}${normalizedValue.slice(1)}`;
}

const SENIOR_HISTORY_CHECKLIST_LEVELS = ['0', '1', '2', '3', '4'] as const;

function renderSeniorHistoryChecklistScale(
  level: ChecklistLevel | null | undefined
) {
  if (level === 'NA') {
    return <strong className="history-web-step-na">NA</strong>;
  }

  if (level == null) {
    return <strong className="history-web-step-na">—</strong>;
  }

  return (
    <span
      aria-label={`Niveau d’autonomie ${level} sur 4`}
      className="history-web-step-scale"
      role="img"
    >
      {SENIOR_HISTORY_CHECKLIST_LEVELS.map((candidate) => (
        <span
          className={`history-web-step-scale__dot history-web-step-scale__dot--level-${candidate}${
            candidate === level
              ? ' history-web-step-scale__dot--selected'
              : ''
          }`}
          key={candidate}
        />
      ))}
    </span>
  );
}

function renderSeniorHistoryRatingScale(
  value: string | null | undefined,
  maximum: number,
  ariaLabel: string
) {
  const selectedValue = Number(value ?? 0);

  return (
    <span
      aria-label={ariaLabel}
      className="history-web-rating-scale"
      role="img"
      style={{ gridTemplateColumns: `repeat(${maximum}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: maximum }, (_, index) => (
        <span
          aria-hidden="true"
          className={`history-web-rating-scale__segment${
            index < selectedValue
              ? ' history-web-rating-scale__segment--active'
              : ''
          }`}
          key={index}
        />
      ))}
    </span>
  );
}

export function InternalStatisticsPanel({
  adminEvaluations,
  customSurgicalInterventions,
  internalId,
  interventions,
  onSelectedProcedureKeyChange,
  selectedProcedureKey,
  selectableSeniors,
  surgicalProcedureOptions,
}: InternalStatisticsPanelProps) {
  const isNativeApp =
    typeof window !== 'undefined' &&
    (Boolean(
      (window as Window & { __MONJDB_NATIVE_APP__?: boolean })
        .__MONJDB_NATIVE_APP__
    ) ||
      new URLSearchParams(window.location.search).get('native-app') === '1' ||
      window.navigator.userAgent.includes('MonJournalDeBlocMobile')
    );
  const [activeTab, setActiveTab] = useState<SeniorStatisticsTab>('progress');
  const [activeProgressView, setActiveProgressView] =
    useState<SeniorProgressView>('autonomy');
  const [selectedApproach, setSelectedApproach] = useState<SurgicalApproach | ''>('');
  const [progressPeriod, setProgressPeriod] =
    useState<SeniorProgressPeriod>('12m');
  const [historySearch, setHistorySearch] = useState('');
  const [historySeniorFilter, setHistorySeniorFilter] = useState('all');
  const [historyStatusFilter, setHistoryStatusFilter] =
    useState<SeniorHistoryStatusFilter>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState('');
  const [historyDateTo, setHistoryDateTo] = useState('');
  const [isHistoryPeriodExpanded, setIsHistoryPeriodExpanded] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState<number>(
    SENIOR_HISTORY_PAGE_SIZE_OPTIONS[0]
  );
  const [expandedHistoryInterventionId, setExpandedHistoryInterventionId] =
    useState<string | null>(null);
  const autoSelectedInternalIdRef = useRef<string | null>(null);
  const autoSelectedApproachKeyRef = useRef('');

  const procedureOptions = useMemo(
    () =>
      buildSeniorProgressProcedureOptions({
        definitions: customSurgicalInterventions,
        interventions,
        procedureOptions: surgicalProcedureOptions,
    }),
    [customSurgicalInterventions, interventions, surgicalProcedureOptions]
  );
  const defaultProcedureKey = useMemo(
    () => getDefaultSeniorProgressProcedureKey(interventions, procedureOptions),
    [interventions, procedureOptions]
  );
  const selectedProcedureOption =
    procedureOptions.find((option) => option.key === selectedProcedureKey) ?? null;
  const procedureFilterOptions = useMemo(() => {
    const optionsByProcedure = new Map<
      InterventionType,
      { label: string; value: InterventionType }
    >();

    procedureOptions.forEach((option) => {
      if (!optionsByProcedure.has(option.procedure)) {
        optionsByProcedure.set(option.procedure, {
          label: option.procedureLabel,
          value: option.procedure,
        });
      }
    });

    return Array.from(optionsByProcedure.values()).sort((left, right) =>
      left.label.localeCompare(right.label, 'fr-FR', { sensitivity: 'base' })
    );
  }, [procedureOptions]);
  const indicationFilterOptions = useMemo(
    () =>
      selectedProcedureOption
        ? procedureOptions.filter(
            (option) => option.procedure === selectedProcedureOption.procedure
          )
        : [],
    [procedureOptions, selectedProcedureOption]
  );
  const approachOptions = useMemo(
    () =>
      buildSeniorProgressApproachOptions(
        interventions,
        selectedProcedureOption,
        customSurgicalInterventions
      ),
    [customSurgicalInterventions, interventions, selectedProcedureOption]
  );
  const defaultApproach = useMemo(
    () =>
      getDefaultSeniorProgressApproach(
        interventions,
        selectedProcedureOption,
        approachOptions
      ),
    [approachOptions, interventions, selectedProcedureOption]
  );
  const progressInterventions = useMemo(
    () =>
      filterSeniorProgressInterventions({
        approach: selectedApproach,
        interventions,
        period: progressPeriod,
        procedureOption: selectedProcedureOption,
      }),
    [interventions, progressPeriod, selectedApproach, selectedProcedureOption]
  );
  const autonomySeries = useMemo(
    () =>
      buildSeniorAutonomySeries(
        progressInterventions,
        adminEvaluations,
        customSurgicalInterventions
      ),
    [adminEvaluations, customSurgicalInterventions, progressInterventions]
  );
  const stepStats = useMemo(
    () =>
      buildSeniorStepStats(
        progressInterventions.slice(-5),
        customSurgicalInterventions,
        adminEvaluations
      ),
    [adminEvaluations, customSurgicalInterventions, progressInterventions]
  );
  const stepGroups = useMemo(
    () =>
      [
        {
          label: 'À renforcer',
          rows: stepStats.filter(
            (step) => step.score != null && step.score < 50
          ),
          tone: 'danger',
        },
        {
          label: 'En progression',
          rows: stepStats.filter(
            (step) => step.score != null && step.score >= 50 && step.score < 75
          ),
          tone: 'warning',
        },
        {
          label: 'Maîtrisé',
          rows: stepStats.filter(
            (step) => step.score != null && step.score >= 75
          ),
          tone: 'success',
        },
      ].filter((group) => group.rows.length > 0),
    [stepStats]
  );
  const hasProgressVisualizationData =
    autonomySeries.length > 0 || stepGroups.length > 0;
  const shouldShowWebEvaluationEmptyState =
    !isNativeApp &&
    progressInterventions.length > 0 &&
    !hasProgressVisualizationData;
  const historyRows = useMemo(
    () =>
      filterSeniorHistoryInterventions({
        dateFrom: historyDateFrom,
        dateTo: historyDateTo,
        evaluations: adminEvaluations,
        interventions,
        procedureOptions: surgicalProcedureOptions,
        search: historySearch,
        seniorFilter: historySeniorFilter,
        seniors: selectableSeniors,
        statusFilter: historyStatusFilter,
      }),
    [
      adminEvaluations,
      historyDateFrom,
      historyDateTo,
      historySearch,
      historySeniorFilter,
      historyStatusFilter,
      interventions,
      selectableSeniors,
      surgicalProcedureOptions,
    ]
  );
  const historyPageCount = Math.max(1, Math.ceil(historyRows.length / historyPageSize));
  const paginatedHistoryRows = historyRows.slice(
    (historyPage - 1) * historyPageSize,
    historyPage * historyPageSize
  );
  const historyStart = historyRows.length
    ? (historyPage - 1) * historyPageSize + 1
    : 0;
  const historyEnd = Math.min(historyPage * historyPageSize, historyRows.length);
  const isNativeHistoryDetail =
    isNativeApp && expandedHistoryInterventionId != null;
  const displayedHistoryRows = isNativeHistoryDetail
    ? paginatedHistoryRows.filter(
        (intervention) => intervention.id === expandedHistoryInterventionId
      )
    : paginatedHistoryRows;
  const webSelectedHistoryIntervention = isNativeApp
    ? null
    : (paginatedHistoryRows.find(
        (intervention) =>
          intervention.id === expandedHistoryInterventionId &&
          getSeniorHistoryStatus(adminEvaluations[intervention.id]) ===
            'evaluated'
      ) ??
      paginatedHistoryRows.find(
        (intervention) =>
          getSeniorHistoryStatus(adminEvaluations[intervention.id]) ===
          'evaluated'
      ) ??
      null);
  const historyPeriodLabel = (() => {
    if (historyDateFrom && historyDateTo) {
      return `${formatIsoDate(historyDateFrom)} – ${formatIsoDate(historyDateTo)}`;
    }

    if (historyDateFrom) return `Depuis le ${formatIsoDate(historyDateFrom)}`;
    if (historyDateTo) return `Jusqu’au ${formatIsoDate(historyDateTo)}`;

    return 'Toutes les dates';
  })();

  useEffect(() => {
    const internalChanged = autoSelectedInternalIdRef.current !== internalId;
    const currentKeyExists = procedureOptions.some(
      (option) => option.key === selectedProcedureKey
    );

    if (internalChanged) {
      autoSelectedInternalIdRef.current = internalId;
      if (selectedProcedureKey !== defaultProcedureKey) {
        onSelectedProcedureKeyChange(defaultProcedureKey);
      }
      return;
    }

    if (!currentKeyExists && selectedProcedureKey !== defaultProcedureKey) {
      onSelectedProcedureKeyChange(defaultProcedureKey);
    }
  }, [
    defaultProcedureKey,
    internalId,
    onSelectedProcedureKeyChange,
    procedureOptions,
    selectedProcedureKey,
  ]);

  useEffect(() => {
    const selectionKey = `${internalId}::${selectedProcedureKey}`;
    const selectionChanged = autoSelectedApproachKeyRef.current !== selectionKey;
    const currentApproachExists =
      selectedApproach === '' ||
      approachOptions.some((option) => option.value === selectedApproach);

    if (selectionChanged) {
      autoSelectedApproachKeyRef.current = selectionKey;
      setSelectedApproach(defaultApproach);
      return;
    }

    if (!currentApproachExists && selectedApproach !== defaultApproach) {
      setSelectedApproach(defaultApproach);
    }
  }, [
    approachOptions,
    defaultApproach,
    internalId,
    selectedApproach,
    selectedProcedureKey,
  ]);

  useEffect(() => {
    setHistoryPage(1);
  }, [
    historyDateFrom,
    historyDateTo,
    historyPageSize,
    historySearch,
    historySeniorFilter,
    historyStatusFilter,
    internalId,
  ]);

  useEffect(() => {
    if (historyPage > historyPageCount) setHistoryPage(historyPageCount);
  }, [historyPage, historyPageCount]);

  useEffect(() => {
    setExpandedHistoryInterventionId(null);
    setIsHistoryPeriodExpanded(false);
  }, [internalId]);

  const autonomyPanel = (
    <SectionCard
      className={`admin-profile-progress-panel progress-chart-card ${
        isNativeApp
          ? ''
          : 'senior-progress-comparison__panel senior-progress-comparison__autonomy'
      }`.trim()}
      headerAction={
        isNativeApp ? undefined : (
          <span
            aria-hidden="true"
            className="senior-progress-comparison__heading-icon"
          >
            <BarChart3 />
          </span>
        )
      }
      title={isNativeApp ? undefined : 'Évolution autonomie'}
    >
      {autonomySeries.length ? (
        <AutonomyLineChart
          ariaLabel="Évolution du score d’autonomie de l’interne sélectionné"
          series={autonomySeries}
        />
      ) : (
        <div className="validation-box">
          <strong>Aucune autonomie évaluée pour cette sélection</strong>
          <span>
            La courbe apparaîtra dès qu’au moins une intervention évaluée aura un
            score d’autonomie.
          </span>
        </div>
      )}
    </SectionCard>
  );

  const stepsPanel = (
    <SectionCard
      className={`admin-profile-progress-panel progress-steps-card ${
        isNativeApp
          ? ''
          : 'senior-progress-comparison__panel senior-progress-comparison__steps'
      }`.trim()}
      description="Maîtrise des étapes sur vos 5 dernières interventions."
      headerAction={
        isNativeApp ? undefined : (
          <span
            aria-hidden="true"
            className="senior-progress-comparison__heading-icon"
          >
            <Clock3 />
          </span>
        )
      }
      title="Analyse par temps opératoire"
    >
      {stepGroups.length ? (
        <div className="progress-steps-list">
          {stepGroups.map((group) => (
            <section
              className={`progress-step-group progress-step-group--${group.tone}`}
              key={group.tone}
            >
              <h3>
                {group.label} <span aria-hidden="true">·</span>{' '}
                {group.rows.length}
              </h3>
              <div className="progress-step-group__rows">
                {group.rows.map((step) => (
                  <div className="progress-step-row" key={step.id}>
                    <span>{step.label}</span>
                    <strong>{step.score}%</strong>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="validation-box">
          <strong>Aucun temps opératoire disponible</strong>
          <span>
            Les étapes apparaîtront ici dès qu’un bloc correspondant sera
            enregistré.
          </span>
        </div>
      )}
    </SectionCard>
  );

  return (
    <div className="senior-profile-stats-detail">
      {isNativeHistoryDetail ? null : (
        <div
          aria-label="Onglets statistiques"
          className="admin-profile-stats-tabs"
          role="tablist"
        >
          <button
            aria-controls="senior-progress-panel"
            aria-selected={activeTab === 'progress'}
            className={`admin-profile-stats-tab ${
              activeTab === 'progress' ? 'admin-profile-stats-tab--active' : ''
            }`}
            onClick={() => setActiveTab('progress')}
            role="tab"
            type="button"
          >
            <BarChart3 aria-hidden="true" />
            <span>Progression</span>
          </button>
          <button
            aria-controls="senior-history-panel"
            aria-selected={activeTab === 'history'}
            className={`admin-profile-stats-tab ${
              activeTab === 'history' ? 'admin-profile-stats-tab--active' : ''
            }`}
            onClick={() => setActiveTab('history')}
            role="tab"
            type="button"
          >
            <FolderOpen aria-hidden="true" />
            <span>Historique</span>
          </button>
        </div>
      )}

      {activeTab === 'history' ? (
        <div id="senior-history-panel" role="tabpanel">
          {isNativeHistoryDetail ? (
            <button
              className="monjdb-native-history-detail-back"
              onClick={() => setExpandedHistoryInterventionId(null)}
              type="button"
            >
              <ArrowLeft aria-hidden="true" />
              <span>Retour</span>
            </button>
          ) : isNativeApp ? (
            <div className="monjdb-native-history-filters">
              <label className="monjdb-native-history-search">
                <Search aria-hidden="true" />
                <input
                  aria-label="Rechercher une intervention"
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Rechercher une intervention"
                  type="search"
                  value={historySearch}
                />
              </label>

              <div className="monjdb-native-history-filter-grid">
                <label className="monjdb-native-history-filter">
                  <span>Senior</span>
                  <span className="monjdb-native-history-filter__control">
                    <select
                      aria-label="Filtrer par senior"
                      onChange={(event) =>
                        setHistorySeniorFilter(event.target.value)
                      }
                      value={historySeniorFilter}
                    >
                      <option value="all">Tous</option>
                      {selectableSeniors
                        .filter((senior) => senior.id !== 'sen-other')
                        .map((senior) => (
                          <option key={senior.id} value={senior.id}>
                            {formatSeniorDisplayName(senior)}
                          </option>
                        ))}
                    </select>
                    <ChevronDown aria-hidden="true" />
                  </span>
                </label>
                <label className="monjdb-native-history-filter">
                  <span>Statut</span>
                  <span className="monjdb-native-history-filter__control">
                    <select
                      aria-label="Filtrer par statut"
                      onChange={(event) =>
                        setHistoryStatusFilter(
                          event.target.value as SeniorHistoryStatusFilter
                        )
                      }
                      value={historyStatusFilter}
                    >
                      <option value="all">Tous</option>
                      <option value="evaluated">Évaluée</option>
                      <option value="pending">En attente</option>
                    </select>
                    <ChevronDown aria-hidden="true" />
                  </span>
                </label>
              </div>

              <button
                aria-expanded={isHistoryPeriodExpanded}
                className="monjdb-native-history-period-button"
                onClick={() =>
                  setIsHistoryPeriodExpanded((current) => !current)
                }
                type="button"
              >
                <CalendarDays aria-hidden="true" />
                <span>{historyPeriodLabel}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={
                    isHistoryPeriodExpanded
                      ? 'monjdb-native-history-period-button__chevron monjdb-native-history-period-button__chevron--open'
                      : 'monjdb-native-history-period-button__chevron'
                  }
                />
              </button>

              {isHistoryPeriodExpanded ? (
                <div className="monjdb-native-history-date-grid">
                  <label className="monjdb-native-history-date-field">
                    <span>Du</span>
                    <input
                      onChange={(event) => setHistoryDateFrom(event.target.value)}
                      type="date"
                      value={historyDateFrom}
                    />
                  </label>
                  <label className="monjdb-native-history-date-field">
                    <span>Au</span>
                    <input
                      onChange={(event) => setHistoryDateTo(event.target.value)}
                      type="date"
                      value={historyDateTo}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="admin-profile-filters">
              <label className="field-stack">
                <span className="field-stack__label">Intervention</span>
                <input
                  className="field-input"
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Rechercher une intervention..."
                  type="search"
                  value={historySearch}
                />
              </label>
              <label className="field-stack">
                <span className="field-stack__label">Senior</span>
                <select
                  className="field-input"
                  onChange={(event) => setHistorySeniorFilter(event.target.value)}
                  value={historySeniorFilter}
                >
                  <option value="all">Tous les seniors</option>
                  {selectableSeniors
                    .filter((senior) => senior.id !== 'sen-other')
                    .map((senior) => (
                      <option key={senior.id} value={senior.id}>
                        {formatSeniorDisplayName(senior)}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field-stack">
                <span className="field-stack__label">Statut</span>
                <select
                  className="field-input"
                  onChange={(event) =>
                    setHistoryStatusFilter(
                      event.target.value as SeniorHistoryStatusFilter
                    )
                  }
                  value={historyStatusFilter}
                >
                  <option value="all">Tous les statuts</option>
                  <option value="evaluated">Évaluée</option>
                  <option value="pending">En attente</option>
                </select>
              </label>
              <label className="field-stack">
                <span className="field-stack__label">Du</span>
                <input
                  className="field-input"
                  onChange={(event) => setHistoryDateFrom(event.target.value)}
                  type="date"
                  value={historyDateFrom}
                />
              </label>
              <label className="field-stack">
                <span className="field-stack__label">Au</span>
                <input
                  className="field-input"
                  onChange={(event) => setHistoryDateTo(event.target.value)}
                  type="date"
                  value={historyDateTo}
                />
              </label>
            </div>
          )}

          {isNativeApp && !isNativeHistoryDetail ? (
            <h2 className="monjdb-native-history-count">
              {historyRows.length} intervention{historyRows.length > 1 ? 's' : ''}
            </h2>
          ) : null}

          {isNativeApp ? (
            displayedHistoryRows.length ? (
              <div className="admin-profile-history-list monjdb-native-history-list">
                {displayedHistoryRows.map((intervention) => {
                  const status = getSeniorHistoryStatus(
                    adminEvaluations[intervention.id]
                  );
                  const autonomyScore =
                    status === 'evaluated'
                      ? calculateAutonomyScore(
                          intervention,
                          customSurgicalInterventions,
                          adminEvaluations[intervention.id]
                        )
                      : null;
                  const senior =
                    selectableSeniors.find(
                      (item) => item.id === intervention.seniorId
                    ) ?? null;
                  const checklistSteps = getHistoricalChecklistSteps(
                    intervention,
                    customSurgicalInterventions
                  );
                  const isExpanded =
                    expandedHistoryInterventionId === intervention.id;

                  return (
                    <article
                      className={`admin-profile-history-card monjdb-native-history-card ${
                        isNativeHistoryDetail
                          ? 'monjdb-native-history-card--detail'
                          : ''
                      }`.trim()}
                      key={intervention.id}
                    >
                      <div className="admin-profile-history-card__main">
                        <div className="admin-profile-history-card__copy">
                          {isNativeHistoryDetail ? (
                            <>
                              <strong className="monjdb-native-history-detail-title">
                                {getChoiceLabel(
                                  surgicalProcedureOptions,
                                  intervention.procedure
                                )}
                              </strong>
                              <div className="monjdb-native-history-detail-line">
                                <span>
                                  {formatIsoDate(intervention.date)} · Senior :{' '}
                                  {senior
                                    ? formatSeniorDisplayName(senior)
                                    : 'Non renseigné'}
                                </span>
                              </div>
                              <div className="monjdb-native-history-detail-line">
                                <span>
                                  Voie d’abord :{' '}
                                  {capitalizeFirstLetter(
                                    getInterventionApproachLabel(intervention)
                                  )}
                                </span>
                              </div>
                              {getSeniorIndicationLabel(intervention) ? (
                                <div className="monjdb-native-history-detail-line">
                                  <span>
                                    Indication :{' '}
                                    {getSeniorIndicationLabel(intervention)}
                                  </span>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <div className="monjdb-native-history-card__heading">
                                <span className="monjdb-native-history-card__date">
                                  {formatIsoDate(intervention.date)}
                                </span>
                                <strong>
                                  {getChoiceLabel(
                                    surgicalProcedureOptions,
                                    intervention.procedure
                                  )}
                                </strong>
                              </div>
                              {getSeniorIndicationLabel(intervention) ? (
                                <span className="monjdb-native-history-card__meta">
                                  {getSeniorIndicationLabel(intervention)}
                                </span>
                              ) : null}
                              <span className="monjdb-native-history-card__meta">
                                {capitalizeFirstLetter(
                                  getInterventionApproachLabel(intervention)
                                )}
                              </span>
                              <span className="monjdb-native-history-card__meta">
                                {senior
                                  ? formatSeniorDisplayName(senior)
                                  : 'Non renseigné'}
                              </span>
                            </>
                          )}
                        </div>
                        <div className="admin-profile-history-card__aside">
                          <span className={getSeniorHistoryStatusClassName(status)}>
                            {isNativeHistoryDetail && status === 'evaluated' ? (
                              <CircleCheck aria-hidden="true" />
                            ) : null}
                            {getSeniorHistoryStatusLabel(status)}
                          </span>
                          {isNativeHistoryDetail ? null : (
                            <button
                              aria-label={`Voir le détail de ${getChoiceLabel(
                                surgicalProcedureOptions,
                                intervention.procedure
                              )} du ${formatIsoDate(intervention.date)}`}
                              className="monjdb-native-history-card__open"
                              onClick={() =>
                                setExpandedHistoryInterventionId(intervention.id)
                              }
                              type="button"
                            >
                              <ChevronRight aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="admin-profile-history-card__detail">
                          <div className="admin-profile-history-card__detail-grid">
                            <div className="info-block monjdb-native-history-summary-item monjdb-native-history-summary-item--recorded">
                              <Clock3 aria-hidden="true" />
                              <span className="info-block__label">
                                Enregistrée le
                              </span>
                              <strong className="info-block__value">
                                {formatSeniorDateTime(intervention.savedAt)}
                              </strong>
                            </div>
                            <div className="info-block monjdb-native-history-summary-item monjdb-native-history-summary-item--role">
                              <UserRound aria-hidden="true" />
                              <span className="info-block__label">Rôle</span>
                              <strong className="info-block__value">
                                {getChoiceLabel(roleOptions, intervention.role)}
                              </strong>
                            </div>
                            <div
                              className={`info-block monjdb-native-history-summary-item monjdb-native-history-summary-item--score ${
                                autonomyScore == null
                                  ? 'monjdb-native-history-summary-item--score-empty'
                                  : ''
                              }`.trim()}
                            >
                              <span className="info-block__label">
                                Score d'autonomie
                              </span>
                              <strong className="info-block__value">
                                {autonomyScore != null
                                  ? `${Math.round(autonomyScore)}%`
                                  : status === 'evaluated'
                                    ? INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE
                                    : 'Non calculable'}
                              </strong>
                            </div>
                          </div>
                          <div className="admin-profile-history-card__steps">
                            <h3 className="monjdb-native-history-detail-heading">
                              Évaluation du Senior
                            </h3>
                            {checklistSteps.map((step) => {
                              const level = getAuthoritativeChecklist(
                                intervention,
                                adminEvaluations[intervention.id]
                              )[step.id];
                              const nativeLevelClass =
                                level === 'NA'
                                  ? 'na'
                                  : level != null
                                    ? `level-${level}`
                                    : 'empty';

                              return (
                                <div
                                  className="admin-profile-history-card__step"
                                  key={step.id}
                                >
                                  <span>{step.label}</span>
                                  <span
                                    className={`history-step-pill history-step-pill--${nativeLevelClass}`}
                                  >
                                    {level ?? '—'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="validation-box">
                <strong>Aucune intervention ne correspond aux filtres</strong>
                <span>
                  Ajustez la recherche ou les dates pour retrouver les blocs de cet
                  interne.
                </span>
              </div>
            )
          ) : historyRows.length ? (
            <div className="senior-history-web-workspace">
              <section
                aria-label="Liste des interventions"
                className="senior-history-web-list"
              >
                <div className="senior-history-web-list__heading">
                  <div>
                    <strong>Interventions</strong>
                    <span>
                      {historyRows.length} résultat
                      {historyRows.length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="senior-history-web-list__page">
                    Page {historyPage}/{historyPageCount}
                  </span>
                </div>

                {paginatedHistoryRows.map((intervention) => {
                  const status = getSeniorHistoryStatus(
                    adminEvaluations[intervention.id]
                  );
                  const autonomyScore =
                    status === 'evaluated'
                      ? calculateAutonomyScore(
                          intervention,
                          customSurgicalInterventions,
                          adminEvaluations[intervention.id]
                        )
                      : null;
                  const isSelected =
                    webSelectedHistoryIntervention?.id === intervention.id;
                  const procedureLabel = getChoiceLabel(
                    surgicalProcedureOptions,
                    intervention.procedure
                  );

                  return (
                    <button
                      aria-label={
                        status === 'evaluated'
                          ? `Afficher le détail de ${procedureLabel} du ${formatIsoDate(
                              intervention.date
                            )}`
                          : `${procedureLabel} du ${formatIsoDate(
                              intervention.date
                            )}, en attente d’évaluation`
                      }
                      aria-pressed={isSelected}
                      className={`senior-history-web-list__item ${
                        isSelected
                          ? 'senior-history-web-list__item--selected'
                          : ''
                      } ${
                        status === 'pending'
                          ? 'senior-history-web-list__item--locked'
                          : ''
                      }`.trim()}
                      disabled={status === 'pending'}
                      key={intervention.id}
                      onClick={() =>
                        setExpandedHistoryInterventionId(intervention.id)
                      }
                      type="button"
                    >
                      <ApproachIcon
                        className="senior-history-web-list__icon"
                        intervention={intervention}
                      />
                      <span className="senior-history-web-list__copy">
                        <span className="senior-history-web-list__date">
                          {formatIsoDate(intervention.date)}
                        </span>
                        <strong>{procedureLabel}</strong>
                        <span>
                          {capitalizeFirstLetter(
                            getInterventionApproachLabel(intervention)
                          )}
                        </span>
                      </span>
                      <span className="senior-history-web-list__result">
                        <span className={getSeniorHistoryStatusClassName(status)}>
                          {getSeniorHistoryStatusLabel(status)}
                        </span>
                        <strong>
                          {autonomyScore != null
                            ? `${Math.round(autonomyScore)}%`
                            : '—'}
                        </strong>
                      </span>
                    </button>
                  );
                })}
              </section>

              {webSelectedHistoryIntervention ? (
                (() => {
                  const intervention = webSelectedHistoryIntervention;
                  const evaluation = adminEvaluations[intervention.id];
                  const autonomyScore = calculateAutonomyScore(
                    intervention,
                    customSurgicalInterventions,
                    evaluation
                  );
                  const senior =
                    selectableSeniors.find(
                      (item) => item.id === intervention.seniorId
                    ) ?? null;
                  const checklist = getAuthoritativeChecklist(
                    intervention,
                    evaluation
                  );
                  const checklistSteps = getHistoricalChecklistSteps(
                    intervention,
                    customSurgicalInterventions
                  );

                  return (
                    <article className="senior-history-web-detail">
                      <header className="senior-history-web-detail__header">
                        <div className="senior-history-web-detail__identity">
                          <ApproachIcon
                            className="senior-history-web-detail__icon"
                            intervention={intervention}
                          />
                          <div>
                            <span className="senior-history-web-detail__date">
                              {formatIsoDate(intervention.date)}
                            </span>
                            <h2>
                              {getChoiceLabel(
                                surgicalProcedureOptions,
                                intervention.procedure
                              )}
                            </h2>
                            <p>
                              {capitalizeFirstLetter(
                                getInterventionApproachLabel(intervention)
                              )}
                              {getSeniorIndicationLabel(intervention)
                                ? ` · ${getSeniorIndicationLabel(intervention)}`
                                : ''}
                            </p>
                          </div>
                        </div>
                        <span
                          aria-label={`Cadre de l’intervention : ${formatSurgeryContext(
                            intervention.context
                          )}`}
                          className={`surgery-context-badge surgery-context-badge--${
                            intervention.context ?? 'unknown'
                          }`}
                        >
                          {formatSurgeryContext(intervention.context)}
                        </span>
                      </header>

                      <div className="senior-history-web-detail__summary">
                        <div>
                          <span>Senior</span>
                          <strong>
                            {senior
                              ? formatSeniorDisplayName(senior)
                              : 'Non renseigné'}
                          </strong>
                        </div>
                        <div>
                          <span>Rôle</span>
                          <strong>
                            {getChoiceLabel(roleOptions, intervention.role)}
                          </strong>
                        </div>
                        <div>
                          <span>Score d’autonomie</span>
                          <strong>
                            {autonomyScore != null
                              ? `${Math.round(autonomyScore)}%`
                              : INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE}
                          </strong>
                        </div>
                      </div>

                      <ClinicalContextOverview
                        className="senior-history-web-detail__clinical-context"
                        intervention={intervention}
                      />

                      <div className="senior-history-web-detail__section-heading">
                        <div>
                          <h3>Évaluation du Senior</h3>
                        </div>
                        <span>
                          Enregistrée le{' '}
                          {formatSeniorDateTime(intervention.savedAt)}
                        </span>
                      </div>

                      <div className="senior-history-web-detail__assessments">
                        <div className="senior-history-web-detail__assessment">
                          <span>Performance de l’interne</span>
                          <strong>
                            {evaluation?.globalPerformance
                              ? SENIOR_PERFORMANCE_LABELS[
                                  evaluation.globalPerformance
                                ]
                              : 'Non renseignée'}
                          </strong>
                          {renderSeniorHistoryRatingScale(
                            evaluation?.globalPerformance,
                            5,
                            evaluation?.globalPerformance
                              ? `Performance de l’interne ${evaluation.globalPerformance} sur 5`
                              : 'Performance de l’interne non renseignée'
                          )}
                        </div>
                        <div className="senior-history-web-detail__assessment">
                          <span>Difficulté de l’intervention</span>
                          <strong>
                            {evaluation?.categoryDifficulty
                              ? SENIOR_DIFFICULTY_LABELS[
                                  evaluation.categoryDifficulty
                                ]
                              : 'Non renseignée'}
                          </strong>
                          {renderSeniorHistoryRatingScale(
                            evaluation?.categoryDifficulty,
                            3,
                            evaluation?.categoryDifficulty
                              ? `Difficulté de l’intervention ${evaluation.categoryDifficulty} sur 3`
                              : 'Difficulté de l’intervention non renseignée'
                          )}
                        </div>
                      </div>

                      <div className="senior-history-web-detail__steps">
                        {checklistSteps.map((step) => {
                          const level = checklist[step.id];

                          return (
                            <div
                              className="senior-history-web-detail__step"
                              key={step.id}
                            >
                              <span>{step.label}</span>
                              {renderSeniorHistoryChecklistScale(level)}
                            </div>
                          );
                        })}
                      </div>
                    </article>
                  );
                })()
              ) : (
                <div className="validation-box senior-history-web-detail--empty">
                  <strong>Aucune évaluation à afficher</strong>
                  <span>
                    Les interventions en attente restent verrouillées jusqu’à
                    l’évaluation du Senior désigné.
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="validation-box">
              <strong>Aucune intervention ne correspond aux filtres</strong>
              <span>
                Ajustez la recherche ou les dates pour retrouver les blocs de cet
                interne.
              </span>
            </div>
          )}

          {isNativeHistoryDetail ? null : (
            <div
              className={`admin-profile-pagination ${
                isNativeApp ? 'monjdb-native-history-pagination' : ''
              }`.trim()}
            >
              <span>
                {historyStart} - {historyEnd} sur {historyRows.length} intervention
                {historyRows.length > 1 ? 's' : ''}
              </span>
              <div className="admin-profile-pagination__controls">
                <button
                  aria-label="Page précédente"
                  className="mini-button"
                  disabled={historyPage === 1}
                  onClick={() => setHistoryPage((current) => current - 1)}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" />
                </button>
                <span>
                  {historyPage} / {historyPageCount}
                </span>
                <button
                  aria-label="Page suivante"
                  className="mini-button"
                  disabled={historyPage === historyPageCount}
                  onClick={() => setHistoryPage((current) => current + 1)}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" />
                </button>
                <select
                  aria-label="Nombre d’interventions par page"
                  className="field-input admin-profile-pagination__select"
                  onChange={(event) =>
                    setHistoryPageSize(Number(event.target.value))
                  }
                  value={historyPageSize}
                >
                  {SENIOR_HISTORY_PAGE_SIZE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option} par page
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div id="senior-progress-panel" role="tabpanel">
          <div className="progress-filters senior-progress-filters">
            <label className="progress-selector progress-selector--primary">
              <span className="progress-selector__label">Intervention</span>
              <span className="progress-selector__control">
                <select
                  aria-label="Filtrer par intervention"
                  onChange={(event) => {
                    const nextProcedure = event.target.value as InterventionType;
                    const nextOption = procedureOptions.find(
                      (option) => option.procedure === nextProcedure
                    );

                    onSelectedProcedureKeyChange(nextOption?.key ?? '');
                  }}
                  value={selectedProcedureOption?.procedure ?? ''}
                >
                  {!procedureFilterOptions.length ? (
                    <option value="">Aucune intervention créée</option>
                  ) : null}
                  {procedureFilterOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className="progress-selector__chevron" />
              </span>
            </label>

            <label className="progress-selector">
              <span className="progress-selector__label">Indication</span>
              <span className="progress-selector__control">
                <select
                  aria-label="Filtrer par indication"
                  onChange={(event) =>
                    onSelectedProcedureKeyChange(event.target.value)
                  }
                  value={selectedProcedureKey}
                >
                  {!indicationFilterOptions.length ? (
                    <option value="">Aucune indication disponible</option>
                  ) : null}
                  {indicationFilterOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.indicationLabel}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className="progress-selector__chevron" />
              </span>
            </label>

            <label className="progress-selector">
              <span className="progress-selector__label">Voie d’abord</span>
              <span className="progress-selector__control">
                <select
                  aria-label="Filtrer par voie d’abord"
                  onChange={(event) =>
                    setSelectedApproach(
                      event.target.value as SurgicalApproach | ''
                    )
                  }
                  value={selectedApproach}
                >
                  <option value="">Toutes</option>
                  {approachOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className="progress-selector__chevron" />
              </span>
            </label>
          </div>

          <div
            aria-label="Période analysée"
            className="senior-progress-period"
            role="group"
          >
            {PROGRESS_PERIOD_OPTIONS.map((option) => (
              <button
                aria-pressed={progressPeriod === option.value}
                className={`senior-progress-period__item ${
                  progressPeriod === option.value
                    ? 'senior-progress-period__item--active'
                    : ''
                }`.trim()}
                key={option.value}
                onClick={() => setProgressPeriod(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>

          {isNativeApp ? (
            <div className="progress-subtabs" aria-label="Analyse de progression">
              <button
                aria-pressed={activeProgressView === 'autonomy'}
                className={
                  activeProgressView === 'autonomy'
                    ? 'progress-subtabs__item progress-subtabs__item--active'
                    : 'progress-subtabs__item'
                }
                onClick={() => setActiveProgressView('autonomy')}
                type="button"
              >
                <span className="progress-subtabs__icon">
                  <BarChart3 aria-hidden="true" />
                </span>
                <span className="progress-subtabs__label">
                  Évolution autonomie
                </span>
              </button>
              <button
                aria-pressed={activeProgressView === 'steps'}
                className={
                  activeProgressView === 'steps'
                    ? 'progress-subtabs__item progress-subtabs__item--active'
                    : 'progress-subtabs__item'
                }
                onClick={() => setActiveProgressView('steps')}
                type="button"
              >
                <span className="progress-subtabs__icon">
                  <Clock3 aria-hidden="true" />
                </span>
                <span className="progress-subtabs__label">
                  Temps opératoires
                </span>
              </button>
            </div>
          ) : null}

          {!progressInterventions.length ? (
            <div className="validation-box">
              <strong>Aucun bloc enregistré pour cette sélection</strong>
              <span>
                Choisissez une autre procédure, une autre indication, une autre voie
                d’abord ou une autre période.
              </span>
            </div>
          ) : null}

          {shouldShowWebEvaluationEmptyState ? (
            <div className="validation-box">
              <strong>Aucune donnée évaluée pour cette sélection</strong>
              <span>
                Les graphiques apparaîtront dès qu’une intervention correspondante
                aura été évaluée.
              </span>
            </div>
          ) : null}

          {progressInterventions.length &&
          (isNativeApp || hasProgressVisualizationData) ? (
            isNativeApp ? (
              activeProgressView === 'autonomy' ? (
                autonomyPanel
              ) : (
                stepsPanel
              )
            ) : (
              <div className="senior-progress-comparison">
                {autonomyPanel}
                {stepsPanel}
              </div>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
