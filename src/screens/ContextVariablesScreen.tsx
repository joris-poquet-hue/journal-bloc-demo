import {
  Activity,
  Check,
  ChevronDown,
  History,
  LucideIcon,
  UserRound,
} from 'lucide-react';
import { ReactNode, useState } from 'react';

import { InterventionFlowLayout } from '../components/InterventionFlowLayout';
import { useAppContext } from '../context/AppContext';
import {
  clinicalCountOptions,
  createEmptyClinicalContext,
  formatBloodLoss,
  formatBmi,
  getClinicalContextCompletion,
  isStructuredClinicalContext,
} from '../data/contextVariables';
import {
  ClinicalCountCategory,
  InterventionClinicalContext,
} from '../types';

type ContextSectionId = 'patient' | 'history' | 'intraoperative';

export function ContextVariablesScreen() {
  const {
    backToForm,
    draft,
    goToSummary,
    registerInterventionFormInteraction,
    updateDraftField,
  } = useAppContext();
  const [openSection, setOpenSection] =
    useState<ContextSectionId | null>('patient');
  const clinicalContext = isStructuredClinicalContext(draft.contextVariables)
    ? draft.contextVariables
    : createEmptyClinicalContext();
  const completion = getClinicalContextCompletion(clinicalContext);

  const updateContext = (nextContext: InterventionClinicalContext) => {
    updateDraftField('contextVariables', nextContext);
  };

  const updatePatient = (
    patch: Partial<InterventionClinicalContext['patient']>
  ) => {
    updateContext({
      ...clinicalContext,
      patient: {
        ...clinicalContext.patient,
        ...patch,
      },
    });
  };

  const updateHistory = (
    patch: Partial<InterventionClinicalContext['history']>
  ) => {
    updateContext({
      ...clinicalContext,
      history: {
        ...clinicalContext.history,
        ...patch,
      },
    });
  };

  const updateIntraoperative = (
    patch: Partial<InterventionClinicalContext['intraoperative']>
  ) => {
    updateContext({
      ...clinicalContext,
      intraoperative: {
        ...clinicalContext.intraoperative,
        ...patch,
      },
    });
  };

  return (
    <InterventionFlowLayout
      className="intervention-flow--context-variables"
      onBack={backToForm}
      onTrackInteraction={registerInterventionFormInteraction}
      step={2}
      subtitle="Renseigne, si tu le souhaites, les caractéristiques de la patiente et du contexte opératoire."
      title="Variables de contexte"
    >
      <div className="clinical-context-accordion">
        <ContextAccordionSection
          completed={completion.patient.completed}
          icon={UserRound}
          isComplete={completion.patient.isComplete}
          isOpen={openSection === 'patient'}
          onToggle={() =>
            setOpenSection((current) =>
              current === 'patient' ? null : 'patient'
            )
          }
          title="Patiente"
          total={completion.patient.total}
        >
          <div className="clinical-context-grid clinical-context-grid--patient">
            <label className="clinical-context-field">
              <span className="clinical-context-field__label">
                Âge de la patiente
              </span>
              <span className="clinical-context-number">
                <input
                  aria-label="Âge de la patiente"
                  inputMode="numeric"
                  max="120"
                  min="0"
                  onChange={(event) => {
                    const value = event.target.valueAsNumber;
                    updatePatient({
                      ageYears: Number.isFinite(value)
                        ? Math.round(value)
                        : null,
                    });
                  }}
                  placeholder="Ex. 42"
                  step="1"
                  type="number"
                  value={clinicalContext.patient.ageYears ?? ''}
                />
                <span aria-hidden="true">ans</span>
              </span>
            </label>

            <ContextRangeField
              endLabel="≥ 40"
              formatValue={formatBmi}
              label="IMC de la patiente"
              max={40}
              min={15}
              onChange={(bmi) => updatePatient({ bmi })}
              startLabel="≤ 15"
              step={0.1}
              value={clinicalContext.patient.bmi}
            />

            <BinaryChoice
              label="Tabac"
              onChange={(tobaccoUse) => updatePatient({ tobaccoUse })}
              value={clinicalContext.patient.tobaccoUse}
            />

            <CountChoice
              label="Parité"
              onChange={(parity) => updatePatient({ parity })}
              value={clinicalContext.patient.parity}
            />
          </div>
        </ContextAccordionSection>

        <ContextAccordionSection
          completed={completion.history.completed}
          icon={History}
          isComplete={completion.history.isComplete}
          isOpen={openSection === 'history'}
          onToggle={() =>
            setOpenSection((current) =>
              current === 'history' ? null : 'history'
            )
          }
          title="Antécédents"
          total={completion.history.total}
        >
          <div className="clinical-context-grid">
            <BinaryChoice
              label="Antécédent d’IGH"
              onChange={(igh) => updateHistory({ igh })}
              value={clinicalContext.history.igh}
            />
            <BinaryChoice
              label="Antécédent de pelvipéritonite"
              onChange={(pelvicPeritonitis) =>
                updateHistory({ pelvicPeritonitis })
              }
              value={clinicalContext.history.pelvicPeritonitis}
            />
            <div className="clinical-context-field clinical-context-field--wide">
              <BinaryChoice
                label="Antécédent de chirurgie abdomino-pelvienne"
                onChange={(abdominopelvicSurgery) =>
                  updateHistory({
                    abdominopelvicSurgery,
                    abdominopelvicSurgeryDetails: abdominopelvicSurgery
                      ? clinicalContext.history
                          .abdominopelvicSurgeryDetails
                      : '',
                  })
                }
                value={clinicalContext.history.abdominopelvicSurgery}
              />
              {clinicalContext.history.abdominopelvicSurgery ? (
                <label className="clinical-context-detail">
                  <span>Précision facultative</span>
                  <textarea
                    aria-label="Précision sur l’antécédent de chirurgie abdomino-pelvienne"
                    maxLength={500}
                    onChange={(event) =>
                      updateHistory({
                        abdominopelvicSurgeryDetails: event.target.value,
                      })
                    }
                    placeholder="Préciser l’intervention ou le contexte"
                    value={
                      clinicalContext.history
                        .abdominopelvicSurgeryDetails
                    }
                  />
                </label>
              ) : null}
            </div>
            <CountChoice
              label="Antécédent de césarienne"
              onChange={(cesareanCount) =>
                updateHistory({ cesareanCount })
              }
              value={clinicalContext.history.cesareanCount}
            />
          </div>
        </ContextAccordionSection>

        <ContextAccordionSection
          completed={completion.intraoperative.completed}
          icon={Activity}
          isComplete={completion.intraoperative.isComplete}
          isOpen={openSection === 'intraoperative'}
          onToggle={() =>
            setOpenSection((current) =>
              current === 'intraoperative' ? null : 'intraoperative'
            )
          }
          title="Per-opératoire"
          total={completion.intraoperative.total}
        >
          <div className="clinical-context-grid clinical-context-grid--intraoperative">
            <ContextRangeField
              endLabel="≥ 2 500 mL"
              formatValue={formatBloodLoss}
              label="Saignement per-opératoire"
              max={2500}
              min={0}
              onChange={(bloodLossMl) =>
                updateIntraoperative({ bloodLossMl })
              }
              startLabel="0 mL"
              step={50}
              value={clinicalContext.intraoperative.bloodLossMl}
            />
            <div className="clinical-context-field clinical-context-field--wide">
              <BinaryChoice
                label="Complication per-opératoire"
                onChange={(complication) =>
                  updateIntraoperative({
                    complication,
                    complicationDetails: complication
                      ? clinicalContext.intraoperative
                          .complicationDetails
                      : '',
                  })
                }
                value={clinicalContext.intraoperative.complication}
              />
              {clinicalContext.intraoperative.complication ? (
                <label className="clinical-context-detail">
                  <span>Précision facultative</span>
                  <textarea
                    aria-label="Précision sur la complication per-opératoire"
                    maxLength={500}
                    onChange={(event) =>
                      updateIntraoperative({
                        complicationDetails: event.target.value,
                      })
                    }
                    placeholder="Préciser la complication"
                    value={
                      clinicalContext.intraoperative
                        .complicationDetails
                    }
                  />
                </label>
              ) : null}
            </div>
          </div>
        </ContextAccordionSection>
      </div>

      <div className="flow-action-block clinical-context-action">
        <p
          className={`flow-action-block__hint ${
            completion.isComplete ? 'flow-action-block__hint--ready' : ''
          }`.trim()}
        >
          {completion.isComplete
            ? 'Toutes les variables facultatives sont renseignées.'
            : `Ces informations sont facultatives · ${completion.completed} sur ${completion.total} renseignées.`}
        </p>
        <button
          className="flow-button flow-button--primary"
          onClick={goToSummary}
          type="button"
        >
          Continuer
        </button>
      </div>
    </InterventionFlowLayout>
  );
}

