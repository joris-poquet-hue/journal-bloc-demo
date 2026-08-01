import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

import { ApproachIconForApproach } from '../components/ApproachIcon';
import { InterventionFlowCard } from '../components/InterventionFlowCard';
import { InterventionFlowLayout } from '../components/InterventionFlowLayout';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  entryTechniqueOptions,
  formatComplexityRating,
  formatSeniorDisplayName,
  formatSurgeryContext,
  getChoiceLabel,
  indicationOptions,
  lateralityOptions,
  roleOptions,
} from '../data/mockData';
import { getClinicalContextSummaryRows } from '../data/contextVariables';
import { formatIsoDate } from '../utils/date';

const PRIMARY_CONTEXT_LABELS = new Set([
  'Âge de la patiente',
  'IMC de la patiente',
  'Saignement per-opératoire',
]);

export function SummaryScreen() {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const {
    selectedInternal,
    draft,
    selectableSeniors,
    surgicalProcedureOptions,
    saveIntervention,
    backToContextVariables,
    registerInterventionFormInteraction,
  } = useAppContext();

  const senior = selectableSeniors.find((item) => item.id === draft.seniorId) ?? null;
  const procedureLabel = getChoiceLabel(surgicalProcedureOptions, draft.procedure);
  if (!selectedInternal) {
    return (
      <ScreenContainer
        eyebrow="Récapitulatif"
        title="Aucune intervention disponible"
        subtitle="Retourne au formulaire pour reprendre la saisie."
      >
        <button
          className="flow-button flow-button--secondary"
          onClick={backToContextVariables}
          type="button"
        >
          Retour à l’étape 2
        </button>
      </ScreenContainer>
    );
  }

  const indicationLabel =
    draft.procedure === 'salpingectomie'
      ? draft.indication === 'autre' && draft.indicationComment.trim()
        ? `Autre · ${draft.indicationComment.trim()}`
        : getChoiceLabel(indicationOptions, draft.indication)
      : draft.customIndication?.trim() ?? 'Non renseigné';
  const approachLabel = getChoiceLabel(approachOptions, draft.approach);
  const entryTechniqueLabel = getChoiceLabel(entryTechniqueOptions, draft.entryTechnique);
  const roleLabel = getChoiceLabel(roleOptions, draft.role, 'Non renseigné');
  const surgeryContextLabel = formatSurgeryContext(draft.context);
  const lateralityLabel = draft.laterality
    ? getChoiceLabel(lateralityOptions, draft.laterality, 'Non renseignée')
    : 'Non applicable';
  const approachSummary =
    draft.approach && draft.entryTechnique
      ? `${approachLabel} – ${entryTechniqueLabel}`
      : approachLabel;
  const contextSummaryRows = getClinicalContextSummaryRows(
    draft.contextVariables
  );
  const getContextValue = (label: string) =>
    contextSummaryRows.find((row) => row.label === label)?.value ??
    'Non renseigné';
  const primaryContextRows = [
    {
      label: 'Âge',
      value: getContextValue('Âge de la patiente'),
    },
    {
      label: 'IMC',
      value: getContextValue('IMC de la patiente'),
    },
    {
      label: 'Saignement',
      value: getContextValue('Saignement per-opératoire'),
    },
  ];
  const otherContextRows = contextSummaryRows.filter(
    (row) => !PRIMARY_CONTEXT_LABELS.has(row.label)
  );

  const handleSaveIntervention = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const savedIntervention = await saveIntervention();

      if (!savedIntervention) {
        throw new Error('Le récapitulatif est incomplet. Vérifie les informations.');
      }
    } catch (error) {
      setSaveError(
        error instanceof Error && error.message.trim()
          ? error.message
          : 'Supabase n’a pas confirmé l’enregistrement. Vérifie la connexion puis réessaie.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <InterventionFlowLayout
      className="intervention-flow--summary-showcase"
      onBack={backToContextVariables}
      onTrackInteraction={registerInterventionFormInteraction}
      step={3}
      subtitle="Vérifie les informations et confirme l’enregistrement si tout est correct."
      title="Récapitulatif avant enregistrement"
    >
      <InterventionFlowCard className="flow-review-card">
        <div className="flow-review-hero">
          <ApproachIconForApproach
            approach={draft.approach || null}
            className="flow-review-hero__approach-icon"
          />
          <div className="flow-review-hero__copy">
            <span className="flow-review-hero__time">
              {formatIsoDate(draft.date)} ·{' '}
              {draft.startTime ?? 'Heure non renseignée'} ·{' '}
              {draft.operativeDurationMinutes
                ? `${draft.operativeDurationMinutes} min`
                : 'Durée non renseignée'}
            </span>
            <h2>{procedureLabel}</h2>
            <p>
              {senior ? formatSeniorDisplayName(senior) : 'Senior non renseigné'} ·{' '}
              {roleLabel}
            </p>
          </div>
          <span
            aria-label={`Cadre de l’intervention : ${surgeryContextLabel}`}
            className={`surgery-context-badge surgery-context-badge--${
              draft.context ?? 'unknown'
            } flow-review-hero__context`}
          >
            {surgeryContextLabel}
          </span>
        </div>

        <div className="flow-review-layout">
          <section
            aria-labelledby="flow-review-intervention-title"
            className="flow-review-section"
          >
            <h3 id="flow-review-intervention-title">Intervention</h3>
            <dl className="flow-review-facts">
              <SummaryFact label="Indication" value={indicationLabel} />
              <SummaryFact label="Voie d’abord" value={approachSummary} />
              <SummaryFact label="Latéralité" value={lateralityLabel} />
              <SummaryFact
                label="Difficulté ressentie"
                value={formatComplexityRating(draft.complexity)}
              />
            </dl>
          </section>

          <section
            aria-labelledby="flow-review-context-title"
            className="flow-review-section flow-review-section--context"
          >
            <h3 id="flow-review-context-title">Contexte clinique</h3>
            <dl className="flow-review-context-metrics">
              {primaryContextRows.map((row) => (
                <SummaryFact
                  key={row.label}
                  label={row.label}
                  value={row.value}
                />
              ))}
            </dl>

            <details className="flow-review-context-details">
              <summary>Voir les autres variables</summary>
              <dl>
                {otherContextRows.map((row) => (
                  <SummaryFact
                    key={row.label}
                    label={row.label}
                    value={row.value}
                  />
                ))}
              </dl>
            </details>
          </section>
        </div>

        {saveError ? (
          <p className="auth-error" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="flow-review-validation">
          <div className="flow-review-validation__status">
            <span className="flow-success-card__icon" aria-hidden="true">
              <CheckCircle2 strokeWidth={2.4} />
            </span>
            <strong>Fiche complète, prête à être enregistrée</strong>
          </div>
          <button
            className="flow-button flow-button--primary flow-review-validation__button"
            disabled={isSaving}
            onClick={() => void handleSaveIntervention()}
            type="button"
          >
            {isSaving
              ? 'Enregistrement dans Supabase…'
              : 'Enregistrer l’intervention'}
            {!isSaving ? <ArrowRight aria-hidden="true" strokeWidth={2.4} /> : null}
          </button>
        </div>
      </InterventionFlowCard>
    </InterventionFlowLayout>
  );
}

function SummaryFact({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flow-review-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
