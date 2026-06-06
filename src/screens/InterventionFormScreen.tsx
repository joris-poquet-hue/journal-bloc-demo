import { ChangeEvent } from 'react';

import { ChoiceGroup } from '../components/ChoiceGroup';
import { ComplexitySlider } from '../components/ComplexitySlider';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  entryTechniqueOptions,
  formatDisplayName,
  getApproachOptionsForIndication,
  getChoiceLabel,
  getChecklistStepsForIntervention,
  getSurgicalInterventionDefinition,
  indicationOptions,
  lateralityOptions,
  roleOptions,
  seniors,
} from '../data/mockData';

export function InterventionFormScreen() {
  const {
    selectedInternal,
    draft,
    formMissingFields,
    customSurgicalInterventions,
    surgicalProcedureOptions,
    goToChecklist,
    goToSummary,
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
        <PrimaryButton label="Retour à l’accueil" onPress={backToWelcome} />
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
  const customIndicationOptions = (interventionDefinition?.indications ?? []).map(
    (indication) => ({
      value: indication,
      label: indication,
    })
  );
  const salpingectomyApproachOptions =
    isSalpingectomy && interventionDefinition?.isCustom
      ? getApproachOptionsForIndication(draft.indication).filter((option) =>
          interventionDefinition.allowedApproaches.includes(option.value)
        )
      : getApproachOptionsForIndication(draft.indication);
  const availableApproachOptions = isSalpingectomy
    ? salpingectomyApproachOptions
    : approachOptions.filter((option) =>
        interventionDefinition?.allowedApproaches.includes(option.value)
      );
  const availableEntryTechniqueOptions = isCustomIntervention
    ? entryTechniqueOptions.filter((option) =>
        interventionDefinition?.allowedEntryTechniques.includes(option.value)
      )
    : entryTechniqueOptions;
  const shouldShowApproach =
    isSalpingectomy || availableApproachOptions.length > 0;
  const shouldShowEntryTechnique =
    draft.approach === 'coelioscopie' || draft.approach === 'robot';
  const shouldShowLaterality =
    isSalpingectomy || Boolean(interventionDefinition?.requiresLaterality);
  const shouldShowCustomIndication =
    !isSalpingectomy && isCustomIntervention && customIndicationOptions.length > 0;
  const checklistSteps = getChecklistStepsForIntervention(
    draft.procedure,
    draft.indication,
    draft.approach,
    draft.entryTechnique,
    customSurgicalInterventions
  );
  const hasChecklist = checklistSteps.length > 0;

  return (
    <ScreenContainer
      eyebrow="Étape 1 sur 3"
      title="Ajouter une intervention"
      subtitle={`${formatDisplayName(selectedInternal.firstName, selectedInternal.lastName)} · ${selectedInternal.currentRotation}`}
    >
      <SectionCard
        title="Date du bloc"
        description="Date préremplie à aujourd’hui, modifiable si nécessaire."
      >
        <label className="field-stack">
          <input
            className="field-input"
            onChange={handleDateChange}
            type="date"
            value={draft.date}
          />
        </label>
      </SectionCard>

      <ChoiceGroup
        columns={1}
        description="Choisis le senior superviseur de l’intervention."
        onChange={(value) => updateDraftField('seniorId', value)}
        options={seniors.map((senior) => ({
          value: senior.id,
          label: `${senior.firstName} ${senior.lastName}`,
        }))}
        title="Senior"
        value={draft.seniorId}
      />

      <ChoiceGroup
        description="Choisis l’intervention à enregistrer."
        onChange={(value) => updateDraftField('procedure', value)}
        options={surgicalProcedureOptions}
        title="Intervention"
        value={draft.procedure}
      />

      {isSalpingectomy ? (
        <>
          <ChoiceGroup
            description="Indication principale de l’intervention."
            onChange={(value) => updateDraftField('indication', value)}
            options={indicationOptions}
            title="Indication"
            value={draft.indication}
          />

          {draft.indication === 'autre' ? (
            <SectionCard
              title="Précision libre"
              description="Tu peux préciser l’indication en quelques mots."
            >
              <label className="field-stack">
                <span className="field-stack__label">Commentaire</span>
                <textarea
                  className="field-input field-input--textarea"
                  onChange={handleCommentChange}
                  placeholder="Exemple : contexte particulier"
                  value={draft.indicationComment}
                />
              </label>
            </SectionCard>
          ) : null}

        </>
      ) : null}

      {shouldShowCustomIndication ? (
        <ChoiceGroup
          description="Indication principale de l’intervention."
          onChange={(value) => updateDraftField('customIndication', value)}
          options={customIndicationOptions}
          title="Indication"
          value={draft.customIndication}
        />
      ) : null}

      {shouldShowApproach ? (
        <ChoiceGroup
          onChange={(value) => updateDraftField('approach', value)}
          options={availableApproachOptions}
          title="Voie d’abord"
          value={draft.approach}
        />
      ) : null}

      {shouldShowEntryTechnique ? (
        <ChoiceGroup
          description="Champ obligatoire pour la cœlioscopie et le robot."
          onChange={(value) => updateDraftField('entryTechnique', value)}
          options={availableEntryTechniqueOptions}
          title="Technique d’entrée"
          value={draft.entryTechnique}
        />
      ) : null}

      {shouldShowLaterality ? (
        <ChoiceGroup
          columns={3}
          onChange={(value) => updateDraftField('laterality', value)}
          options={lateralityOptions}
          title="Latéralité"
          value={draft.laterality}
        />
      ) : null}

      <SectionCard
        title="Difficulté ressentie de l’intervention"
        description="Évaluez la difficulté globale de cette intervention selon votre ressenti, de 1 à 10."
      >
        <ComplexitySlider
          onChange={(value) => updateDraftField('complexity', value)}
          value={draft.complexity}
        />
      </SectionCard>

      <ChoiceGroup
        description="Rôle au cours de l'intervention."
        onChange={(value) => updateDraftField('role', value)}
        options={roleOptions}
        title="Rôle global"
        value={draft.role}
      />

      <SectionCard
        title="Validation minimale"
        description="Les champs requis doivent être renseignés avant de poursuivre."
      >
        <div className="validation-box">
          <strong>
            {formMissingFields.length === 0
              ? 'Formulaire complet'
              : `${formMissingFields.length} champ(s) à compléter`}
          </strong>
          <span>
            {formMissingFields.length === 0
              ? hasChecklist
                ? 'Tu peux passer à la checklist technique.'
                : 'Tu peux passer directement au récapitulatif.'
              : `À renseigner : ${formMissingFields.join(', ')}.`}
          </span>
        </div>
      </SectionCard>

      <div className="action-stack">
        <PrimaryButton
          label="Retour à l’accueil"
          onPress={backToWelcome}
          variant="secondary"
        />
        <PrimaryButton
          disabled={formMissingFields.length > 0}
          label={hasChecklist ? 'Continuer vers la checklist' : 'Voir le récapitulatif'}
          onPress={hasChecklist ? goToChecklist : goToSummary}
        />
      </div>
    </ScreenContainer>
  );
}
