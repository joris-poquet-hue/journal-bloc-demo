import type { InternalProfile, SavedIntervention, Senior } from '../types';

export type SeniorInstitutionExportScope = {
  internalProfiles: InternalProfile[];
  interventions: SavedIntervention[];
  selectableSeniors: Senior[];
};

export function buildSeniorInstitutionExportScope(
  senior: Senior,
  interventions: SavedIntervention[],
  internalProfiles: InternalProfile[],
  selectableSeniors: Senior[]
): SeniorInstitutionExportScope {
  const institutionId = senior.institutionId?.trim();

  if (!institutionId) {
    throw new Error(
      "L’établissement du Senior doit être identifié avant de lancer l’export."
    );
  }

  const scopedInternalProfiles = internalProfiles
    .filter(
      (profile) =>
        profile.isActive !== false && profile.institutionId === institutionId
    )
    .map((profile) => ({
      ...profile,
      contactEmail: null,
      loginId: '',
    }));
  const allowedInternalIds = new Set(
    scopedInternalProfiles.map((profile) => profile.id)
  );
  const scopedInterventions = interventions.filter(
    (intervention) =>
      typeof intervention.internalId === 'string' &&
      allowedInternalIds.has(intervention.internalId)
  );
  const sanitizedSeniors = selectableSeniors.map((candidate) => ({
    ...candidate,
    contactEmail: null,
    loginId: undefined,
  }));

  return {
    internalProfiles: scopedInternalProfiles,
    interventions: scopedInterventions,
    selectableSeniors: sanitizedSeniors,
  };
}
