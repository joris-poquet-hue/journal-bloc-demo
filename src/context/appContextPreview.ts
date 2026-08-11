import { defaultComplexityRating } from '../data/mockData';
import {
  type InternalProfile,
  type InterventionDraft,
  type Senior,
  type SurgicalInterventionDefinition,
} from '../types';
import { getTodayIsoDate } from '../utils/date';

const CHECKLIST_PREVIEW_QUERY_PARAM = 'preview-checklist';

export const CHECKLIST_PREVIEW_INTERNAL: InternalProfile = {
  id: 'preview-internal-checklist',
  firstName: 'Joris',
  lastName: 'Poquet',
  loginId: 'preview-interne',
  contactEmail: 'joris@example.com',
  mustChangePassword: false,
  institution: 'CHU de Nantes',
  promotion: 'Promo 2023',
  semester: 'S4',
  avatarImageSrc: null,
  createdAt: '2026-07-05T08:00:00.000Z',
  lastLoginAt: '2026-07-05T08:00:00.000Z',
  loginCount: 5,
  baselineStats: {
    totalInterventions: 3,
    primaryOperatorCount: 1,
    primaryAssistantCount: 2,
  },
};

export const CHECKLIST_PREVIEW_SENIOR: Senior = {
  id: 'preview-senior-checklist',
  firstName: 'Claire',
  lastName: 'Martin',
  loginId: 'preview-senior',
  contactEmail: 'claire.martin@example.com',
  mustChangePassword: false,
  institution: 'CHU de Nantes',
  createdAt: '2026-07-05T08:00:00.000Z',
  isCustom: true,
  lastLoginAt: '2026-07-05T08:00:00.000Z',
  managedInternalIds: [CHECKLIST_PREVIEW_INTERNAL.id],
};

export const CHECKLIST_PREVIEW_INTERVENTION: SurgicalInterventionDefinition = {
  id: 'custom-colpocleisis-preview',
  name: 'Colpocleisis',
  indications: ['Prolapsus genital avance'],
  allowedApproaches: ['voie_vaginale'],
  allowedEntryTechniques: [],
  requiresLaterality: false,
  checklistSteps: [],
  keyStepIds: [],
  status: 'active',
  lateralityMode: 'none',
  isCustom: true,
  createdAt: '2026-07-05T08:00:00.000Z',
  updatedAt: '2026-07-05T08:00:00.000Z',
  approachConfigs: [
    {
      id: 'preview-approach-colpocleisis',
      approach: 'voie_vaginale',
      active: true,
      entryTechniques: [],
      steps: [
        {
          id: 'preview-step-1',
          label: 'Installation et preparation du materiel',
          scored: true,
          order: 1,
        },
        {
          id: 'preview-step-2',
          label: "Exposition du col et mise en place d'une pince de Pozzi",
          scored: true,
          order: 2,
        },
        {
          id: 'preview-step-3',
          label:
            'Traction douce et dilatation cervicale progressive aux bougies de Hegar',
          scored: true,
          order: 3,
        },
        {
          id: 'preview-step-4',
          label: "Introduction de la canule d'aspiration adaptee au terme",
          scored: true,
          order: 4,
        },
        {
          id: 'preview-step-5',
          label:
            'Aspiration endo-uterine par mouvements rotatifs et va-et-vient',
          scored: true,
          order: 5,
        },
        {
          id: 'preview-step-6',
          label: "Verification de la vacuite uterine et de l'hemostase vaginale",
          scored: true,
          order: 6,
        },
      ],
    },
  ],
};

export function shouldEnableChecklistPreview() {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    new URL(window.location.href).searchParams.get(
      CHECKLIST_PREVIEW_QUERY_PARAM
    ) === '1'
  );
}

export function isNativeAppShell() {
  if (typeof window === 'undefined') {
    return false;
  }

  const searchParams = new URLSearchParams(window.location.search);

  return (
    searchParams.get('native-app') === '1' ||
    window.navigator.userAgent.includes('MonJournalDeBlocMobile')
  );
}

export function createChecklistPreviewDraft(): InterventionDraft {
  return {
    date: getTodayIsoDate(),
    startTime: null,
    operativeDurationMinutes: null,
    internalId: CHECKLIST_PREVIEW_INTERNAL.id,
    seniorId: CHECKLIST_PREVIEW_SENIOR.id,
    procedure: CHECKLIST_PREVIEW_INTERVENTION.id,
    indication: 'autre',
    indicationComment: '',
    customIndication: 'Prolapsus genital avance',
    approach: 'voie_vaginale',
    entryTechnique: null,
    laterality: null,
    context: 'programme',
    contextVariables: {
      schemaVersion: 2,
      patient: {
        ageYears: 42,
        bmi: 24,
        tobaccoUse: false,
        parity: '2',
      },
      history: {
        igh: false,
        pelvicPeritonitis: false,
        abdominopelvicSurgery: false,
        abdominopelvicSurgeryDetails: '',
        cesareanCount: '0',
      },
      intraoperative: {
        bloodLossMl: 100,
        complication: false,
        complicationDetails: '',
      },
    },
    complexity: defaultComplexityRating,
    role: 'operateur_principal',
    checklist: {
      'preview-step-1': '4',
      'preview-step-2': '3',
      'preview-step-3': '2',
      'preview-step-4': '1',
      'preview-step-5': null,
      'preview-step-6': null,
    },
  };
}
