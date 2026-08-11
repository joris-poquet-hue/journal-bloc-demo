export const APPROACH_LABELS: Record<string, string> = {
  coelioscopie: 'Cœlioscopie',
  hysteroscopie: 'Hystéroscopie',
  laparotomie: 'Laparotomie',
  robot: 'Robot',
  voie_vaginale: 'Voie vaginale',
  vnotes: 'vNotes',
};

export const INDICATION_LABELS: Record<string, string> = {
  autre: 'Autre',
  geu: 'GEU',
  ligature_tubaire: 'Contraception définitive',
};

export const INTERVENTION_ROLE_LABELS: Record<string, string> = {
  aide_principal: 'Aide principal',
  aide_secondaire: 'Aide secondaire',
  observateur: 'Observateur',
  operateur_principal: 'Opérateur principal',
};

export const ENTRY_TECHNIQUE_LABELS: Record<string, string> = {
  open: 'Open',
  trocart_direct: 'Trocart direct',
  veress: 'Aiguille de Veress',
};

export const LATERALITY_LABELS: Record<string, string> = {
  bilateral: 'Bilatéral',
  droite: 'Droite',
  gauche: 'Gauche',
};

export const DEFAULT_APPROACHES = [
  'coelioscopie',
  'laparotomie',
  'voie_vaginale',
];
export const DEFAULT_ENTRY_TECHNIQUES = [
  'trocart_direct',
  'open',
  'veress',
];
export const DEFAULT_INDICATIONS = ['geu', 'ligature_tubaire', 'autre'];
export const DEFAULT_LATERALITIES = ['gauche', 'bilateral', 'droite'];
export const DEFAULT_ROLES = [
  'operateur_principal',
  'aide_principal',
  'aide_secondaire',
  'observateur',
];
