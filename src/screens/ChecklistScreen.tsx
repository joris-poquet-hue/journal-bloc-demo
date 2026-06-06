import { ChoiceChip } from '../components/ChoiceChip';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  checklistLevelDetails,
  checklistLevelOptions,
  getChecklistStepsForIntervention,
  getChoiceLabel,
  getSeniorById,
  indicationOptions,
} from '../data/mockData';
import { formatIsoDate } from '../utils/date';

export function ChecklistScreen() {
  const {
    selectedInternal,
    draft,
    checklistProgress,
    customSurgicalInterventions,
    surgicalProcedureOptions,
    backToForm,
    goToSummary,
    setAllChecklistLevels,
    setChecklistLevel,
  } = useAppContext();

  if (!selectedInternal) {
    return (
      <ScreenContainer
        eyebrow="Checklist"
        title="Interne manquant"
        subtitle="Retourne au formulaire pour reprendre la saisie."
      >
        <PrimaryButton label="Retour au formulaire" onPress={backToForm} />
      </ScreenContainer>
    );
  }

  const senior = getSeniorById(draft.seniorId);
  const indicationLabel =
    draft.indication === 'autre' && draft.indicationComment.trim()
      ? `Autre · ${draft.indicationComment.trim()}`
      : getChoiceLabel(indicationOptions, draft.indication);
  const customIndicationLabel = draft.customIndication?.trim() ?? '';
  const isSalpingectomy = draft.procedure === 'salpingectomie';
  const hasCustomIndication = !isSalpingectomy && customIndicationLabel.length > 0;
  const checklistSteps = getChecklistStepsForIntervention(
    draft.procedure,
    draft.indication,
    draft.approach,
    draft.entryTechnique,
    customSurgicalInterventions
  );
  return (
    <ScreenContainer
      eyebrow="Étape 2 sur 3"
      title="Checklist technique"
    >
      <SectionCard
        title="Récapitulatif"
        description="Vérifie les informations principales avant enregistrement."
      >
        <div className="info-grid">
          <InfoBlock label="Date" value={formatIsoDate(draft.date)} />
          <InfoBlock
            label="Senior"
            value={senior ? `${senior.firstName} ${senior.lastName}` : 'Non renseigné'}
          />
          <InfoBlock
            label="Intervention"
            value={getChoiceLabel(surgicalProcedureOptions, draft.procedure)}
          />
          {isSalpingectomy || hasCustomIndication ? (
            <>
              <InfoBlock
                label="Indication"
                value={isSalpingectomy ? indicationLabel : customIndicationLabel}
              />
              {isSalpingectomy ? (
                <InfoBlock
                  label="Voie"
                  value={getChoiceLabel(approachOptions, draft.approach)}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </SectionCard>

      {checklistProgress.applicable ? (
        <>
          <SectionCard
            title="Barème"
            description={`${checklistProgress.completed} / ${checklistProgress.total} étape(s) renseignée(s). Le score reste attribué étape par étape par l’interne.`}
          >
            <div className="legend-list legend-list--scale">
              {checklistLevelOptions.map((level) => (
                <article className="legend-item" key={level.value}>
                  <div className="legend-item__header">
                    <strong>{level.label}</strong>
                    <span>{level.description}</span>
                  </div>
                  <p>{checklistLevelDetails[level.value]}</p>
                </article>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="Remplissage rapide"
            description="Applique un niveau à toutes les étapes, puis ajuste les étapes une par une si besoin."
          >
            <div className="choice-grid choice-grid--checklist">
              {checklistLevelOptions.map((level) => (
                <ChoiceChip
                  key={level.value}
                  compact
                  label={level.label}
                  onPress={() => setAllChecklistLevels(level.value)}
                  selected={false}
                />
              ))}
            </div>
          </SectionCard>

          {checklistSteps.map((step, index) => (
            <SectionCard
              key={step.id}
              description={`Étape ${index + 1}`}
              title={step.label}
            >
              <div className="choice-grid choice-grid--checklist">
                {checklistLevelOptions.map((level) => (
                  <ChoiceChip
                    key={level.value}
                    compact
                    label={level.label}
                    onPress={() => setChecklistLevel(step.id, level.value)}
                    selected={draft.checklist[step.id] === level.value}
                  />
                ))}
              </div>
            </SectionCard>
          ))}
        </>
      ) : (
        <SectionCard
          title="Checklist non définie"
          description="Aucune checklist spécifique n’est définie pour cette configuration."
        >
          <p className="field-helper">
            Pour cette intervention, l’enregistrement peut être validé sans
            grille technique supplémentaire.
          </p>
        </SectionCard>
      )}

      <div className="action-stack">
        <PrimaryButton
          label="Retour au formulaire"
          onPress={backToForm}
          variant="secondary"
        />
        <PrimaryButton
          disabled={!checklistProgress.isComplete}
          label="Voir le récapitulatif"
          onPress={goToSummary}
        />
      </div>
    </ScreenContainer>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-block">
      <span className="info-block__label">{label}</span>
      <strong className="info-block__value">{value}</strong>
    </div>
  );
}