function ContextAccordionSection({
  children,
  completed,
  icon: Icon,
  isComplete,
  isOpen,
  onToggle,
  title,
  total,
}: {
  children: ReactNode;
  completed: number;
  icon: LucideIcon;
  isComplete: boolean;
  isOpen: boolean;
  onToggle: () => void;
  title: string;
  total: number;
}) {
  return (
    <section
      className={`clinical-context-section ${
        isOpen ? 'clinical-context-section--open' : ''
      }`.trim()}
    >
      <button
        aria-expanded={isOpen}
        className="clinical-context-section__toggle"
        onClick={onToggle}
        type="button"
      >
        <span className="clinical-context-section__icon" aria-hidden="true">
          <Icon />
        </span>
        <span className="clinical-context-section__heading">
          <strong>{title}</strong>
          <span>
            {completed} / {total} renseigné{completed > 1 ? 's' : ''}
          </span>
        </span>
        {isComplete ? (
          <span
            aria-label="Section complète"
            className="clinical-context-section__complete"
          >
            <Check aria-hidden="true" />
          </span>
        ) : null}
        <ChevronDown
          aria-hidden="true"
          className="clinical-context-section__chevron"
        />
      </button>
      {isOpen ? (
        <div className="clinical-context-section__content">{children}</div>
      ) : null}
    </section>
  );
}

