import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import { useMemo, useState } from 'react';

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
    setAllChecklistLevels,
    setChecklistLevel,
  } = useAppContext();
  const [isScaleOpen, setIsScaleOpen] = useState(false);

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
      step={2}
      subtitle="Renseigne ton niveau d’autonomie étape par étape."
      title="Checklist technique"
    >
      <InterventionFlowCard
        action={
          <button
            aria-label={isScaleOpen ? 'Masquer le barème' : 'Afficher le barème'}
            aria-expanded={isScaleOpen}
            className="flow-icon-toggle"
            onClick={() => setIsScaleOpen((current) => !current)}
            type="button"
          >
            {isScaleOpen ? (
              <ChevronUp aria-hidden="true" strokeWidth={2.2} />
            ) : (
              <ChevronDown aria-hidden="true" strokeWidth={2.2} />
            )}
          </button>
        }
        description="Comprendre le barème"
        icon={BookOpen}
        title="Barème d’autonomie"
      >
        {isScaleOpen ? (
          <div className="flow-scale-list">
            {checklistLevelOptions.map((level) => (
              <article className="flow-scale-item" key={level.value}>
                <strong>
                  {level.label} · {level.description}
                </strong>
                <p>{checklistLevelDetails[level.value]}</p>
              </article>
            ))}
          </div>
        ) : null}
      </InterventionFlowCard>

      {checklistProgress.applicable ? (
        <>
          <InterventionFlowCard
            description="Applique un niveau à toutes les étapes, puis ajuste si besoin."
            title="Remplissage rapide"
          >
            <div className="flow-level-list">
              {checklistLevelOptions.map((level) => (
                <ChecklistLevelButton
                  key={level.value}
                  level={level.value}
                  onClick={() => setAllChecklistLevels(level.value)}
                />
              ))}
            </div>
          </InterventionFlowCard>

          <InterventionFlowCard title="Étapes de l’intervention">
            <div className="flow-checklist-table">
              {checklistSteps.map((step) => (
                <div className="flow-checklist-row" key={step.id}>
                  <strong className="flow-checklist-row__label">{step.label}</strong>
                  <div className="flow-checklist-row__actions">
                    {checklistLevelOptions.map((level) => (
                      <ChecklistLevelButton
                        key={level.value}
                        level={level.value}
                        onClick={() => setChecklistLevel(step.id, level.value)}
                        selected={draft.checklist[step.id] === level.value}
                      />
                    ))}
                  </div>
                </div>
              ))}
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

      <div className="flow-actions flow-actions--split">
        <button
          className="flow-button flow-button--secondary"
          onClick={backToForm}
          type="button"
        >
          Retour à l’étape 1
        </button>
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
