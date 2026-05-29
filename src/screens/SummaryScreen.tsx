import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  checklistLevelOptions,
  complexityOptions,
  contextOptions,
  entryTechniqueOptions,
  formatDisplayName,
  getFixedContextForIntervention,
  getChecklistStepsForIntervention,
  getChoiceLabel,
  getInternalById,
  getSeniorById,
  indicationOptions,
  lateralityOptions,
  procedureOptions,
  roleOptions,
} from '../data/mockData';
import { formatIsoDate } from '../utils/date';

export function SummaryScreen() {
  const {
    summaryMode,
    internalProfiles,
    selectedInternal,
    draft,
    lastSavedIntervention,
    savedInterventions,
    saveIntervention,
    backToForm,
    startNewIntervention,
    backToWelcome,
  } = useAppContext();

  if (summaryMode === 'confirmed' && !lastSavedIntervention) {
    return (
      <ScreenContainer
        eyebrow="Récapitulatif"
        title="Aucune intervention enregistrée"
        subtitle="Repars du formulaire pour ajouter une intervention."
      >
        <PrimaryButton label="Retour à l’accueil" onPress={backToWelcome} />
      </ScreenContainer>
    );
  }

  const intervention =
    summaryMode === 'confirmed' && lastSavedIntervention ? lastSavedIntervention : draft;
  const internalId = intervention.internalId ?? selectedInternal?.id ?? null;
  const internal = getInternalById(internalId, internalProfiles);
  const senior = getSeniorById(intervention.seniorId);
  const isSalpingectomy = intervention.procedure === 'salpingectomie';
  const checklistSteps = getChecklistStepsForIntervention(
    intervention.procedure,
    intervention.indication,
    intervention.approach,
    intervention.entryTechnique
  );
  const hasChecklist = checklistSteps.length > 0;
  const resolvedContext =
    intervention.context ??
    getFixedContextForIntervention(intervention.procedure, intervention.indication);
  const procedureLabel = getChoiceLabel(procedureOptions, intervention.procedure);
  const confirmedProcedureLabel =
    intervention.procedure === 'colpoclesis'
      ? `${procedureLabel} validé`
      : `${procedureLabel} validée`;
  const indicationLabel =
    intervention.indication === 'autre' && intervention.indicationComment.trim()
      ? `Autre · ${intervention.indicationComment.trim()}`
      : getChoiceLabel(indicationOptions, intervention.indication);

  return (
    <ScreenContainer
      eyebrow="Étape 3 sur 3"
      title={
        summaryMode === 'confirmed'
          ? 'Intervention enregistrée'
          : 'Récapitulatif avant enregistrement'
      }
      subtitle={
        summaryMode === 'confirmed'
          ? 'Le récapitulatif reprend l’ensemble des informations saisies.'
          : 'Relis les informations et confirme l’enregistrement si tout est correct.'
      }
    >
      <SectionCard>
        <div className="summary-hero">
          <strong>
            {summaryMode === 'confirmed'
              ? confirmedProcedureLabel
              : procedureLabel}
          </strong>
          <span>
            {internal
              ? formatDisplayName(internal.firstName, internal.lastName)
              : 'Interne non retrouvé'} ·{' '}
            {formatIsoDate(intervention.date)}
          </span>
        </div>
      </SectionCard>

      <SectionCard title="Profil interne">
        <SummaryRow
          label="Interne"
          value={internal ? formatDisplayName(internal.firstName, internal.lastName) : 'Non renseigné'}
        />
        <SummaryRow label="Promotion" value={internal?.promotion ?? 'Non renseigné'} />
        <SummaryRow label="Semestre" value={internal?.semester ?? 'Non renseigné'} />
        <SummaryRow
          label="Stage actuel"
          value={internal?.currentRotation ?? 'Non renseigné'}
        />
      </SectionCard>

      <SectionCard title="Détails de l’intervention">
        <SummaryRow label="Date" value={formatIsoDate(intervention.date)} />
        <SummaryRow
          label="Senior"
          value={senior ? `${senior.firstName} ${senior.lastName}` : 'Non renseigné'}
        />
        <SummaryRow label="Intervention" value={procedureLabel} />
        {isSalpingectomy ? (
          <>
            <SummaryRow label="Indication" value={indicationLabel} />
            <SummaryRow
              label="Voie d’abord"
              value={getChoiceLabel(approachOptions, intervention.approach)}
            />
            {intervention.approach === 'coelioscopie' ||
            intervention.approach === 'robot' ? (
              <SummaryRow
                label="Technique d’entrée"
                value={getChoiceLabel(entryTechniqueOptions, intervention.entryTechnique)}
              />
            ) : null}
            <SummaryRow
              label="Latéralité"
              value={getChoiceLabel(lateralityOptions, intervention.laterality)}
            />
          </>
        ) : null}
        {resolvedContext ? (
          <SummaryRow
            label="Contexte"
            value={getChoiceLabel(contextOptions, resolvedContext)}
          />
        ) : null}
        <SummaryRow
          label="Difficulté"
          value={getChoiceLabel(complexityOptions, intervention.complexity)}
        />
        <SummaryRow
          label="Rôle global"
          value={getChoiceLabel(roleOptions, intervention.role)}
        />
      </SectionCard>

      {hasChecklist ? (
        <SectionCard
          title={`Checklist technique ${procedureLabel}`}
          description="Niveau déclaré pour chaque étape."
        >
          <div className="checklist-list">
            {checklistSteps.map((step) => (
              <div key={step.id} className="checklist-row">
                <span>{step.label}</span>
                <strong>
                  {getChoiceLabel(checklistLevelOptions, intervention.checklist[step.id])}
                </strong>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      {summaryMode === 'confirmed' ? (
        <div className="action-stack">
          <PrimaryButton
            label="Nouvelle intervention"
            onPress={startNewIntervention}
          />
          <PrimaryButton
            label="Retour à l’accueil"
            onPress={backToWelcome}
            variant="secondary"
          />
        </div>
      ) : (
        <div className="action-stack">
          <PrimaryButton
            label="Confirmer l’enregistrement"
            onPress={saveIntervention}
          />
          <PrimaryButton
            label="Modifier la saisie"
            onPress={backToForm}
            variant="secondary"
          />
        </div>
      )}
    </ScreenContainer>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-row">
      <span className="summary-row__label">{label}</span>
      <strong className="summary-row__value">{value}</strong>
    </div>
  );
}
