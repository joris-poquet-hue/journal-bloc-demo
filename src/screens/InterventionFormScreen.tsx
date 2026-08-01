import {
  CalendarDays,
  ChevronDown,
  CirclePlus,
  ClipboardList,
  Clock3,
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
  surgeryContextOptions,
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

function formatStartTimeInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normalizeStartTimeInput(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return value;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) {
    return value;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function InterventionFormScreen() {
  const {
    selectedInternal,
    draft,
    formMissingFields,
    customSurgicalInterventions,
    selectableSeniors,
    surgicalProcedureOptions,
    goToContextVariables,
    backToWelcome,
    updateDraftField,
    registerInterventionFormInteraction,
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

  const handleStartTimeChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateDraftField(
      'startTime',
      formatStartTimeInput(event.target.value) || null
    );
  };

  const handleStartTimeBlur = () => {
    updateDraftField(
      'startTime',
      normalizeStartTimeInput(draft.startTime ?? null)
    );
  };

  const handleDurationChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.valueAsNumber;
    updateDraftField(
      'operativeDurationMinutes',
      Number.isFinite(value) ? Math.round(value) : null
    );
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
  const indicationEmptyState = draft.procedure
    ? "Aucune indication n'est à renseigner pour cette intervention."
    : 'Sélectionnez une intervention.';
  const approachEmptyState = draft.procedure
    ? 'Aucune voie d’abord n’est à renseigner pour cette intervention.'
    : 'Sélectionnez une intervention.';

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
  const isNativeApp =
    typeof window !== 'undefined' &&
    Boolean(
      (window as Window & { __MONJDB_NATIVE_APP__?: boolean })
        .__MONJDB_NATIVE_APP__
    );
  const dateCard = (
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
  );

  const seniorCard = (
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
  );

  const timingCard = (
    <InterventionFlowCard
      icon={Clock3}
      title="Horaire et durée opératoire"
    >
      <div className="flow-field-grid flow-field-grid--timing">
        <label className="flow-plain-field">
          <span className="flow-plain-field__label">Heure de début</span>
          <input
            aria-label="Heure de début de l’intervention"
            autoComplete="off"
            className="flow-plain-field__control"
            data-form-type="other"
            inputMode="numeric"
            maxLength={5}
            onBlur={handleStartTimeBlur}
            onChange={handleStartTimeChange}
            pattern="[0-2][0-9]:[0-5][0-9]"
            spellCheck={false}
            type="text"
            value={draft.startTime ?? ''}
          />
        </label>
        <label className="flow-plain-field">
          <span className="flow-plain-field__label">Durée en minutes</span>
          <span className="flow-plain-field__number-shell">
            <input
              aria-label="Durée opératoire en minutes"
              autoComplete="off"
              className="flow-plain-field__control"
              inputMode="numeric"
              min="1"
              onChange={handleDurationChange}
              step="1"
              type="number"
              value={draft.operativeDurationMinutes ?? ''}
            />
            <span aria-hidden="true">min</span>
          </span>
        </label>
      </div>
    </InterventionFlowCard>
  );

  const assessmentCard = (
    <InterventionFlowCard
      icon={CirclePlus}
      title="Cadre de l’intervention"
    >
      <div className="intervention-form-context-difficulty">
        <div
          aria-label="Cadre de l’intervention"
          className="flow-choice-stack flow-choice-stack--context"
          role="group"
        >
          {surgeryContextOptions.map((option) => (
            <button
              aria-pressed={draft.context === option.value}
              className={`flow-choice-pill flow-choice-pill--context ${
                draft.context === option.value
                  ? 'flow-choice-pill--selected'
                  : ''
              }`.trim()}
              key={option.value}
              onClick={() => updateDraftField('context', option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="intervention-form-context-difficulty__complexity">
          <div className="intervention-form-context-difficulty__heading">
            <span aria-hidden="true">
              <Gauge strokeWidth={2.1} />
            </span>
            <strong>Difficulté ressentie</strong>
          </div>
          <ComplexitySlider
            onChange={(value) => updateDraftField('complexity', value)}
            value={draft.complexity}
          />
        </div>
      </div>
    </InterventionFlowCard>
  );

  const procedureCard = (
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
  );

  const indicationCard = isSalpingectomy ? (
    <ChoiceListCard
      className={
        !sortedIndicationOptions.length ? 'flow-card--empty' : undefined
      }
      emptyState={indicationEmptyState}
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
      emptyState={indicationEmptyState}
      icon={ClipboardList}
      options={customIndicationOptions}
      title="Indication"
      value={draft.customIndication}
      onChange={(value) => updateDraftField('customIndication', value)}
      visible={shouldShowCustomIndication}
    />
  );

  const customIndicationCard =
    isSalpingectomy && draft.indication === 'autre' ? (
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
    ) : null;

  const approachCard = (
    <InterventionFlowCard
      className={availableApproachOptions.length === 0 ? 'flow-card--empty' : undefined}
      icon={Eye}
      title="Voie d’abord et technique d’entrée"
    >
      {availableApproachOptions.length > 0 ? (
        <div className="flow-field-grid flow-field-grid--single">
          <SelectField
            ariaLabel="Voie d’abord"
            label={isNativeApp ? 'Voie d’abord' : undefined}
            options={availableApproachOptions}
            placeholder="Choisir"
            value={draft.approach}
            onChange={(value) => updateDraftField('approach', value)}
          />
          {shouldShowEntryTechnique ? (
            <SelectField
              ariaLabel="Technique d’entrée"
              label={isNativeApp ? 'Technique d’entrée' : undefined}
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
        <p className="flow-empty-state">{approachEmptyState}</p>
      )}
    </InterventionFlowCard>
  );

  const roleCard = (
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
  );

  const lateralityCard = shouldShowLaterality ? (
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
  ) : null;

  const actionBlock = (
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
        onClick={goToContextVariables}
        type="button"
      >
        Continuer
      </button>
    </div>
  );

  if (isNativeApp) {
    return (
      <InterventionFlowLayout
        onTrackInteraction={registerInterventionFormInteraction}
        step={1}
        title="Ajouter une intervention"
      >
        {dateCard}
        {timingCard}
        {seniorCard}
        {assessmentCard}
        <div className="flow-grid flow-grid--single">
          {procedureCard}
          {indicationCard}
        </div>
        {customIndicationCard}
        {approachCard}
        <div className="flow-grid flow-grid--single">
          {roleCard}
          {lateralityCard}
        </div>
        {actionBlock}
      </InterventionFlowLayout>
    );
  }

  return (
    <InterventionFlowLayout
      className="intervention-flow--form-showcase"
      eyebrow="Nouvelle intervention"
      onTrackInteraction={registerInterventionFormInteraction}
      step={1}
      title="Construis ta fiche opératoire"
    >
      <div className="intervention-form-web">
        <div className="intervention-form-web__fields">
          <div className="intervention-form-web__two-columns">
            {dateCard}
            {seniorCard}
          </div>
          {timingCard}
          {procedureCard}
          <div className="intervention-form-web__two-columns intervention-form-web__two-columns--details">
            {indicationCard}
            {approachCard}
          </div>
          {customIndicationCard}
          <div className="intervention-form-web__two-columns intervention-form-web__two-columns--assessment">
            {assessmentCard}
            {roleCard}
          </div>
          {lateralityCard}
          {actionBlock}
        </div>
      </div>
    </InterventionFlowLayout>
  );
}

/*
 * Les composants ci-dessous restent partagés par les deux présentations.
 * Le parcours et les valeurs métier demeurent strictement identiques.
 */
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
