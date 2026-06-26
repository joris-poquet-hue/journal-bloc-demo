import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Eye,
  Gauge,
  LucideIcon,
  Scissors,
  UserRound,
} from 'lucide-react';

import { InterventionFlowCard } from '../components/InterventionFlowCard';
import { InterventionFlowLayout } from '../components/InterventionFlowLayout';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  entryTechniqueOptions,
  formatComplexityRating,
  formatSeniorDisplayName,
  getChecklistStepsForIntervention,
  getChoiceLabel,
  indicationOptions,
} from '../data/mockData';
import {
  formatChecklistAverage,
  getChecklistAverage,
} from '../utils/checklistSummary';
import { formatIsoDate } from '../utils/date';

export function SummaryScreen() {
  const {
    selectedInternal,
    draft,
    customSurgicalInterventions,
    selectableSeniors,
    surgicalProcedureOptions,
    saveIntervention,
    backToChecklist,
  } = useAppContext();

  if (!selectedInternal) {
    return (
      <ScreenContainer
        eyebrow="Récapitulatif"
        title="Aucune intervention disponible"
        subtitle="Retourne au formulaire pour reprendre la saisie."
      >
        <button
          className="flow-button flow-button--secondary"
          onClick={backToChecklist}
          type="button"
        >
          Retour à l’étape 2
        </button>
      </ScreenContainer>
    );
  }

  const senior = selectableSeniors.find((item) => item.id === draft.seniorId) ?? null;
  const procedureLabel = getChoiceLabel(surgicalProcedureOptions, draft.procedure);
  const indicationLabel =
    draft.procedure === 'salpingectomie'
      ? draft.indication === 'autre' && draft.indicationComment.trim()
        ? `Autre · ${draft.indicationComment.trim()}`
        : getChoiceLabel(indicationOptions, draft.indication)
      : draft.customIndication?.trim() ?? 'Non renseigné';
  const approachLabel = getChoiceLabel(approachOptions, draft.approach);
  const entryTechniqueLabel = getChoiceLabel(entryTechniqueOptions, draft.entryTechnique);
  const approachSummary =
    draft.approach && draft.entryTechnique
      ? `${approachLabel} – ${entryTechniqueLabel}`
      : approachLabel;
  const checklistSteps = getChecklistStepsForIntervention(
    draft.procedure,
    draft.indication,
    draft.approach,
    draft.entryTechnique,
    customSurgicalInterventions
  );
  const autonomyAverage = getChecklistAverage(
    checklistSteps.map((step) => draft.checklist[step.id])
  );

  return (
    <InterventionFlowLayout
      onBack={backToChecklist}
      step={3}
      subtitle="Vérifie les informations et confirme l’enregistrement si tout est correct."
      title="Récapitulatif avant enregistrement"
    >
      <InterventionFlowCard>
        <div className="flow-summary-list">
          <SummaryInfoRow icon={CalendarDays} label="Date" value={formatIsoDate(draft.date)} />
          <SummaryInfoRow
            icon={UserRound}
            label="Senior"
            value={senior ? formatSeniorDisplayName(senior) : 'Non renseigné'}
          />
          <SummaryInfoRow icon={Scissors} label="Intervention" value={procedureLabel} />
          <SummaryInfoRow
            icon={ClipboardList}
            label="Indication"
            value={indicationLabel}
          />
          <SummaryInfoRow icon={Eye} label="Voie d’abord" value={approachSummary} />
          <SummaryInfoRow
            icon={Gauge}
            label="Difficulté ressentie"
            value={formatComplexityRating(draft.complexity)}
          />
        </div>
      </InterventionFlowCard>

      <InterventionFlowCard className="flow-summary-card">
        <div className="flow-summary-card__body">
          <span className="flow-summary-card__caption flow-summary-card__caption--strong">
            Autonomie moyenne
          </span>
          <span className="flow-score-badge">
            {formatChecklistAverage(autonomyAverage)}
          </span>
        </div>
      </InterventionFlowCard>

      <InterventionFlowCard className="flow-success-card">
        <div className="flow-success-card__body">
          <span className="flow-success-card__icon" aria-hidden="true">
            <CheckCircle2 strokeWidth={2.4} />
          </span>
          <div>
            <strong>Tout semble complet !</strong>
            <p>Tu peux enregistrer ton intervention.</p>
          </div>
        </div>
      </InterventionFlowCard>

      <div className="flow-actions">
        <button
          className="flow-button flow-button--primary"
          onClick={saveIntervention}
          type="button"
        >
          Enregistrer l’intervention
        </button>
        <button
          className="flow-button flow-button--secondary"
          onClick={backToChecklist}
          type="button"
        >
          Retour à l’étape 2
        </button>
      </div>
    </InterventionFlowLayout>
  );
}

function SummaryInfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flow-summary-row">
      <span className="flow-summary-row__icon" aria-hidden="true">
        <Icon strokeWidth={2.1} />
      </span>
      <span className="flow-summary-row__label">{label}</span>
      <strong className="flow-summary-row__value">{value}</strong>
    </div>
  );
}
