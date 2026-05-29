import { ChangeEvent } from 'react';

import { ChoiceGroup } from '../components/ChoiceGroup';
import { ComplexitySlider } from '../components/ComplexitySlider';
import { PrimaryButton } from '../components/PrimaryButton';
import { ProgressSummaryCard } from '../components/ProgressSummaryCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  entryTechniqueOptions,
  formatDisplayName,
  getChoiceLabel,
  getChecklistStepsForIntervention,
  indicationOptions,
  lateralityOptions,
  procedureOptions,
  roleOptions,
  seniors,
} from '../data/mockData';

export function InterventionFormScreen() {
  const {
    selectedInternal,
    draft,
    formMissingFields,
    goToChecklist,
    goToSummary,
    backToWelcome,
    savedInterventions,
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

  const internalInterventions = savedInterventions.filter(
    (intervention) => intervention.internalId === selectedInternal.id
  );

  const baselineStats = selectedInternal.baselineStats ?? {
    totalInterventions: 0,
    primaryOperatorCount: 0,
    primaryAssistantCount: 0,
  };
  const isSalpingectomy = draft.procedure === 'salpingectomie';
  const checklistSteps = getChecklistStepsForIntervention(
    draft.procedure,
    draft.indication,
    draft.approach,
    draft.entryTechnique
  );
  const hasChecklist = checklistSteps.length > 0;

  const totalInterventions =
    baselineStats.totalInterventions + internalInterventions.length;
  const primaryOperatorCount = internalInterventions.filter(
    (intervention) => intervention.role === 'operateur_principal'
  ).length + baselineStats.primaryOperatorCount;

  return (
    <ScreenContainer
      eyebrow="Étape 1 sur 3"
      title="Ajouter une intervention"
      subtitle={`${formatDisplayName(selectedInternal.firstName, selectedInternal.lastName)} · ${selectedInternal.currentRotation}`}
    >
      <ProgressSummaryCard
        primaryOperatorCount={primaryOperatorCount}
        totalInterventions={totalInterventions}
      />

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
        options={procedureOptions}
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

          <ChoiceGroup
            onChange={(value) => updateDraftField('approach', value)}
            options={approachOptions}
            title="Voie d’abord"
            value={draft.approach}
          />

          {draft.approach === 'coelioscopie' || draft.approach === 'robot' ? (
            <ChoiceGroup
              description="Champ obligatoire pour la cœlioscopie et le robot."
              onChange={(value) => updateDraftField('entryTechnique', value)}
              options={entryTechniqueOptions}
              title="Technique d’entrée"
              value={draft.entryTechnique}
            />
          ) : null}

          <ChoiceGroup
            columns={3}
            onChange={(value) => updateDraftField('laterality', value)}
            options={lateralityOptions}
            title="Latéralité"
            value={draft.laterality}
          />
        </>
      ) : null}

      <SectionCard
        title="Difficulté de l’intervention"
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
