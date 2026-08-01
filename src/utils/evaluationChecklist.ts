import type {
  AdminInterventionEvaluation,
  ChecklistLevel,
  SavedIntervention,
} from '../types';

export function getAuthoritativeChecklist(
  intervention: SavedIntervention,
  evaluation?: AdminInterventionEvaluation | null
): Record<string, ChecklistLevel | null> {
  return evaluation?.checklist ?? intervention.checklist;
}
