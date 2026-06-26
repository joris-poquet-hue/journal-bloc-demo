import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Eye,
  Gauge,
  LucideIcon,
  Scissors,
  UserRound,
} from 'lucide-react';
import { ChangeEvent } from 'react';

import { ComplexitySlider } from '../components/ComplexitySlider';
import { InterventionFlowCard } from '../components/InterventionFlowCard';
import { InterventionFlowLayout } from '../components/InterventionFlowLayout';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  entryTechniqueOptions,
  formatDisplayName,
  formatSeniorDisplayName,
  getApproachOptionsForIndication,
  getSurgicalInterventionDefinition,
  indicationOptions,
  lateralityOptions,
  roleOptions,
} from '../data/mockData';
import { ChoiceOption } from '../types';

export function InterventionFormScreen() {
  const {
    selectedInternal,
    draft,
    formMissingFields,
    customSurgicalInterventions,
    selectableSeniors,
    surgicalProcedureOptions,
    goToChecklist,
    backToWelcome,
    updateDraftField,
  } = useAppContext();

  if (!selectedInternal) {
    return (
      <ScreenContainer
        eyebrow="Journal"
        title="Aucun interne sélectionné"
        subtitle="Retourne à l’accueil pour choisir un profil."
      >
        <button
          className="flow-button flow-button--secondary"
          onClick={backToWelcome}
          type="button"
        >
          Retour à l’accueil
        </button>
      </ScreenContainer>
    );
  }

  const handleDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateDraftField('date', event.target.value);
  };

  const handleCommentChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    updateDraftField('indicationComment', event.target.value);
  };

  const isSalpingectomy = draft.procedure === 'salpingectomie';
  const interventionDefinition = getSurgicalInterventionDefinition(
    draft.procedure,
    customSurgicalInterventions
  );
  const isCustomIntervention = Boolean(interventionDefinition?.isCustom);
  const customIndicationOptions = sortOptionsWithOtherLast(
    (interventionDefinition?.indications ?? []).map((indication) => ({
      value: indication,
      label: indication,
    }))
  );
  const salpingectomyApproachOptions =
    isSalpingectomy && interventionDefinition?.isCustom
      ? getApproachOptionsForIndication(draft.indication).filter((option) =>
          interventionDefinition.allowedApproaches.includes(option.value)
        )
      : getApproachOptionsForIndication(draft.indication);
  const availableApproachOptions = sortOptionsAlphabetically(
    isSalpingectomy
      ? salpingectomyApproachOptions
      : approachOptions.filter((option) =>
          interventionDefinition?.allowedApproaches.includes(option.value)
        )
  );
  const availableEntryTechniqueOptions = sortOptionsAlphabetically(
    isCustomIntervention
      ? entryTechniqueOptions.filter((option) =>
          interventionDefinition?.allowedEntryTechniques.includes(option.value)
        )
      : entryTechniqueOptions
  );
  const shouldShowEntryTechnique =
    draft.approach === 'coelioscopie' || draft.approach === 'robot';
  const shouldShowLaterality =
    isSalpingectomy || Boolean(interventionDefinition?.requiresLaterality);
  const shouldShowCustomIndication =
    !isSalpingectomy && isCustomIntervention && customIndicationOptions.length > 0;

  const seniorOptions = sortOptionsWithOtherLast(
    selectableSeniors.map((senior) => ({
      value: senior.id,
      label: formatSeniorDisplayName(senior),
    }))
  );
  const procedureOptions = sortOptionsWithOtherLast(surgicalProcedureOptions);
  const sortedIndicationOptions = sortOptionsWithOtherLast(indicationOptions);
  const sortedLateralityOptions = sortOptionsAlphabetically(lateralityOptions);
  const sortedRoleOptions = sortOptionsAlphabetically(roleOptions);
  const missingFieldsLabel =
    formMissingFields.length > 0
      ? `Champs à compléter : ${formMissingFields.join(', ')}.`
      : 'Tous les champs requis sont renseignés.';

  return (
    <InterventionFlowLayout
      onBack={backToWelcome}
      step={1}
      subtitle={`${formatDisplayName(selectedInternal.firstName, selectedInternal.lastName)} · ${selectedInternal.currentRotation}`}
      title="Ajouter une intervention"
    >
      <InterventionFlowCard
        description="Date préremplie à aujourd’hui, modifiable si nécessaire."
        icon={CalendarDays}
        title="Date de l’intervention"
      >
        <label className="flow-input-shell">
          <input
            aria-label="Date de l’intervention"
            className="flow-input-shell__control"
            onChange={handleDateChange}
            type="date"
            value={draft.date}
          />
          <CalendarDays aria-hidden="true" className="flow-input-shell__icon" />
        </label>
      </InterventionFlowCard>

      <InterventionFlowCard
        description="Choisis le senior superviseur de l’intervention."
        icon={UserRound}
        title="Senior"
      >
        <SelectField
          ariaLabel="Senior superviseur"
          options={seniorOptions}
          placeholder="Sélectionne un senior"
          value={draft.seniorId}
          onChange={(value) => updateDraftField('seniorId', value)}
        />
      </InterventionFlowCard>

      <InterventionFlowCard
        description="Évalue la difficulté globale selon ton ressenti, de 1 à 10."
        icon={Gauge}
        title="Difficulté ressentie"
      >
        <ComplexitySlider
          onChange={(value) => updateDraftField('complexity', value)}
          value={draft.complexity}
        />
      </InterventionFlowCard>

      <div className="flow-grid flow-grid--two">
        <ChoiceListCard
          description="Choisis l’intervention à ajouter au journal."
          icon={Scissors}
          options={procedureOptions}
          title="Intervention"
          value={draft.procedure}
          onChange={(value) => updateDraftField('procedure', value)}
        />

        <ChoiceListCard
          description="Indication principale de l’intervention."
          emptyState="Aucune indication spécifique pour cette intervention."
          icon={ClipboardList}
          options={isSalpingectomy ? sortedIndicationOptions : customIndicationOptions}
          title="Indication"
          value={isSalpingectomy ? draft.indication : draft.customIndication}
          onChange={(value) =>
            isSalpingectomy
              ? updateDraftField('indication', value)
              : updateDraftField('customIndication', value)
          }
          visible={isSalpingectomy || shouldShowCustomIndication}
        />
      </div>

      {isSalpingectomy && draft.indication === 'autre' ? (
        <InterventionFlowCard
          description="Tu peux préciser l’indication en quelques mots."
          title="Précision libre"
        >
          <textarea
            aria-label="Précision libre de l’indication"
            className="flow-textarea"
            onChange={handleCommentChange}
            placeholder="Exemple : contexte particulier"
            value={draft.indicationComment}
          />
        </InterventionFlowCard>
      ) : null}

      <InterventionFlowCard
        description="Précise la voie d’abord utilisée et la technique d’entrée associée."
        icon={Eye}
        title="Voie d’abord et technique d’entrée"
      >
        {availableApproachOptions.length > 0 ? (
          <div className="flow-field-grid">
            <SelectField
              ariaLabel="Voie d’abord"
              label="Voie d’abord"
              options={availableApproachOptions}
              placeholder="Choisir"
              value={draft.approach}
              onChange={(value) => updateDraftField('approach', value)}
            />
            {shouldShowEntryTechnique ? (
              <SelectField
                ariaLabel="Technique d’entrée"
                label="Technique d’entrée"
                options={availableEntryTechniqueOptions}
                placeholder="Choisir"
                value={draft.entryTechnique}
                onChange={(value) => updateDraftField('entryTechnique', value)}
              />
            ) : (
              <div className="flow-note-box">
                <strong>Technique d’entrée</strong>
                <span>
                  Affichée uniquement pour la cœlioscopie et le robot.
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="flow-empty-state">
            Aucune voie d’abord spécifique n’est à renseigner pour cette intervention.
          </p>
        )}
      </InterventionFlowCard>

      <div
        className={`flow-grid ${
          shouldShowLaterality ? 'flow-grid--two' : 'flow-grid--single'
        }`}
      >
        <InterventionFlowCard
          description="Rôle au cours de l’intervention."
          title="Rôle global"
        >
          <SelectField
            ariaLabel="Rôle global"
            options={sortedRoleOptions}
            placeholder="Choisir"
            value={draft.role}
            onChange={(value) => updateDraftField('role', value)}
          />
        </InterventionFlowCard>

        {shouldShowLaterality ? (
          <InterventionFlowCard
            description="Précise le côté concerné si nécessaire."
            title="Latéralité"
          >
            <SelectField
              ariaLabel="Latéralité"
              options={sortedLateralityOptions}
              placeholder="Choisir"
              value={draft.laterality}
              onChange={(value) => updateDraftField('laterality', value)}
            />
          </InterventionFlowCard>
        ) : null}
      </div>

      <div className="flow-action-block">
        <p
          className={`flow-action-block__hint ${
            formMissingFields.length === 0 ? 'flow-action-block__hint--ready' : ''
          }`.trim()}
        >
          {missingFieldsLabel}
        </p>
        <button
          className="flow-button flow-button--primary"
          disabled={formMissingFields.length > 0}
          onClick={goToChecklist}
          type="button"
        >
          Continuer
        </button>
      </div>
    </InterventionFlowLayout>
  );
}

type SelectFieldProps<T extends string> = {
  value: T | null;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  placeholder: string;
  label?: string;
  ariaLabel: string;
};

function SelectField<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  label,
  ariaLabel,
}: SelectFieldProps<T>) {
  return (
    <label className="flow-select-field">
      {label ? <span className="flow-select-field__label">{label}</span> : null}
      <span className="flow-select-field__control">
        <select
          aria-label={ariaLabel}
          className="flow-select-field__select"
          onChange={(event) => {
            if (!event.target.value) {
              return;
            }

            onChange(event.target.value as T);
          }}
          value={value ?? ''}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="flow-select-field__chevron" />
      </span>
    </label>
  );
}

