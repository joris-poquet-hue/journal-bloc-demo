import { useMemo } from 'react';

import { InterventionFlowCard } from '../components/InterventionFlowCard';
import { InterventionFlowLayout } from '../components/InterventionFlowLayout';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import {
  checklistLevelDetails,
  checklistLevelOptions,
  getChecklistStepsForIntervention,
} from '../data/mockData';
import {
  formatChecklistAverage,
  getChecklistAverage,
} from '../utils/checklistSummary';

export function ChecklistScreen() {
  const {
    selectedInternal,
    draft,
    checklistProgress,
    customSurgicalInterventions,
    backToForm,
    goToSummary,
    registerInterventionFormInteraction,
    setAllChecklistLevels,
    setChecklistLevel,
  } = useAppContext();

  const checklistSteps = useMemo(
    () =>
      getChecklistStepsForIntervention(
        draft.procedure,
        draft.indication,
        draft.approach,
        draft.entryTechnique,
        customSurgicalInterventions
      ),
    [
      customSurgicalInterventions,
      draft.approach,
      draft.entryTechnique,
      draft.indication,
      draft.procedure,
    ]
  );

  if (!selectedInternal) {
    return (
      <ScreenContainer
        eyebrow="Checklist"
        title="Interne manquant"
        subtitle="Retourne au formulaire pour reprendre la saisie."
      >
        <button
          className="flow-button flow-button--secondary"
          onClick={backToForm}
          type="button"
        >
          Retour à l’étape 1
        </button>
      </ScreenContainer>
    );
  }

  const autonomyAverage = getChecklistAverage(
    checklistSteps.map((step) => draft.checklist[step.id])
  );

  return (
    <InterventionFlowLayout
      onBack={backToForm}
      onTrackInteraction={registerInterventionFormInteraction}
      step={2}
      subtitle="Renseigne ton niveau d’autonomie étape par étape."
      title="Checklist technique"
    >
      {checklistProgress.applicable ? (
        <>
          <InterventionFlowCard
            className="flow-card--quick-fill"
            title="Remplissage rapide"
          >
            <p className="flow-card__lede">
              Applique un niveau à toutes les étapes, puis affine ligne par ligne si
              besoin.
            </p>
            <div className="flow-level-list flow-level-list--quick-fill">
              {checklistLevelOptions.map((level) => (
                <ChecklistLevelButton
                  key={level.value}
                  level={level.value}
                  onClick={() => setAllChecklistLevels(level.value)}
                />
              ))}
            </div>
          </InterventionFlowCard>

          <InterventionFlowCard
            className="flow-card--checklist"
            title="Étapes de l’intervention"
          >
            <p className="flow-card__lede flow-card__lede--muted">
              Sélectionne un niveau pour afficher immédiatement le repère associé.
            </p>
            <div className="flow-checklist-table">
              {checklistSteps.map((step, index) => {
                const selectedLevel = draft.checklist[step.id];
                const selectedLevelOption = selectedLevel
                  ? checklistLevelOptions.find((level) => level.value === selectedLevel) ?? null
                  : null;

                return (
                  <div
                    className={`flow-checklist-row ${
                      selectedLevel ? 'flow-checklist-row--selected' : ''
                    }`.trim()}
                    key={step.id}
                  >
                    <div className="flow-checklist-row__heading">
                      <span className="flow-checklist-row__index">
                        {(index + 1).toString().padStart(2, '0')}
                      </span>
                      <strong className="flow-checklist-row__label">{step.label}</strong>
                    </div>
                    <div className="flow-checklist-row__actions-shell">
                      <span className="flow-checklist-row__actions-label">
                        Niveau d’autonomie
                      </span>
                      <div className="flow-checklist-row__actions">
                        {checklistLevelOptions.map((level) => (
                          <ChecklistLevelButton
                            key={level.value}
                            level={level.value}
                            onClick={() => setChecklistLevel(step.id, level.value)}
                            selected={selectedLevel === level.value}
                          />
                        ))}
                      </div>
                    </div>
                    {selectedLevel && selectedLevelOption ? (
                      <div
                        className={`flow-checklist-row__detail flow-checklist-row__detail--${getLevelColorName(
                          selectedLevel
                        )}`}
                      >
                        <strong className="flow-checklist-row__detail-title">
                          {selectedLevelOption.label} · {selectedLevelOption.description}
                        </strong>
                        <p>{checklistLevelDetails[selectedLevel]}</p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </InterventionFlowCard>
        </>
      ) : (
        <InterventionFlowCard
          description="Aucune checklist spécifique n’est définie pour cette intervention."
          title="Étapes de l’intervention"
        >
          <p className="flow-empty-state">
            Tu peux poursuivre directement vers le récapitulatif.
          </p>
        </InterventionFlowCard>
      )}

      <InterventionFlowCard className="flow-summary-card">
        <div className="flow-summary-card__body">
          <div>
            <strong className="flow-summary-card__headline">
              {checklistProgress.completed} / {checklistProgress.total} étapes
              renseignées
            </strong>
            <p className="flow-summary-card__caption">Autonomie moyenne</p>
          </div>
          <span className="flow-score-badge">
            {formatChecklistAverage(autonomyAverage)}
          </span>
        </div>
      </InterventionFlowCard>

      <div className="flow-actions">
        <button
          className="flow-button flow-button--primary"
          disabled={!checklistProgress.isComplete}
          onClick={goToSummary}
          type="button"
        >
          Continuer
        </button>
      </div>
    </InterventionFlowLayout>
  );
}

function ChecklistLevelButton({
  level,
  selected = false,
  onClick,
}: {
  level: 'NA' | '0' | '1' | '2' | '3' | '4';
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={`flow-level-pill flow-level-pill--${getLevelColorName(level)} ${
        selected ? 'flow-level-pill--selected' : ''
      }`.trim()}
      onClick={onClick}
      type="button"
    >
      {level}
    </button>
  );
}

function getLevelColorName(level: 'NA' | '0' | '1' | '2' | '3' | '4') {
  if (level === 'NA') {
    return 'na';
  }

  return `level-${level}`;
}
