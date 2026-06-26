import { SavedIntervention, SurgicalApproach } from '../types';

export type ApproachVisualKey = SurgicalApproach | 'voie_basse';

const approachIconMap: Record<ApproachVisualKey, string> = {
  coelioscopie: '/images/approaches/icone_coelio.png',
  laparotomie: '/images/approaches/icone_laparoo.png',
  robot: '/images/approaches/icone_robot.png',
  hysteroscopie: '/images/approaches/icone_hystero.png',
  voie_basse: '/images/approaches/icone_vb.png',
  vnotes: '/images/approaches/icone_vN.png',
};

const approachLabelMap: Record<ApproachVisualKey, string> = {
  coelioscopie: 'cœlioscopie',
  laparotomie: 'laparotomie',
  robot: 'robot-assistée',
  hysteroscopie: 'hystéroscopie',
  voie_basse: 'voie basse',
  vnotes: 'vNotes',
};

export function getInterventionApproachKey(
  intervention: SavedIntervention
): ApproachVisualKey | null {
  if (intervention.approach) {
    return intervention.approach;
  }

  if (intervention.procedure === 'colpoclesis') {
    return 'voie_basse';
  }

  return null;
}

export function getInterventionApproachLabel(
  intervention: SavedIntervention,
  fallback = 'voie non renseignée'
) {
  const approachKey = getInterventionApproachKey(intervention);

  return approachKey ? approachLabelMap[approachKey] : fallback;
}

export function ApproachIcon({
  intervention,
}: {
  intervention: SavedIntervention;
}) {
  const approachKey = getInterventionApproachKey(intervention);

  if (!approachKey) {
    return <span className="approach-icon approach-icon--default" aria-hidden="true" />;
  }

  return (
    <span
      className={`approach-icon approach-icon--${approachKey}`}
      aria-hidden="true"
    >
      <img alt="" className="approach-icon__image" src={approachIconMap[approachKey]} />
    </span>
  );
}
