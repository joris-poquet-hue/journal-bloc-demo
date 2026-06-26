import { ChangeEvent } from 'react';

import { ChoiceGroup } from '../components/ChoiceGroup';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import { formatDisplayName, formatSeniorDisplayName } from '../data/mockData';
import { isValidIsoDate } from '../utils/date';

const obstetricGestureOptions = [
  { value: 'Césarienne', label: 'Césarienne' },
  { value: 'Extraction instrumentales', label: 'Extraction instrumentales' },
];

const instrumentalExtractionOptions = [
  { value: 'Ventouse', label: 'Ventouse' },
  { value: 'Forceps', label: 'Forceps' },
  { value: 'Spatules', label: 'Spatules' },
];

const vacuumTypeOptions = [
  { value: 'Kiwi', label: 'Kiwi' },
  { value: 'Mytivac', label: 'Mytivac' },
];

const forcepsTypeOptions = [
  { value: 'Suzor', label: 'Suzor' },
  { value: 'Tarnier', label: 'Tarnier' },
];

function getMissingFields({
  date,
  gesture,
  instrumentalExtraction,
  vacuumType,
  forcepsType,
  indication,
  internalId,
  seniorId,
}: {
  date: string;
  gesture: string;
  instrumentalExtraction: string | null;
  vacuumType: string | null;
  forcepsType: string | null;
  indication: string;
  internalId: string | null;
  seniorId: string | null;
}) {
  const missingFields: string[] = [];

  if (!date || !isValidIsoDate(date)) {
    missingFields.push('date de la journée de SDN');
  }

  if (!internalId) {
    missingFields.push('interne');
  }

  if (!seniorId) {
    missingFields.push('senior');
  }

  if (!gesture.trim()) {
    missingFields.push('geste réalisé');
  }

  if (gesture === 'Extraction instrumentales' && !instrumentalExtraction) {
    missingFields.push('type d’extraction instrumentale');
  }

  if (instrumentalExtraction === 'Ventouse' && !vacuumType) {
    missingFields.push('type de ventouse');
  }

  if (instrumentalExtraction === 'Forceps' && !forcepsType) {
    missingFields.push('type de forceps');
  }

  if (!indication.trim()) {
    missingFields.push('indication');
  }

  return missingFields;
}

export function ObstetricJournalScreen() {
  const {
    selectedInternal,
    obstetricDraft,
    selectableSeniors,
    goToSurgeryPortal,
    saveObstetricGesture,
    updateObstetricDraftField,
  } = useAppContext();

  if (!selectedInternal) {
    return (
      <ScreenContainer
        eyebrow="Journal SDN"
        title="Aucun interne sélectionné"
        subtitle="Retourne à l’accueil pour reprendre la saisie."
      >
        <PrimaryButton
          label="Retour à l’accueil"
          onPress={goToSurgeryPortal}
        />
      </ScreenContainer>
    );
  }

  const missingFields = getMissingFields({
    ...obstetricDraft,
    internalId: obstetricDraft.internalId ?? selectedInternal.id,
  });

  const handleDateChange = (event: ChangeEvent<HTMLInputElement>) => {
    updateObstetricDraftField('date', event.target.value);
  };

  const handleIndicationChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    updateObstetricDraftField('indication', event.target.value);
  };

  return (
    <ScreenContainer
      eyebrow="Journal SDN"
      title="Ajouter un geste"
      subtitle={`${formatDisplayName(selectedInternal.firstName, selectedInternal.lastName)} · ${selectedInternal.currentRotation}`}
    >
      <SectionCard
        title="Date de la journée de SDN"
        description="Date préremplie à aujourd’hui, modifiable si nécessaire."
      >
        <label className="field-stack">
          <input
            className="field-input"
            onChange={handleDateChange}
            type="date"
            value={obstetricDraft.date}
          />
        </label>
      </SectionCard>

      <ChoiceGroup
        columns={1}
        description="Choisis le senior superviseur de la salle de naissance."
        onChange={(value) => updateObstetricDraftField('seniorId', value)}
        options={selectableSeniors.map((senior) => ({
          value: senior.id,
          label: formatSeniorDisplayName(senior),
        }))}
        title="Senior"
        value={obstetricDraft.seniorId}
      />

      <ChoiceGroup
        description="Choisis le geste effectué en salle de naissance."
        onChange={(value) => updateObstetricDraftField('gesture', value)}
        options={obstetricGestureOptions}
        title="Geste réalisé"
        value={obstetricDraft.gesture}
      />

      {obstetricDraft.gesture === 'Extraction instrumentales' ? (
        <ChoiceGroup
          description="Choisis le type d’extraction instrumentale."
          onChange={(value) =>
            updateObstetricDraftField('instrumentalExtraction', value)
          }
          options={instrumentalExtractionOptions}
          title="Extraction instrumentale"
          value={obstetricDraft.instrumentalExtraction}
        />
      ) : null}

      {obstetricDraft.instrumentalExtraction === 'Ventouse' ? (
        <ChoiceGroup
          description="Choisis le type de ventouse utilisé."
          onChange={(value) => updateObstetricDraftField('vacuumType', value)}
          options={vacuumTypeOptions}
          title="Type de ventouse"
          value={obstetricDraft.vacuumType}
        />
      ) : null}

      {obstetricDraft.instrumentalExtraction === 'Forceps' ? (
        <ChoiceGroup
          description="Choisis le type de forceps utilisé."
          onChange={(value) => updateObstetricDraftField('forcepsType', value)}
          options={forcepsTypeOptions}
          title="Type de forceps"
          value={obstetricDraft.forcepsType}
        />
      ) : null}

      <SectionCard
        title="Indication"
        description="Précise l’indication ou le contexte principal."
      >
        <label className="field-stack">
          <textarea
            className="field-input field-input--textarea"
            onChange={handleIndicationChange}
            placeholder="Exemple : stagnation, anomalie du rythme, déclenchement..."
            value={obstetricDraft.indication}
          />
        </label>
      </SectionCard>

      <SectionCard
        title="Validation minimale"
        description="Les champs requis doivent être renseignés avant d’enregistrer."
      >
        <div className="validation-box">
          <strong>
            {missingFields.length === 0
              ? 'Formulaire complet'
              : `${missingFields.length} champ(s) à compléter`}
          </strong>
          <span>
            {missingFields.length === 0
              ? 'Tu peux enregistrer ce geste dans le journal obstétrical.'
              : `À renseigner : ${missingFields.join(', ')}.`}
          </span>
        </div>
      </SectionCard>

      <div className="action-stack">
        <PrimaryButton
          label="Retour à l’accueil"
          onPress={goToSurgeryPortal}
          variant="secondary"
        />
        <PrimaryButton
          disabled={missingFields.length > 0}
          label="Enregistrer le geste"
          onPress={saveObstetricGesture}
        />
      </div>
    </ScreenContainer>
  );
}
