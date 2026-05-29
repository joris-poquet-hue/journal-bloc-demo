import { ChoiceChip } from '../components/ChoiceChip';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  checklistLevelOptions,
  getProcedureChecklistTitle,
  getChecklistStepsForIntervention,
  getChoiceLabel,
  getSeniorById,
  indicationOptions,
  procedureOptions,
} from '../data/mockData';
import { formatIsoDate } from '../utils/date';

export function ChecklistScreen() {
  const {
    selectedInternal,
    draft,
    checklistProgress,
    backToForm,
    goToSummary,
    setChecklistLevel,
    setAllChecklistLevels,
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
  const isSalpingectomy = draft.procedure === 'salpingectomie';
  const checklistSteps = getChecklistStepsForIntervention(
    draft.procedure,
    draft.indication,
    draft.approach,
    draft.entryTechnique
  );
  const checklistTitle = getProcedureChecklistTitle(draft.procedure);

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
            value={getChoiceLabel(procedureOptions, draft.procedure)}
          />
          {isSalpingectomy ? (
            <>
              <InfoBlock label="Indication" value={indicationLabel} />
              <InfoBlock
                label="Voie"
                value={getChoiceLabel(approachOptions, draft.approach)}
              />
            </>
          ) : null}
        </div>
      </SectionCard>

      {checklistProgress.applicable ? (
        <>
          <SectionCard
            title="Barème"
            description={`${checklistProgress.completed} / ${checklistProgress.total} étape(s) renseignée(s).`}
          >
            <div className="legend-list">
              {checklistLevelOptions.map((level) => (
                <p key={level.value}>
                  <strong>{level.label}</strong> · {level.description}
                </p>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title={checklistTitle}
            description="Niveau déclaré pour chaque étape."
          >
            <></>
          </SectionCard>

          <SectionCard title="Remplissage rapide">
            <div className="choice-grid choice-grid--checklist">
              {checklistLevelOptions.map((level) => (
                <ChoiceChip
                  key={level.value}
                  compact
                  label={level.label}
                  onPress={() => setAllChecklistLevels(level.value)}
                  selected={
                    checklistSteps.every(
                      (step) => draft.checklist[step.id] === level.value
                    )
                  }
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
