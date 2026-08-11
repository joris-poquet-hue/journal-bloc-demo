import { ChevronDown } from 'lucide-react';
import { type CSSProperties } from 'react';

import { type ChecklistLevel } from '../../types';

const SLIDER_LEVELS = ['0', '1', '2', '3', '4'] as const;
const SLIDER_COLORS = [
  '#ef5a3c',
  '#f1a31b',
  '#a8c84a',
  '#58ad72',
  '#0a9da8',
] as const;
const DISPLAY_LABELS: Record<ChecklistLevel, string> = {
  NA: 'Non applicable',
  '0': 'Observé uniquement',
  '1': 'Montré et expliqué',
  '2': 'Assistance active du senior',
  '3': 'Assistance passive du senior',
  '4': 'Supervision seule',
};

type SeniorChecklistEditorProps = {
  activeStepId: string | null;
  onActiveStepChange: (stepId: string) => void;
  onValueChange: (stepId: string, level: ChecklistLevel | null) => void;
  steps: Array<{ id: string; label: string }>;
  values: Record<string, ChecklistLevel | null>;
};

export function SeniorChecklistEditor({
  activeStepId,
  onActiveStepChange,
  onValueChange,
  steps,
  values,
}: SeniorChecklistEditorProps) {
  const resolvedActiveStepId = steps.some((step) => step.id === activeStepId)
    ? activeStepId
    : steps.find((step) => values[step.id] == null)?.id ?? steps[0]?.id ?? null;

  return (
    <div className="senior-checklist-editor">
      {steps.map((step) => {
        const selectedLevel = values[step.id] ?? null;
        const isExpanded = step.id === resolvedActiveStepId;

        if (!isExpanded) {
          return (
            <button
              aria-expanded="false"
              className="senior-checklist-editor__collapsed-step"
              key={step.id}
              onClick={() => onActiveStepChange(step.id)}
              type="button"
            >
              <strong>{step.label}</strong>
              <span
                className={`senior-checklist-editor__collapsed-value ${
                  selectedLevel === 'NA'
                    ? 'senior-checklist-editor__collapsed-value--na'
                    : ''
                }`.trim()}
              >
                {selectedLevel && selectedLevel !== 'NA' ? (
                  <b>{selectedLevel}</b>
                ) : null}
                {selectedLevel ? DISPLAY_LABELS[selectedLevel] : 'À renseigner'}
              </span>
              <ChevronDown aria-hidden="true" />
            </button>
          );
        }

        const hasNumericValue = selectedLevel != null && selectedLevel !== 'NA';
        const sliderValue = hasNumericValue ? Number(selectedLevel) : 2;
        const sliderPosition = `${sliderValue * 25}%`;
        const sliderLabel = hasNumericValue
          ? DISPLAY_LABELS[selectedLevel]
          : selectedLevel == null
            ? 'Déplacer le curseur'
            : null;

        return (
          <div
            aria-label={step.label}
            className="senior-checklist-editor__expanded-step"
            key={step.id}
            role="group"
          >
            <div className="senior-checklist-editor__expanded-header">
              <button
                aria-expanded="true"
                className="senior-checklist-editor__expanded-title"
                onClick={() => onActiveStepChange(step.id)}
                type="button"
              >
                <strong>{step.label}</strong>
                <ChevronDown aria-hidden="true" />
              </button>
              <button
                aria-label={
                  selectedLevel === 'NA'
                    ? `Désélectionner Non applicable pour ${step.label}`
                    : `Sélectionner Non applicable pour ${step.label}`
                }
                aria-pressed={selectedLevel === 'NA'}
                className={`senior-checklist-editor__na-button ${
                  selectedLevel === 'NA'
                    ? 'senior-checklist-editor__na-button--selected'
                    : ''
                }`.trim()}
                onClick={() =>
                  onValueChange(step.id, selectedLevel === 'NA' ? null : 'NA')
                }
                type="button"
              >
                <b>NA</b>
                <span>Non applicable</span>
              </button>
            </div>

            <div
              className={`senior-checklist-slider ${
                selectedLevel === 'NA' ? 'senior-checklist-slider--na' : ''
              }`.trim()}
              style={
                {
                  '--senior-slider-position': sliderPosition,
                  '--senior-slider-thumb-color':
                    selectedLevel === 'NA'
                      ? '#b7cbd4'
                      : SLIDER_COLORS[sliderValue],
                } as CSSProperties
              }
            >
              {sliderLabel ? (
                <output className="senior-checklist-slider__label">
                  {sliderLabel}
                </output>
              ) : null}
              <input
                aria-label={`Niveau d’autonomie pour ${step.label}`}
                aria-valuetext={
                  hasNumericValue ? DISPLAY_LABELS[selectedLevel] : undefined
                }
                max="4"
                min="0"
                onChange={(event) =>
                  onValueChange(
                    step.id,
                    String(event.currentTarget.value) as ChecklistLevel
                  )
                }
                step="1"
                type="range"
                value={sliderValue}
              />
              <div aria-hidden="true" className="senior-checklist-slider__ticks">
                {SLIDER_LEVELS.map((level) => (
                  <span key={level}>{level}</span>
                ))}
              </div>
              <div className="senior-checklist-slider__endpoints">
                <span>Observé uniquement</span>
                <span>Supervision seule</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