type ChoiceListCardProps<T extends string> = {
  title: string;
  description: string;
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  icon: LucideIcon;
  emptyState?: string;
  visible?: boolean;
};

function ChoiceListCard<T extends string>({
  title,
  description,
  options,
  value,
  onChange,
  icon,
  emptyState,
  visible = true,
}: ChoiceListCardProps<T>) {
  return (
    <InterventionFlowCard description={description} icon={icon} title={title}>
      {visible && options.length > 0 ? (
        <div className="flow-choice-stack">
          {options.map((option) => (
            <button
              className={`flow-choice-pill ${
                value === option.value ? 'flow-choice-pill--selected' : ''
              }`.trim()}
              key={option.value}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="flow-empty-state">{emptyState ?? 'Aucune option disponible.'}</p>
      )}
    </InterventionFlowCard>
  );
}

function sortOptionsAlphabetically<T extends string>(options: ChoiceOption<T>[]) {
  return [...options].sort((left, right) =>
    left.label.localeCompare(right.label, 'fr-FR', { sensitivity: 'base' })
  );
}

function sortOptionsWithOtherLast<T extends string>(options: ChoiceOption<T>[]) {
  return [...options].sort((left, right) => {
    const leftIsOther = left.label.toLocaleLowerCase('fr-FR') === 'autre';
    const rightIsOther = right.label.toLocaleLowerCase('fr-FR') === 'autre';

    if (leftIsOther && !rightIsOther) {
      return 1;
    }

    if (!leftIsOther && rightIsOther) {
      return -1;
    }

    return left.label.localeCompare(right.label, 'fr-FR', {
      sensitivity: 'base',
    });
  });
}
