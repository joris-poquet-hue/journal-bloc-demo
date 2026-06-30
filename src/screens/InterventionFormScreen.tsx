import {
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Eye,
  Gauge,
  LucideIcon,
  LucideProps,
  Signpost,
  UserRound,
  UsersRound,
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
  formatSeniorDisplayName,
  getApproachOptionsForIndication,
  getSurgicalInterventionDefinition,
  indicationOptions,
  lateralityOptions,
  roleOptions,
} from '../data/mockData';
import { ChoiceOption } from '../types';
import { formatIsoDate } from '../utils/date';

function SurgicalMaskIcon(props: LucideProps) {
  return (
    <svg
      fill="none"
      height="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={props.strokeWidth ?? 2}
      viewBox="0 0 24 24"
      width="24"
      {...props}
    >
      <path d="M4.5 10.5C6.2 8.9 8.8 8 12 8s5.8.9 7.5 2.5" />
      <path d="M6.5 10.5v4.2c0 .8.4 1.5 1 2l2.7 2c1.1.8 2.5.8 3.6 0l2.7-2c.6-.5 1-1.2 1-2v-4.2" />
      <path d="M9 12.5h6" />
      <path d="M9 15h6" />
      <path d="M6.5 11.5H5a2 2 0 0 0-2 2" />
      <path d="M17.5 11.5H19a2 2 0 0 1 2 2" />
    </svg>
  );
}

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
  const orderedLateralityOptions = ['gauche', 'bilateral', 'droite'].flatMap((value) =>
    lateralityOptions.filter((option) => option.value === value)
  );
  const orderedRoleOptions = [
    'operateur_principal',
    'aide_principal',
    'aide_secondaire',
    'observateur',
  ].flatMap((value) => roleOptions.filter((option) => option.value === value));
  const missingFieldsLabel =
    formMissingFields.length > 0
      ? `Champs à compléter : ${formMissingFields.join(', ')}.`
      : 'Tous les champs requis sont renseignés.';

  return (
    <InterventionFlowLayout
      step={1}
      title="Ajouter une intervention"
    >
      <InterventionFlowCard
        icon={CalendarDays}
        title="Date de l’intervention"
      >
        <label className="flow-input-shell flow-input-shell--date">
          <span className="flow-input-shell__display">{formatIsoDate(draft.date)}</span>
          <input
            aria-label="Date de l’intervention"
            className="flow-input-shell__control flow-input-shell__control--date-overlay"
            onChange={handleDateChange}
            type="date"
            value={draft.date}
          />
        </label>
      </InterventionFlowCard>

      <InterventionFlowCard
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

      <div className="flow-grid flow-grid--single">
        <InterventionFlowCard
          icon={SurgicalMaskIcon}
          title="Intervention"
        >
          <SelectField
            ariaLabel="Intervention"
            options={procedureOptions}
            placeholder="Sélectionne une intervention"
            value={draft.procedure}
            onChange={(value) => updateDraftField('procedure', value)}
          />
        </InterventionFlowCard>

        {isSalpingectomy ? (
          <ChoiceListCard
            className={
              !sortedIndicationOptions.length ? 'flow-card--empty' : undefined
            }
            emptyState="Aucune indication n'est à renseigner pour cette intervention."
            icon={ClipboardList}
            options={sortedIndicationOptions}
            title="Indication"
            value={draft.indication}
            onChange={(value) => updateDraftField('indication', value)}
          />
        ) : (
          <ChoiceListCard
            className={
              !shouldShowCustomIndication || !customIndicationOptions.length
                ? 'flow-card--empty'
                : undefined
            }
            emptyState="Aucune indication n'est à renseigner pour cette intervention."
            icon={ClipboardList}
            options={customIndicationOptions}
            title="Indication"
            value={draft.customIndication}
            onChange={(value) => updateDraftField('customIndication', value)}
            visible={shouldShowCustomIndication}
          />
        )}
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
        className={availableApproachOptions.length === 0 ? 'flow-card--empty' : undefined}
        icon={Eye}
        title="Voie d’abord et technique d’entrée"
      >
        {availableApproachOptions.length > 0 ? (
          <div className="flow-field-grid flow-field-grid--single">
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
                <strong className="flow-note-box__label">Technique d’entrée</strong>
              </div>
            )}
          </div>
        ) : (
          <p className="flow-empty-state">
            Aucune voie d’abord n’est à renseigner pour cette intervention.
          </p>
        )}
      </InterventionFlowCard>

      <div className="flow-grid flow-grid--single">
        <InterventionFlowCard
          description="Rôle que tu as eu sur au moins la moitié de l'intervention."
          icon={UsersRound}
          title="Rôle global"
        >
          <div className="flow-choice-stack flow-choice-stack--role" role="group" aria-label="Rôle global">
            {orderedRoleOptions.map((option) => (
              <button
                className={`flow-choice-pill flow-choice-pill--role ${
                  draft.role === option.value ? 'flow-choice-pill--selected' : ''
                }`.trim()}
                key={option.value}
                onClick={() => updateDraftField('role', option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </InterventionFlowCard>

        {shouldShowLaterality ? (
          <InterventionFlowCard
            icon={Signpost}
            title="Latéralité"
          >
            <div className="flow-choice-stack flow-choice-stack--laterality" role="group" aria-label="Latéralité">
              {orderedLateralityOptions.map((option) => (
                <button
                  className={`flow-choice-pill flow-choice-pill--laterality ${
                    draft.laterality === option.value ? 'flow-choice-pill--selected' : ''
                  }`.trim()}
                  key={option.value}
                  onClick={() => updateDraftField('laterality', option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
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
          className={`flow-select-field__select ${
            value == null ? 'flow-select-field__select--placeholder' : ''
          }`.trim()}
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
  description?: string;
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  icon: LucideIcon;
  emptyState?: string;
  visible?: boolean;
  className?: string;
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
  className,
}: ChoiceListCardProps<T>) {
  return (
    <InterventionFlowCard
      className={className}
      description={description}
      icon={icon}
      title={title}
    >
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
