import {
  Archive,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ListOrdered,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  approachOptions,
  entryTechniqueOptions,
  getChoiceLabel,
} from '../data/mockData';
import {
  CreateSurgicalInterventionInput,
  InterventionStatus,
  OperativeStepDefinition,
  SavedIntervention,
  SurgicalApproach,
  SurgicalInterventionDefinition,
} from '../types';
import {
  countInterventionConfiguredSteps,
  createApproachConfig,
  createEmptySurgicalInterventionDefinition,
  createInterventionIndicationOption,
  createOperativeStep,
  duplicateSurgicalInterventionDefinition,
  ensureSurgicalInterventionDefinitionShape,
  sortIndicationOptions,
  surgicalInterventionDefinitionToInput,
  validateSurgicalInterventionForPublish,
} from '../utils/surgicalInterventions';
import { useScrollResetOnChange } from '../utils/useScrollResetOnChange';
import { SectionCard } from './SectionCard';

type InterventionEditorMode = 'create' | 'edit' | 'view' | 'duplicate';
type InterventionManagerView = 'list' | 'editor' | 'steps';
type InterventionListFilter = 'all' | 'active' | 'inactive' | 'archived';
type FeedbackState =
  | {
      kind: 'success' | 'error';
      message: string;
    }
  | null;

const LIST_FILTERS: Array<{
  value: InterventionListFilter;
  label: string;
}> = [
  { value: 'all', label: 'Toutes' },
  { value: 'active', label: 'Actives' },
  { value: 'inactive', label: 'Inactives' },
  { value: 'archived', label: 'Archivées' },
];

const LATERALITY_OPTIONS: Array<{
  value: SurgicalInterventionDefinition['lateralityMode'];
  title: string;
  description: string;
}> = [
  {
    value: 'none',
    title: 'Aucune latéralité',
    description: 'Aucune latéralité à renseigner.',
  },
  {
    value: 'right_left',
    title: 'Droite / gauche',
    description: 'Choix entre droite ou gauche.',
  },
  {
    value: 'right_left_bilateral',
    title: 'Droite / gauche / bilatérale',
    description: 'Choix entre droite, gauche ou bilatérale.',
  },
];

const STATUS_LABELS: Record<InterventionStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archivée',
};

const STATUS_CLASSNAMES: Record<InterventionStatus, string> = {
  active: 'admin-status-pill admin-status-pill--active',
  inactive: 'admin-status-pill admin-status-pill--inactive',
  archived: 'admin-status-pill admin-status-pill--draft',
};