function BinaryChoice({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: boolean | null) => void;
  value: boolean | null;
}) {
  return (
    <fieldset className="clinical-context-field">
      <legend className="clinical-context-field__label">{label}</legend>
      <div
        aria-label={label}
        className="clinical-context-segmented"
        role="group"
      >
        {[
          { label: 'Non', value: false },
          { label: 'Oui', value: true },
        ].map((option) => {
          const isSelected = value === option.value;

          return (
            <button
              aria-pressed={isSelected}
              className={`clinical-context-segmented__option ${
                isSelected
                  ? 'clinical-context-segmented__option--selected'
                  : ''
              }`.trim()}
              key={option.label}
              onClick={() => onChange(isSelected ? null : option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function CountChoice({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: ClinicalCountCategory | null) => void;
  value: ClinicalCountCategory | null;
}) {
  return (
    <fieldset className="clinical-context-field">
      <legend className="clinical-context-field__label">{label}</legend>
      <div
        aria-label={label}
        className="clinical-context-segmented clinical-context-segmented--count"
        role="group"
      >
        {clinicalCountOptions.map((option) => {
          const isSelected = value === option.value;

          return (
            <button
              aria-pressed={isSelected}
              className={`clinical-context-segmented__option ${
                isSelected
                  ? 'clinical-context-segmented__option--selected'
                  : ''
              }`.trim()}
              key={option.value}
              onClick={() => onChange(isSelected ? null : option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ContextRangeField({
  endLabel,
  formatValue,
  label,
  max,
  min,
  onChange,
  startLabel,
  step,
  value,
}: {
  endLabel: string;
  formatValue: (value: number | null) => string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number | null) => void;
  startLabel: string;
  step: number;
  value: number | null;
}) {
  const displayValue = value ?? min + (max - min) / 2;

  return (
    <div className="clinical-context-field clinical-context-field--range">
      <span className="clinical-context-range__heading">
        <span className="clinical-context-field__label">{label}</span>
        <span className="clinical-context-range__value">
          <output className={value === null ? 'is-missing' : ''}>
            {value === null ? 'Non renseigné' : formatValue(value)}
          </output>
          {value !== null ? (
            <button
              className="clinical-context-range__clear"
              onClick={() => onChange(null)}
              type="button"
            >
              Effacer
            </button>
          ) : null}
        </span>
      </span>
      <input
        aria-label={label}
        className={`clinical-context-range ${
          value === null ? 'clinical-context-range--unanswered' : ''
        }`.trim()}
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.valueAsNumber)}
        step={step}
        type="range"
        value={displayValue}
      />
      <span className="clinical-context-range__limits" aria-hidden="true">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </span>
    </div>
  );
}