function formatFrenchDate(value: string | undefined) {
  if (!value) {
    return 'Non renseignée';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}

function getApproachLabel(approach: SurgicalApproach) {
  return getChoiceLabel(approachOptions, approach, approach);
}

function getUsedCount(
  definition: SurgicalInterventionDefinition,
  savedInterventions: SavedIntervention[]
) {
  return savedInterventions.filter(
    (savedIntervention) => savedIntervention.procedure === definition.id
  ).length;
}

function updateApproachSteps(
  definition: SurgicalInterventionDefinition,
  approach: SurgicalApproach,
  updater: (steps: OperativeStepDefinition[]) => OperativeStepDefinition[]
) {
  return ensureSurgicalInterventionDefinitionShape({
    ...definition,
    updatedAt: new Date().toISOString(),
    approachConfigs: (definition.approachConfigs ?? []).map((config) =>
      config.approach === approach
        ? {
            ...config,
            steps: updater(config.steps),
          }
        : config
    ),
  });
}

export function AdminInterventionsManager({
  interventions,
  savedInterventions,
  onBack,
  createSurgicalIntervention,
  updateSurgicalIntervention,
  deleteCustomSurgicalIntervention,
}: {
  interventions: SurgicalInterventionDefinition[];
  savedInterventions: SavedIntervention[];
  onBack: () => void;
  createSurgicalIntervention: (
    input: CreateSurgicalInterventionInput
  ) => { success: boolean; message: string; intervention?: SurgicalInterventionDefinition };
  updateSurgicalIntervention: (
    interventionId: SurgicalInterventionDefinition['id'],
    input: CreateSurgicalInterventionInput
  ) => { success: boolean; message: string; intervention?: SurgicalInterventionDefinition };
  deleteCustomSurgicalIntervention: (
    interventionId: SurgicalInterventionDefinition['id']
  ) => void;
}) {
  const [view, setView] = useState<InterventionManagerView>('list');
  useScrollResetOnChange([view]);
  const [editorMode, setEditorMode] = useState<InterventionEditorMode>('create');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<InterventionListFilter>('all');
  const [draft, setDraft] = useState<SurgicalInterventionDefinition | null>(null);
  const [previewApproach, setPreviewApproach] = useState<SurgicalApproach | ''>('');
  const [stepsApproach, setStepsApproach] = useState<SurgicalApproach | null>(null);
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);
  const [expandedApproaches, setExpandedApproaches] = useState<
    Record<SurgicalApproach, boolean>
  >({
    coelioscopie: true,
    robot: true,
    laparotomie: true,
    voie_vaginale: true,
    hysteroscopie: true,
    vnotes: true,
  });

  const normalizedInterventions = useMemo(
    () =>
      interventions
        .map((intervention) => ensureSurgicalInterventionDefinitionShape(intervention))
        .sort((left, right) => left.name.localeCompare(right.name, 'fr-FR')),
    [interventions]
  );

  const filteredInterventions = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('fr-FR');

    return normalizedInterventions.filter((intervention) => {
      if (filter !== 'all' && intervention.status !== filter) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return (
        intervention.name.toLocaleLowerCase('fr-FR').includes(normalizedSearch) ||
        intervention.allowedApproaches.some((approach) =>
          getApproachLabel(approach)
            .toLocaleLowerCase('fr-FR')
            .includes(normalizedSearch)
        )
      );
    });
  }, [filter, normalizedInterventions, search]);

  const currentApproachConfig =
    draft && stepsApproach
      ? draft.approachConfigs?.find((config) => config.approach === stepsApproach) ??
        null
      : null;

  const previewApproachOptions =
    draft?.approachConfigs?.filter((config) => config.active).map((config) => config.approach) ??
    [];
  const previewConfig =
    draft && previewApproach
      ? draft.approachConfigs?.find(
          (config) => config.approach === previewApproach && config.active
        ) ?? null
      : null;
  const sortedPreviewIndications = draft?.indicationOptions
    ? sortIndicationOptions(draft.indicationOptions).filter(
        (indicationOption) => indicationOption.active && indicationOption.label.trim()
      )
    : [];

  const updateDraft = (
    updater: (current: SurgicalInterventionDefinition) => SurgicalInterventionDefinition
  ) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return ensureSurgicalInterventionDefinitionShape(
        updater({
          ...current,
          updatedAt: new Date().toISOString(),
        })
      );
    });
    setFeedback(null);
    setValidationErrors([]);
  };

  const openEditor = (
    nextDraft: SurgicalInterventionDefinition,
    mode: InterventionEditorMode
  ) => {
    const normalizedDraft = ensureSurgicalInterventionDefinitionShape(nextDraft);
    const firstActiveApproach =
      normalizedDraft.approachConfigs?.find((config) => config.active)?.approach ?? '';

    setDraft(normalizedDraft);
    setEditorMode(mode);
    setPreviewApproach(firstActiveApproach);
    setStepsApproach(null);
    setFeedback(null);
    setValidationErrors([]);
    setOpenCardMenuId(null);
    setView('editor');
  };

  const handleCreate = () => {
    openEditor(createEmptySurgicalInterventionDefinition(), 'create');
  };

  const handleView = (definition: SurgicalInterventionDefinition) => {
    openEditor(definition, 'view');
  };

  const handleEdit = (definition: SurgicalInterventionDefinition) => {
    openEditor(definition, 'edit');
  };

  const handleDuplicate = (definition: SurgicalInterventionDefinition) => {
    openEditor(duplicateSurgicalInterventionDefinition(definition), 'duplicate');
  };

  const handleToggleStatus = (definition: SurgicalInterventionDefinition) => {
    const nextStatus: InterventionStatus =
      definition.status === 'active' ? 'inactive' : 'active';
    const updatedDefinition = ensureSurgicalInterventionDefinitionShape({
      ...definition,
      status: nextStatus,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    });
    const result = updateSurgicalIntervention(
      updatedDefinition.id,
      surgicalInterventionDefinitionToInput(updatedDefinition)
    );

    setFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.success
        ? `L’intervention ${updatedDefinition.name} est maintenant ${STATUS_LABELS[
            nextStatus
          ].toLocaleLowerCase('fr-FR')}.`
        : result.message,
    });
    setOpenCardMenuId(null);
  };

  const handleArchive = (definition: SurgicalInterventionDefinition) => {
    const confirmationMessage =
      getUsedCount(definition, savedInterventions) > 0
        ? 'Cette intervention a déjà été utilisée dans des journaux opératoires. Elle ne peut pas être supprimée définitivement afin de préserver l’historique des données. Vous pouvez l’archiver pour la masquer côté interne.'
        : `Archiver l’intervention ${definition.name} ?`;
    const confirmed = window.confirm(confirmationMessage);

    if (!confirmed) {
      return;
    }

    const archivedDefinition = ensureSurgicalInterventionDefinitionShape({
      ...definition,
      status: 'archived',
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const result = updateSurgicalIntervention(
      archivedDefinition.id,
      surgicalInterventionDefinitionToInput(archivedDefinition)
    );

    setFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.success
        ? `L’intervention ${archivedDefinition.name} a été archivée.`
        : result.message,
    });
    setOpenCardMenuId(null);
  };

  const handleDelete = (definition: SurgicalInterventionDefinition) => {
    if (getUsedCount(definition, savedInterventions) > 0 || !definition.isCustom) {
      return;
    }

    const confirmed = window.confirm(
      `Supprimer définitivement l’intervention ${definition.name} ?`
    );

    if (!confirmed) {
      return;
    }

    deleteCustomSurgicalIntervention(definition.id);
    setFeedback({
      kind: 'success',
      message: `L’intervention ${definition.name} a été supprimée définitivement.`,
    });
    setOpenCardMenuId(null);
  };

  const handleAddIndication = () => {
    updateDraft((current) => ({
      ...current,
      indicationOptions: [
        ...(current.indicationOptions ?? []),
        createInterventionIndicationOption(''),
      ],
    }));
  };

  useEffect(() => {
    if (!draft) {
      if (previewApproach !== '') {
        setPreviewApproach('');
      }
      return;
    }

    if (
      previewApproach &&
      previewApproachOptions.includes(previewApproach)
    ) {
      return;
    }

    setPreviewApproach(previewApproachOptions[0] ?? '');
  }, [draft, previewApproach, previewApproachOptions]);

  const handleSave = (nextStatus: InterventionStatus) => {
    if (!draft) {
      return;
    }

    const preparedDraft = ensureSurgicalInterventionDefinitionShape({
      ...draft,
      status: nextStatus,
      archivedAt: nextStatus === 'archived' ? new Date().toISOString() : null,
    });
    const errors =
      nextStatus === 'active'
        ? validateSurgicalInterventionForPublish(preparedDraft)
        : [];

    setValidationErrors(errors);

    if (errors.length > 0) {
      setFeedback({
        kind: 'error',
        message: errors[0],
      });
      return;
    }

    const input = surgicalInterventionDefinitionToInput(preparedDraft);
    const exists = normalizedInterventions.some(
      (intervention) => intervention.id === preparedDraft.id
    );
    const result = exists
      ? updateSurgicalIntervention(preparedDraft.id, input)
      : createSurgicalIntervention(input);

    setFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.success
        ? nextStatus === 'active'
          ? 'L’intervention a été publiée.'
          : 'L’intervention a été enregistrée en brouillon.'
        : result.message,
    });

    if (!result.success) {
      return;
    }

    setView('list');
    setDraft(null);
  };

  if (view === 'steps' && draft && stepsApproach && currentApproachConfig) {
    const sortedSteps = [...currentApproachConfig.steps].sort(
      (left, right) => left.order - right.order
    );

    return (
      <>
        <div className="admin-page-toolbar">
          <button
            className="admin-breadcrumb-button"
            onClick={() => setView('editor')}
            type="button"
          >
            <ChevronLeft aria-hidden="true" />
            <span>Retour à l’intervention</span>
          </button>
        </div>

        <div className="admin-title-row">
          <div>
            <h2 className="admin-intervention-editor-title">
              Étapes opératoires — {draft.name || 'Nouvelle intervention'} —{' '}
              {getApproachLabel(stepsApproach)}
            </h2>
          </div>
        </div>

        <SectionCard
          className="admin-dashboard-card"
          description="Toutes les étapes sont affichées côté interne. Seules les étapes clés entrent dans le calcul du score."
          title="Gestion des étapes"
        >
          <div className="admin-step-management-list">
            {sortedSteps.map((step, index) => (
              <article
                className="admin-step-management-card"
                draggable
                key={step.id}
                onDragOver={(event) => event.preventDefault()}
                onDragStart={() => setDraggedStepId(step.id)}
                onDrop={() => {
                  if (!draggedStepId || draggedStepId === step.id) {
                    return;
                  }

                  updateDraft((current) =>
                    updateApproachSteps(current, stepsApproach, (steps) => {
                      const orderedSteps = [...steps].sort(
                        (left, right) => left.order - right.order
                      );
                      const sourceIndex = orderedSteps.findIndex(
                        (currentStep) => currentStep.id === draggedStepId
                      );
                      const targetIndex = orderedSteps.findIndex(
                        (currentStep) => currentStep.id === step.id
                      );

                      if (sourceIndex === -1 || targetIndex === -1) {
                        return orderedSteps;
                      }

                      const nextSteps = [...orderedSteps];
                      const [movedStep] = nextSteps.splice(sourceIndex, 1);
                      nextSteps.splice(targetIndex, 0, movedStep);

                      return nextSteps.map((currentStep, currentIndex) => ({
                        ...currentStep,
                        order: currentIndex + 1,
                      }));
                    })
                  );
                  setDraggedStepId(null);
                }}
              >
                <div className="admin-step-management-card__index">
                  Étape {index + 1}
                </div>
                <div className="admin-step-management-card__content">
                  <label className="field-stack">
                    <span className="field-stack__label">Nom de l’étape</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        updateDraft((current) =>
                          updateApproachSteps(current, stepsApproach, (steps) =>
                            steps.map((currentStep) =>
                              currentStep.id === step.id
                                ? {
                                    ...currentStep,
                                    label: event.target.value,
                                  }
                                : currentStep
                            )
                          )
                        )
                      }
                      type="text"
                      value={step.label}
                    />
                  </label>
                  <label className="admin-toggle-row">
                    <span>Étape clé évaluée dans le score</span>
                    <button
                      className={`admin-switch ${
                        step.scored ? 'admin-switch--active' : ''
                      }`}
                      onClick={() =>
                        updateDraft((current) =>
                          updateApproachSteps(current, stepsApproach, (steps) =>
                            steps.map((currentStep) =>
                              currentStep.id === step.id
                                ? {
                                    ...currentStep,
                                    scored: !currentStep.scored,
                                  }
                                : currentStep
                            )
                          )
                        )
                      }
                      type="button"
                    >
                      <span />
                    </button>
                  </label>
                </div>
                <div className="admin-step-management-card__actions">
                  <button
                    className="mini-button mini-button--danger"
                    disabled={sortedSteps.length === 1}
                    onClick={() =>
                      updateDraft((current) =>
                        updateApproachSteps(current, stepsApproach, (steps) =>
                          steps
                            .filter((currentStep) => currentStep.id !== step.id)
                            .map((currentStep, currentIndex) => ({
                              ...currentStep,
                              order: currentIndex + 1,
                            }))
                        )
                      )
                    }
                    type="button"
                  >
                    Supprimer l’étape
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="admin-editor-footer">
            <button
              className="mini-button mini-button--secondary"
              onClick={() =>
                updateDraft((current) =>
                  updateApproachSteps(current, stepsApproach, (steps) => [
                    ...steps,
                    createOperativeStep('', steps.length + 1, steps.length === 0),
                  ])
                )
              }
              type="button"
            >
              + Ajouter une étape
            </button>
            <div className="admin-editor-footer__actions">
              <button
                className="app-button app-button--secondary"
                onClick={() => setView('editor')}
                type="button"
              >
                Retour à l’intervention
              </button>
              <button
                className="app-button app-button--primary"
                onClick={() => setView('editor')}
                type="button"
              >
                Enregistrer les étapes
              </button>
            </div>
          </div>
        </SectionCard>
      </>
    );
  }

  if (view === 'editor' && draft) {
    const isReadOnly = editorMode === 'view';

    return (
      <>
        <div className="admin-page-toolbar">
          <button
            className="admin-breadcrumb-button"
            onClick={() => {
              setView('list');
              setDraft(null);
              setFeedback(null);
              setValidationErrors([]);
            }}
            type="button"
          >
            <ChevronLeft aria-hidden="true" />
            <span>Retour à la liste des interventions</span>
          </button>
        </div>

        <div className="admin-title-row admin-title-row--editor">
          <div>
            <div className="admin-title-row__headline">
              <h2 className="admin-intervention-editor-title">
                {editorMode === 'create'
                  ? 'Nouvelle intervention'
                  : editorMode === 'duplicate'
                    ? 'Copie d’intervention'
                    : draft.name || 'Intervention'}
              </h2>
              <span className="admin-status-pill admin-status-pill--inactive">
                {editorMode === 'create' || editorMode === 'duplicate'
                  ? 'Brouillon'
                  : STATUS_LABELS[draft.status ?? 'inactive']}
              </span>
            </div>
            <p className="admin-intervention-editor-subtitle">
              Définir les informations générales, les voies d’abord et les étapes
              évaluables par voie d’abord.
            </p>
          </div>
        </div>

        {editorMode === 'edit' ? (
          <div className="validation-box admin-validation-box">
            <strong>
              Les modifications s’appliqueront uniquement aux futurs enregistrements.
            </strong>
            <span>
              Les interventions déjà enregistrées ne seront pas modifiées.
            </span>
          </div>
        ) : null}

        {feedback ? (
          <div className={feedback.kind === 'success' ? 'auth-success' : 'auth-error'}>
            {feedback.message}
          </div>
        ) : null}

        {validationErrors.length ? (
          <div className="validation-box admin-validation-box">
            <strong>Vérifications avant publication</strong>
            {validationErrors.map((error) => (
              <span key={error}>{error}</span>
            ))}
          </div>
        ) : null}

        <div className="admin-intervention-editor-layout">
          <div className="admin-intervention-editor-main">
            <SectionCard className="admin-dashboard-card" title="1. Informations générales">
              <div className="admin-create-form__grid">
                <label className="field-stack">
                  <span className="field-stack__label">Nom de l’intervention *</span>
                  <input
                    className="field-input"
                    disabled={isReadOnly}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="Ex : Kystectomie ovarienne"
                    type="text"
                    value={draft.name}
                  />
                </label>

                <div className="field-stack">
                  <span className="field-stack__label">Statut</span>
                  <label className="admin-toggle-row">
                    <span>{draft.status === 'active' ? 'Active' : 'Inactive'}</span>
                    <button
                      className={`admin-switch ${
                        draft.status === 'active' ? 'admin-switch--active' : ''
                      }`}
                      disabled={isReadOnly}
                      onClick={() =>
                        updateDraft((current) => ({
                          ...current,
                          status: current.status === 'active' ? 'inactive' : 'active',
                          archivedAt: null,
                        }))
                      }
                      type="button"
                    >
                      <span />
                    </button>
                  </label>
                </div>
              </div>
            </SectionCard>

            <SectionCard className="admin-dashboard-card" title="2. Indications disponibles">
              <div className="admin-list-header-row">
                <span>Indications</span>
                {!isReadOnly ? (
                  <button
                    className="mini-button mini-button--secondary"
                    onClick={handleAddIndication}
                    type="button"
                  >
                    + Ajouter une indication
                  </button>
                ) : null}
              </div>

              <div className="admin-intervention-indication-list">
                {(draft.indicationOptions ?? []).map((indicationOption) => (
                  <div className="admin-intervention-indication-row" key={indicationOption.id}>
                    <input
                      className="field-input"
                      disabled={isReadOnly || indicationOption.isOther}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          indicationOptions: (current.indicationOptions ?? []).map((currentOption) =>
                            currentOption.id === indicationOption.id
                              ? {
                                  ...currentOption,
                                  label: event.target.value,
                                }
                              : currentOption
                          ),
                        }))
                      }
                      placeholder="Nouvelle indication"
                      type="text"
                      value={indicationOption.label}
                    />
                    <div className="admin-intervention-indication-row__meta">
                      {indicationOption.isDefault ? (
                        <span className="admin-tag-chip">Par défaut</span>
                      ) : null}
                      <button
                        className={`admin-switch ${
                          indicationOption.active ? 'admin-switch--active' : ''
                        }`}
                        disabled={isReadOnly}
                        onClick={() =>
                          updateDraft((current) => ({
                            ...current,
                            indicationOptions: (current.indicationOptions ?? []).map((currentOption) =>
                              currentOption.id === indicationOption.id
                                ? {
                                    ...currentOption,
                                    active: !currentOption.active,
                                  }
                                : currentOption
                            ),
                          }))
                        }
                        type="button"
                      >
                        <span />
                      </button>
                      {!indicationOption.isOther ? (
                        <button
                          className="mini-button mini-button--danger"
                          disabled={isReadOnly}
                          onClick={() =>
                            updateDraft((current) => ({
                              ...current,
                              indicationOptions: (current.indicationOptions ?? []).filter(
                                (currentOption) => currentOption.id !== indicationOption.id
                              ),
                            }))
                          }
                          type="button"
                        >
                          Supprimer
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard className="admin-dashboard-card" title="3. Voies d’abord disponibles">
              <p className="admin-section-helper">
                Sélectionnez une ou plusieurs voies d’abord pour configurer cette intervention.
              </p>

              <div className="admin-approach-tile-grid">
                {approachOptions.map((approachOption) => {
                  const config =
                    draft.approachConfigs?.find(
                      (approachConfig) => approachConfig.approach === approachOption.value
                    ) ?? createApproachConfig(approachOption.value);
                  const isSelected = config.active;

                  return (
                    <button
                      className={`admin-approach-tile ${
                        isSelected ? 'admin-approach-tile--selected' : ''
                      }`}
                      disabled={isReadOnly}
                      key={approachOption.value}
                      onClick={() =>
                        updateDraft((current) => {
                          const existingConfig =
                            current.approachConfigs?.find(
                              (approachConfig) =>
                                approachConfig.approach === approachOption.value
                            ) ?? null;

                          if (existingConfig) {
                            return {
                              ...current,
                              approachConfigs: (current.approachConfigs ?? []).map(
                                (approachConfig) =>
                                  approachConfig.approach === approachOption.value
                                    ? {
                                        ...approachConfig,
                                        active: !approachConfig.active,
                                      }
                                    : approachConfig
                              ),
                            };
                          }

                          return {
                            ...current,
                            approachConfigs: [
                              ...(current.approachConfigs ?? []),
                              createApproachConfig(approachOption.value, { active: true }),
                            ],
                          };
                        })
                      }
                      type="button"
                    >
                      <strong>{approachOption.label}</strong>
                      {isSelected ? <Check aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>

              <div className="admin-approach-config-list">
                {(draft.approachConfigs ?? [])
                  .filter((config) => config.active)
                  .map((config) => {
                    const isExpanded = expandedApproaches[config.approach];
                    const needsEntryTechniques =
                      config.approach === 'coelioscopie' || config.approach === 'robot';
                    const activeEntryTechniques =
                      config.entryTechniques?.filter((entryTechnique) => entryTechnique.active) ??
                      [];

                    return (
                      <article className="admin-approach-config-card" key={config.id}>
                        <button
                          className="admin-approach-config-card__header"
                          onClick={() =>
                            setExpandedApproaches((current) => ({
                              ...current,
                              [config.approach]: !current[config.approach],
                            }))
                          }
                          type="button"
                        >
                          <strong>Configuration — {getApproachLabel(config.approach)}</strong>
                          <ChevronDown
                            aria-hidden="true"
                            className={isExpanded ? 'admin-approach-config-card__chevron--open' : ''}
                          />
                        </button>

                        {isExpanded ? (
                          <div className="admin-approach-config-card__content">
                            {needsEntryTechniques ? (
                              <div className="field-stack">
                                <span className="field-stack__label">
                                  Technique d’entrée du pneumopéritoine
                                </span>
                                <div className="admin-checkbox-grid">
                                  {entryTechniqueOptions.map((entryTechniqueOption) => {
                                    const isActive = activeEntryTechniques.some(
                                      (entryTechnique) =>
                                        entryTechnique.label === entryTechniqueOption.value
                                    );

                                    return (
                                      <label
                                        className="admin-checkbox-card"
                                        key={entryTechniqueOption.value}
                                      >
                                        <input
                                          checked={isActive}
                                          disabled={isReadOnly}
                                          onChange={() =>
                                            updateDraft((current) => ({
                                              ...current,
                                              approachConfigs: (current.approachConfigs ?? []).map(
                                                (approachConfig) =>
                                                  approachConfig.approach === config.approach
                                                    ? {
                                                        ...approachConfig,
                                                        entryTechniques: (
                                                          approachConfig.entryTechniques ?? []
                                                        ).map((entryTechnique) =>
                                                          entryTechnique.label ===
                                                          entryTechniqueOption.value
                                                            ? {
                                                                ...entryTechnique,
                                                                active: !entryTechnique.active,
                                                              }
                                                            : entryTechnique
                                                        ),
                                                      }
                                                    : approachConfig
                                              ),
                                            }))
                                          }
                                          type="checkbox"
                                        />
                                        <span>{entryTechniqueOption.label}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <span className="admin-section-helper">
                                Pas de technique d’entrée du pneumopéritoine
                              </span>
                            )}

                            <div className="admin-approach-config-card__footer">
                              <span>
                                {config.steps.length} étape
                                {config.steps.length > 1 ? 's' : ''} configurée
                                {config.steps.length > 1 ? 's' : ''}
                              </span>
                              <button
                                className="mini-button mini-button--secondary"
                                disabled={isReadOnly}
                                onClick={() => {
                                  setStepsApproach(config.approach);
                                  setView('steps');
                                }}
                                type="button"
                              >
                                Gérer les étapes
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
              </div>
            </SectionCard>

            <SectionCard className="admin-dashboard-card" title="4. Latéralité">
              <div className="admin-laterality-grid">
                {LATERALITY_OPTIONS.map((option) => (
                  <button
                    className={`admin-laterality-card ${
                      draft.lateralityMode === option.value
                        ? 'admin-laterality-card--selected'
                        : ''
                    }`}
                    disabled={isReadOnly}
                    key={option.value}
                    onClick={() =>
                      updateDraft((current) => ({
                        ...current,
                        lateralityMode: option.value,
                      }))
                    }
                    type="button"
                  >
                    <strong>{option.title}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
            </SectionCard>

            <div className="admin-editor-footer">
              <button
                className="app-button app-button--secondary"
                onClick={() => {
                  setDraft(null);
                  setView('list');
                }}
                type="button"
              >
                Annuler
              </button>
              {isReadOnly ? null : (
                <>
                  <button
                    className="app-button app-button--secondary"
                    onClick={() => handleSave('inactive')}
                    type="button"
                  >
                    Enregistrer en brouillon
                  </button>
                  <button
                    className="app-button app-button--primary"
                    onClick={() => handleSave('active')}
                    type="button"
                  >
                    Publier l’intervention
                  </button>
                </>
              )}
            </div>
          </div>

          <aside className="admin-intervention-preview">
            <SectionCard className="admin-dashboard-card" title="Aperçu côté interne">
              <label className="field-stack">
                <span className="field-stack__label">Voie d’abord</span>
                <select
                  className="field-input"
                  onChange={(event) =>
                    setPreviewApproach(event.target.value as SurgicalApproach)
                  }
                  value={previewApproach}
                >
                  {previewApproachOptions.map((approach) => (
                    <option key={approach} value={approach}>
                      {getApproachLabel(approach)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="admin-intervention-preview__block">
                <strong>{draft.name || 'Nom de l’intervention'}</strong>
              </div>

              {previewConfig ? (
                <>
                  {(previewConfig.entryTechniques ?? []).filter((entryTechnique) => entryTechnique.active)
                    .length > 0 ? (
                    <div className="admin-intervention-preview__block">
                      <span className="admin-intervention-preview__label">
                        Techniques d’entrée
                      </span>
                      <ul className="admin-preview-bullet-list">
                        {(previewConfig.entryTechniques ?? [])
                          .filter((entryTechnique) => entryTechnique.active)
                          .map((entryTechnique) => (
                            <li key={entryTechnique.id}>
                              {getChoiceLabel(
                                entryTechniqueOptions,
                                entryTechnique.label,
                                entryTechnique.label
                              )}
                            </li>
                          ))}
                      </ul>
                    </div>
                  ) : null}

                  {sortedPreviewIndications.length ? (
                    <div className="admin-intervention-preview__block">
                      <span className="admin-intervention-preview__label">
                        Indications possibles
                      </span>
                      <ul className="admin-preview-bullet-list">
                        {sortedPreviewIndications.map((indicationOption) => (
                          <li key={indicationOption.id}>{indicationOption.label}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {draft.lateralityMode !== 'none' ? (
                    <div className="admin-intervention-preview__block">
                      <span className="admin-intervention-preview__label">Latéralité</span>
                      <ul className="admin-preview-bullet-list">
                        <li>Droite</li>
                        <li>Gauche</li>
                        {draft.lateralityMode === 'right_left_bilateral' ? (
                          <li>Bilatérale</li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}

                  <div className="admin-intervention-preview__block">
                    <span className="admin-intervention-preview__label">
                      Étapes opératoires ({previewConfig.steps.length})
                    </span>
                    <ol className="admin-preview-step-list">
                      {[...previewConfig.steps]
                        .sort((left, right) => left.order - right.order)
                        .map((step) => (
                          <li key={step.id}>{step.label || 'Étape à compléter'}</li>
                        ))}
                    </ol>
                  </div>
                </>
              ) : (
                <div className="validation-box">
                  <strong>Aucune voie d’abord sélectionnée</strong>
                  <span>
                    L’aperçu se mettra à jour automatiquement dès qu’une voie d’abord
                    active sera configurée.
                  </span>
                </div>
              )}

              <div className="admin-info-card admin-info-card--compact">
                <p>Aperçu mis à jour automatiquement selon vos sélections.</p>
              </div>
            </SectionCard>
          </aside>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="admin-page-toolbar">
        <button className="admin-breadcrumb-button" onClick={onBack} type="button">
          <ChevronLeft aria-hidden="true" />
          <span>Retour à l’accueil administrateur</span>
        </button>
      </div>

      <div className="admin-title-row">
        <div>
          <h2 className="admin-intervention-editor-title">Création des interventions</h2>
          <p className="admin-intervention-editor-subtitle">
            Configurer les interventions, leurs voies d’abord et les étapes
            opératoires évaluables.
          </p>
        </div>
        <button className="app-button app-button--primary" onClick={handleCreate} type="button">
          <Plus aria-hidden="true" />
          <span>Nouvelle intervention</span>
        </button>
      </div>

      {feedback ? (
        <div className={feedback.kind === 'success' ? 'auth-success' : 'auth-error'}>
          {feedback.message}
        </div>
      ) : null}

      <SectionCard className="admin-dashboard-card">
        <div className="admin-trophy-toolbar">
          <label className="admin-search-field">
            <Search aria-hidden="true" />
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une intervention..."
              type="search"
              value={search}
            />
          </label>

          <div className="admin-filter-chip-row">
            {LIST_FILTERS.map((option) => (
              <button
                className={`admin-filter-chip ${
                  filter === option.value ? 'admin-filter-chip--active' : ''
                }`}
                key={option.value}
                onClick={() => setFilter(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      <div className="admin-trophy-grid">
        {filteredInterventions.map((definition) => {
          const usedCount = getUsedCount(definition, savedInterventions);
          const isDeleteAllowed = usedCount === 0 && Boolean(definition.isCustom);

          return (
            <article className="admin-trophy-card admin-intervention-card" key={definition.id}>
              <div className="admin-intervention-card__header">
                <div className="admin-trophy-card__copy">
                  <div className="admin-trophy-card__title-row">
                    <strong>{definition.name}</strong>
                    <span className={STATUS_CLASSNAMES[definition.status ?? 'inactive']}>
                      {STATUS_LABELS[definition.status ?? 'inactive']}
                    </span>
                  </div>
                  <div className="admin-trophy-card__tags">
                    {definition.allowedApproaches.map((approach) => (
                      <span className="admin-tag-chip" key={approach}>
                        {getApproachLabel(approach)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="admin-intervention-card__meta">
                <span>
                  <ListOrdered aria-hidden="true" />
                  {countInterventionConfiguredSteps(definition)} étapes configurées
                </span>
                <span>
                  <CalendarDays aria-hidden="true" />
                  Dernière modification : {formatFrenchDate(definition.updatedAt)}
                </span>
              </div>

              <div className="admin-trophy-card__actions">
                <button
                  className="mini-button mini-button--secondary"
                  onClick={() => handleView(definition)}
                  type="button"
                >
                  <span>Voir</span>
                </button>
                <button
                  className="mini-button mini-button--secondary"
                  onClick={() => handleEdit(definition)}
                  type="button"
                >
                  <span>Modifier</span>
                </button>
                <button
                  className="mini-button mini-button--secondary"
                  onClick={() => handleDuplicate(definition)}
                  type="button"
                >
                  <span>Dupliquer</span>
                </button>
                <button
                  className={`admin-switch ${
                    definition.status === 'active' ? 'admin-switch--active' : ''
                  }`}
                  onClick={() => handleToggleStatus(definition)}
                  type="button"
                >
                  <span />
                </button>
                <div className="admin-card-menu">
                  <button
                    className="mini-button mini-button--secondary"
                    onClick={() =>
                      setOpenCardMenuId((current) =>
                        current === definition.id ? null : definition.id
                      )
                    }
                    type="button"
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </button>
                  {openCardMenuId === definition.id ? (
                    <div className="admin-card-menu__popover">
                      <button
                        className="admin-card-menu__item"
                        onClick={() => handleArchive(definition)}
                        type="button"
                      >
                        <Archive aria-hidden="true" />
                        <span>Archiver</span>
                      </button>
                      {isDeleteAllowed ? (
                        <button
                          className="admin-card-menu__item admin-card-menu__item--danger"
                          onClick={() => handleDelete(definition)}
                          type="button"
                        >
                          <Trash2 aria-hidden="true" />
                          <span>Supprimer</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
