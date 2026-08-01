import {
  Camera,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  GraduationCap,
  Info,
  LockKeyhole,
  LogOut,
  Mail,
  MessageCircle,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { ChangeEvent, FormEvent, ReactNode, useRef, useState } from 'react';

import packageJson from '../../package.json';
import { InternalAvatar } from '../components/InternalAvatar';
import { ScreenContainer } from '../components/ScreenContainer';
import { buildSupportMailto } from '../supportConfig';
import { useAppContext } from '../context/AppContext';
import { PASSWORD_POLICY_HELP, validatePasswordStrength } from '../utils/passwordPolicy';
import {
  formatDisplayName,
  formatSeniorDisplayName,
  getProcedureLabel,
} from '../data/mockData';
import { downloadInterventionsExcel } from '../utils/export';
import { formatIsoDate } from '../utils/date';
import type { Senior } from '../types';

type AccountSheet =
  | 'training'
  | 'photo'
  | 'email'
  | 'password'
  | 'export'
  | 'pending-interventions'
  | 'about'
  | null;

const accountSheetLabels = {
  about: 'À propos de Mon Journal de Bloc',
  email: 'Adresse e-mail',
  export: 'Exporter mes statistiques',
  password: 'Mot de passe',
  'pending-interventions': 'Interventions en attente',
  photo: 'Photo de profil',
  training: 'Formation',
} satisfies Record<Exclude<AccountSheet, null>, string>;

type FeedbackState = {
  tone: 'success' | 'error';
  message: string;
} | null;

type PhotoCropState = {
  fileName: string;
  height: number;
  panX: number;
  panY: number;
  sourceDataUrl: string;
  width: number;
  zoom: number;
};

const semesterOptions = Array.from({ length: 12 }, (_, index) => ({
  label: `S${index + 1}`,
  value: `S${index + 1}`,
}));

function getPendingInterventionSeniorLabel(
  seniorId: string | null,
  selectableSeniors: Senior[]
) {
  const senior = selectableSeniors.find((candidate) => candidate.id === seniorId);

  return senior ? formatSeniorDisplayName(senior) : 'Senior non renseigné';
}

async function readImageDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Impossible de lire ce fichier.'));
    };
    reader.onerror = () => reject(new Error('Impossible de lire ce fichier.'));
    reader.readAsDataURL(file);
  });
}

async function loadImageElement(sourceDataUrl: string) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const nextImage = new Image();

    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = () => reject(new Error('Impossible de charger cette image.'));
    nextImage.src = sourceDataUrl;
  });

  return image;
}

function getCropGeometry(
  width: number,
  height: number,
  size: number,
  zoom: number,
  panX: number,
  panY: number
) {
  const scale = Math.max(size / width, size / height) * zoom;
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const maxOffsetX = Math.max(0, (drawWidth - size) / 2);
  const maxOffsetY = Math.max(0, (drawHeight - size) / 2);
  const offsetX = (panX / 100) * maxOffsetX;
  const offsetY = (panY / 100) * maxOffsetY;

  return {
    drawHeight,
    drawWidth,
    offsetX,
    offsetY,
  };
}

async function createAvatarDataUrl(crop: PhotoCropState) {
  const image = await loadImageElement(crop.sourceDataUrl);

  const size = 512;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Impossible de préparer cette image.');
  }

  canvas.width = size;
  canvas.height = size;

  const { drawWidth, drawHeight, offsetX, offsetY } = getCropGeometry(
    crop.width,
    crop.height,
    size,
    crop.zoom,
    crop.panX,
    crop.panY
  );

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.drawImage(
    image,
    (size - drawWidth) / 2 + offsetX,
    (size - drawHeight) / 2 + offsetY,
    drawWidth,
    drawHeight
  );

  return canvas.toDataURL('image/jpeg', 0.86);
}

export function ProfileScreen() {
  const {
    adminEvaluations,
    deletePendingIntervention,
    selectedInternal,
    internalProfiles,
    savedInterventions,
    customSurgicalInterventions,
    selectableSeniors,
    logout,
    startNewIntervention,
    requestEmailChange,
    updateInternalCredentials,
    updateInternalProfileSettings,
  } = useAppContext();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSheet, setActiveSheet] = useState<AccountSheet>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [photoCrop, setPhotoCrop] = useState<PhotoCropState | null>(null);
  const [trainingForm, setTrainingForm] = useState({
    semester: selectedInternal?.semester ?? '',
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    nextPassword: '',
    confirmPassword: '',
  });
  const [emailForm, setEmailForm] = useState({
    contactEmail: '',
    currentPassword: '',
  });
  const [pendingDeletionCandidateId, setPendingDeletionCandidateId] =
    useState<string | null>(null);
  const [pendingDeletionError, setPendingDeletionError] = useState('');
  const [isDeletingPendingIntervention, setIsDeletingPendingIntervention] =
    useState(false);

  if (!selectedInternal) {
    return null;
  }

  const fullName = formatDisplayName(
    selectedInternal.firstName,
    selectedInternal.lastName
  );
  const semesterLabel = formatSemesterLabel(selectedInternal.semester);
  const internalInterventions = savedInterventions.filter(
    (intervention) => intervention.internalId === selectedInternal.id
  );
  const pendingInterventions = internalInterventions
    .filter((intervention) => !adminEvaluations[intervention.id])
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  const pendingDeletionCandidate = pendingDeletionCandidateId
    ? pendingInterventions.find(
        (intervention) => intervention.id === pendingDeletionCandidateId
      ) ?? null
    : null;

  const openSheet = (sheet: Exclude<AccountSheet, null>) => {
    setFeedback(null);

    if (sheet === 'training') {
      setTrainingForm({
        semester: selectedInternal.semester,
      });
    }

    if (sheet === 'password') {
      setPasswordForm({
        currentPassword: '',
        nextPassword: '',
        confirmPassword: '',
      });
    }

    if (sheet === 'email') {
      setEmailForm({
        contactEmail: '',
        currentPassword: '',
      });
    }

    if (sheet === 'pending-interventions') {
      setPendingDeletionCandidateId(null);
      setPendingDeletionError('');
    }

    setActiveSheet(sheet);
  };

  const closeSheet = () => {
    setActiveSheet(null);
    setPhotoCrop(null);
    setPendingDeletionCandidateId(null);
    setPendingDeletionError('');
  };

  const handleTrainingSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = await updateInternalProfileSettings(
      selectedInternal.id,
      trainingForm
    );

    setFeedback({
      tone: result.success ? 'success' : 'error',
      message: result.message,
    });

    if (result.success) {
      closeSheet();
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!passwordForm.currentPassword) {
      setFeedback({
        tone: 'error',
        message: 'Renseigne ton mot de passe actuel.',
      });
      return;
    }

    const passwordValidation = validatePasswordStrength(passwordForm.nextPassword);

    if (!passwordValidation.isValid) {
      setFeedback({
        tone: 'error',
        message: passwordValidation.message,
      });
      return;
    }

    if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
      setFeedback({
        tone: 'error',
        message: 'La confirmation du nouveau mot de passe ne correspond pas.',
      });
      return;
    }

    const result = await updateInternalCredentials(selectedInternal.id, {
      currentPassword: passwordForm.currentPassword,
      loginId: selectedInternal.loginId,
      mustChangePassword: false,
      password: passwordForm.nextPassword,
    });

    setFeedback({
      tone: result.success ? 'success' : 'error',
      message: result.message,
    });

    if (result.success) {
      closeSheet();
    }
  };

  const handleEmailSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = await requestEmailChange(
      emailForm.contactEmail,
      emailForm.currentPassword
    );

    setFeedback({
      tone: result.success ? 'success' : 'error',
      message: result.message,
    });

    if (result.success) {
      closeSheet();
    }
  };

  const handleExport = () => {
    if (internalInterventions.length === 0) {
      setFeedback({
        tone: 'error',
        message: 'Aucune intervention n’est encore disponible pour l’export.',
      });
      return;
    }

    downloadInterventionsExcel(
      internalInterventions,
      internalProfiles,
      customSurgicalInterventions,
      {},
      selectableSeniors
    );
    setFeedback({
      tone: 'success',
      message: 'L’export Excel compatible a été téléchargé.',
    });
    closeSheet();
  };

  const handleDeletePendingIntervention = async () => {
    if (!pendingDeletionCandidate || isDeletingPendingIntervention) {
      return;
    }

    setPendingDeletionError('');
    setIsDeletingPendingIntervention(true);

    try {
      await deletePendingIntervention(pendingDeletionCandidate.id);
      closeSheet();
      startNewIntervention();
    } catch (error) {
      setPendingDeletionError(
        error instanceof Error
          ? error.message
          : 'La suppression n’a pas pu être confirmée par Supabase.'
      );
    } finally {
      setIsDeletingPendingIntervention(false);
    }
  };

  const handleSupportClick = () => {
    if (typeof window === 'undefined') {
      return;
    }

    window.location.href = buildSupportMailto({
      body: [
        'Bonjour,',
        '',
        'Je rencontre le problème suivant :',
        '',
        '[Décrivez votre demande ici]',
        '',
        `Nom : ${fullName}`,
        `Semestre : ${selectedInternal.semester}`,
        `Établissement : ${selectedInternal.institution}`,
        'Espace : Interne',
      ].join('\n'),
      subject: 'Support espace interne',
    });
  };

  const handleLogout = async () => {
    setFeedback(null);
    setIsLoggingOut(true);

    try {
      await logout();
      closeSheet();
    } catch {
      setFeedback({
        tone: 'error',
        message:
          'La déconnexion globale n’a pas pu être confirmée. Vérifie le réseau puis réessaie.',
      });
      setIsLoggingOut(false);
    }
  };

  const handlePhotoAction = () => {
    setFeedback(null);
    photoInputRef.current?.click();
  };

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setFeedback({
        tone: 'error',
        message: 'Choisis une image valide pour la photo de profil.',
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFeedback({
        tone: 'error',
        message: 'La photo est trop lourde. Choisis un fichier de moins de 10 Mo.',
      });
      return;
    }

    try {
      const sourceDataUrl = await readImageDataUrl(file);
      const image = await loadImageElement(sourceDataUrl);

      setPhotoCrop({
        fileName: file.name,
        height: image.height,
        panX: 0,
        panY: 0,
        sourceDataUrl,
        width: image.width,
        zoom: 1,
      });
      setActiveSheet('photo');
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Impossible de mettre a jour la photo de profil.',
      });
    }
  };

  const handlePhotoCropSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!photoCrop) {
      return;
    }

    try {
      const avatarImageSrc = await createAvatarDataUrl(photoCrop);
      const result = await updateInternalProfileSettings(selectedInternal.id, {
        avatarImageSrc,
      });

      setFeedback({
        tone: result.success ? 'success' : 'error',
        message: result.message,
      });

      if (result.success) {
        closeSheet();
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Impossible de mettre a jour la photo de profil.',
      });
    }
  };

  const photoPreview =
    photoCrop != null
      ? getCropGeometry(
          photoCrop.width,
          photoCrop.height,
          220,
          photoCrop.zoom,
          photoCrop.panX,
          photoCrop.panY
        )
      : null;

  return (
    <ScreenContainer
      title="Mon compte"
    >
      {feedback ? (
        <div
          className={`account-feedback ${
            feedback.tone === 'success'
              ? 'account-feedback--success'
              : 'account-feedback--error'
          }`.trim()}
        >
          {feedback.message}
        </div>
      ) : null}

      <input
        accept="image/*"
        className="visually-hidden"
        onChange={handlePhotoChange}
        ref={photoInputRef}
        type="file"
      />

      <section className="account-profile-card">
        <div className="account-profile-card__copy">
          <h2>{fullName}</h2>
          <p className="account-profile-card__status">
            Interne – {semesterLabel}
          </p>
          <div className="account-profile-card__meta">
            <span>{selectedInternal.institution}</span>
          </div>
        </div>
        <InternalAvatar
          className="account-profile-card__badge"
          firstName={selectedInternal.firstName}
          imageSrc={selectedInternal.avatarImageSrc}
          lastName={selectedInternal.lastName}
        />
      </section>

      <AccountSection title="Mon profil">
        <div className="account-list-card">
          <AccountActionRow
            description="Modifier mon semestre"
            icon={<GraduationCap strokeWidth={2.05} />}
            label="Formation"
            onClick={() => openSheet('training')}
          />
          <AccountActionRow
            description="Choisir ou remplacer ma photo de profil"
            icon={<Camera strokeWidth={2.05} />}
            label="Modifier photo de profil"
            onClick={handlePhotoAction}
          />
          <AccountActionRow
            description="Modifier mon mot de passe"
            icon={<LockKeyhole strokeWidth={2.05} />}
            label="Mot de passe"
            onClick={() => openSheet('password')}
          />
          <AccountActionRow
            description={
              selectedInternal.contactEmail ||
              'Adresse à confirmer lors de la première connexion'
            }
            icon={<Mail strokeWidth={2.05} />}
            label="Adresse e-mail"
            onClick={() => openSheet('email')}
          />
        </div>
      </AccountSection>

      <AccountSection title="MES DONNÉES">
        <div className="account-list-card">
          <AccountActionRow
            description={
              pendingInterventions.length > 0
                ? `${pendingInterventions.length} intervention${
                    pendingInterventions.length > 1 ? 's' : ''
                  } en attente d’évaluation`
                : 'Aucune intervention en attente d’évaluation'
            }
            icon={<Trash2 strokeWidth={2.05} />}
            label="Interventions en attente"
            onClick={() => openSheet('pending-interventions')}
          />
          <AccountActionRow
            description="Télécharger mes données de bloc"
            icon={<FileSpreadsheet strokeWidth={2.05} />}
            label="Exporter mes statistiques"
            onClick={() => openSheet('export')}
          />
        </div>
      </AccountSection>

      <AccountSection title="SUPPORT">
        <div className="account-list-card">
          <AccountActionRow
            description="Signaler un bug ou proposer une amélioration"
            icon={<MessageCircle strokeWidth={2.05} />}
            label="Contacter le support"
            onClick={handleSupportClick}
          />
        </div>
      </AccountSection>

      <AccountSection title="À PROPOS">
        <div className="account-list-card">
          <AccountActionRow
            description="Version, mentions légales et confidentialité"
            icon={<Info strokeWidth={2.05} />}
            label="À propos de ce site"
            onClick={() => openSheet('about')}
          />
        </div>
      </AccountSection>

      <button
        className="account-logout-button"
        disabled={isLoggingOut}
        onClick={handleLogout}
        type="button"
      >
        <LogOut aria-hidden="true" />
        <span>{isLoggingOut ? 'Déconnexion…' : 'Se déconnecter'}</span>
      </button>

      {activeSheet ? (
        <div
          className="account-sheet-backdrop"
          onClick={closeSheet}
        >
          <div
            aria-label={accountSheetLabels[activeSheet]}
            aria-modal="true"
            className={`account-sheet account-sheet--${activeSheet}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            {activeSheet === 'training' ? (
              <AccountSheetFrame
                description="Mets à jour tes informations profil."
                eyebrow="Mon profil"
                icon={<GraduationCap strokeWidth={2} />}
                title="Formation"
                onClose={closeSheet}
              >
                <form className="account-sheet__form" onSubmit={handleTrainingSubmit}>
                  <SheetSelect
                    label="Semestre"
                    options={semesterOptions}
                    value={trainingForm.semester}
                    onChange={(event) =>
                      setTrainingForm((current) => ({
                        ...current,
                        semester: event.target.value,
                      }))
                    }
                  />
                  <div className="account-sheet__actions">
                    <button className="flow-button flow-button--primary" type="submit">
                      Enregistrer
                    </button>
                  </div>
                </form>
              </AccountSheetFrame>
            ) : null}

            {activeSheet === 'photo' && photoCrop && photoPreview ? (
              <AccountSheetFrame
                description="Recadre ta photo avant de l’enregistrer."
                eyebrow="Mon profil"
                icon={<Camera strokeWidth={2} />}
                title="Photo de profil"
                onClose={closeSheet}
              >
                <form className="account-sheet__form" onSubmit={handlePhotoCropSubmit}>
                  <div className="account-photo-cropper">
                    <div className="account-photo-cropper__viewport">
                      <img
                        alt=""
                        className="account-photo-cropper__image"
                        src={photoCrop.sourceDataUrl}
                        style={{
                          height: `${photoPreview.drawHeight}px`,
                          transform: `translate(${photoPreview.offsetX}px, ${photoPreview.offsetY}px)`,
                          width: `${photoPreview.drawWidth}px`,
                        }}
                      />
                    </div>
                    <div className="account-photo-cropper__meta">
                      <strong>{photoCrop.fileName}</strong>
                      <span>L’aperçu montre le cadrage final du profil.</span>
                    </div>
                  </div>

                  <SheetRange
                    label="Zoom"
                    max={200}
                    min={100}
                    onChange={(event) =>
                      setPhotoCrop((current) =>
                        current
                          ? {
                              ...current,
                              zoom: Number(event.target.value) / 100,
                            }
                          : current
                      )
                    }
                    value={Math.round(photoCrop.zoom * 100)}
                  />
                  <SheetRange
                    disabled={photoPreview.drawWidth <= 220}
                    label="Déplacement horizontal"
                    max={100}
                    min={-100}
                    onChange={(event) =>
                      setPhotoCrop((current) =>
                        current
                          ? {
                              ...current,
                              panX: Number(event.target.value),
                            }
                          : current
                      )
                    }
                    value={photoCrop.panX}
                  />
                  <SheetRange
                    disabled={photoPreview.drawHeight <= 220}
                    label="Déplacement vertical"
                    max={100}
                    min={-100}
                    onChange={(event) =>
                      setPhotoCrop((current) =>
                        current
                          ? {
                              ...current,
                              panY: Number(event.target.value),
                            }
                          : current
                      )
                    }
                    value={photoCrop.panY}
                  />

                  <div className="account-sheet__actions account-sheet__actions--split">
                    <button
                      className="flow-button flow-button--secondary"
                      onClick={closeSheet}
                      type="button"
                    >
                      Annuler
                    </button>
                    <button className="flow-button flow-button--primary" type="submit">
                      Enregistrer
                    </button>
                  </div>
                </form>
              </AccountSheetFrame>
            ) : null}

            {activeSheet === 'password' ? (
              <AccountSheetFrame
                description="Modifie ton mot de passe à tout moment."
                eyebrow="Mon profil"
                icon={<LockKeyhole strokeWidth={2} />}
                title="Mot de passe"
                onClose={closeSheet}
              >
                <form className="account-sheet__form" onSubmit={handlePasswordSubmit}>
                  <SheetField
                    label="Mot de passe actuel"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }))
                    }
                  />
                  <div className="account-password-policy">
                    <ShieldCheck aria-hidden="true" />
                    <p>{PASSWORD_POLICY_HELP}</p>
                  </div>
                  <SheetField
                    label="Nouveau mot de passe"
                    type="password"
                    value={passwordForm.nextPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        nextPassword: event.target.value,
                      }))
                    }
                  />
                  <SheetField
                    label="Confirmer le nouveau mot de passe"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) =>
                      setPasswordForm((current) => ({
                        ...current,
                        confirmPassword: event.target.value,
                      }))
                    }
                  />
                  <div className="account-sheet__actions">
                    <button className="flow-button flow-button--primary" type="submit">
                      Mettre à jour
                    </button>
                  </div>
                </form>
              </AccountSheetFrame>
            ) : null}

            {activeSheet === 'email' ? (
              <AccountSheetFrame
                description="La nouvelle adresse remplacera l’adresse actuelle après confirmation du lien reçu."
                eyebrow="Mon profil"
                icon={<Mail strokeWidth={2} />}
                title="Adresse e-mail"
                onClose={closeSheet}
              >
                <form className="account-sheet__form" onSubmit={handleEmailSubmit}>
                  <p className="account-sheet__text">
                    Adresse actuelle :{' '}
                    <strong>
                      {selectedInternal.contactEmail || 'Non renseignée'}
                    </strong>
                  </p>
                  <SheetField
                    label="Nouvelle adresse e-mail"
                    type="email"
                    value={emailForm.contactEmail}
                    onChange={(event) => {
                      setEmailForm((current) => ({
                        ...current,
                        contactEmail: event.target.value,
                      }));
                      setFeedback(null);
                    }}
                  />
                  <SheetField
                    label="Mot de passe actuel"
                    type="password"
                    value={emailForm.currentPassword}
                    onChange={(event) => {
                      setEmailForm((current) => ({
                        ...current,
                        currentPassword: event.target.value,
                      }));
                      setFeedback(null);
                    }}
                  />
                  {feedback ? (
                    <div
                      className={
                        feedback.tone === 'success' ? 'auth-success' : 'auth-error'
                      }
                      role="status"
                    >
                      {feedback.message}
                    </div>
                  ) : null}
                  <div className="account-sheet__actions">
                    <button className="flow-button flow-button--primary" type="submit">
                      Envoyer le lien de confirmation
                    </button>
                  </div>
                </form>
              </AccountSheetFrame>
            ) : null}

            {activeSheet === 'export' ? (
              <AccountSheetFrame
                description="Exporte tes données personnelles dans un format compatible Excel."
                eyebrow="Mes données"
                icon={<FileSpreadsheet strokeWidth={2} />}
                title="Exporter mes statistiques"
                onClose={closeSheet}
              >
                <div className="account-sheet__stack">
                  <p className="account-sheet__text">
                    {internalInterventions.length > 0
                      ? `${internalInterventions.length} intervention(s) seront incluses dans le fichier.`
                      : 'Aucune intervention enregistrée pour le moment.'}
                  </p>
                  <div className="account-sheet__actions">
                    <button
                      className="flow-button flow-button--primary"
                      onClick={handleExport}
                      type="button"
                    >
                      Télécharger le fichier Excel
                    </button>
                  </div>
                </div>
              </AccountSheetFrame>
            ) : null}

            {activeSheet === 'pending-interventions' ? (
              <AccountSheetFrame
                description="Supprime une saisie non évaluée pour la recommencer depuis le début."
                eyebrow="Mes données"
                icon={<Trash2 strokeWidth={2.05} />}
                title="Interventions en attente"
                onClose={closeSheet}
              >
                <div className="account-sheet__stack">
                  {pendingDeletionCandidate ? (
                    <div className="account-pending-confirmation">
                      <div className="account-pending-confirmation__heading">
                        <strong>Supprimer cette intervention ?</strong>
                        <span>
                          {getProcedureLabel(
                            pendingDeletionCandidate.procedure,
                            customSurgicalInterventions
                          )}
                        </span>
                        <span>
                          {formatIsoDate(pendingDeletionCandidate.date)} ·{' '}
                          {getPendingInterventionSeniorLabel(
                            pendingDeletionCandidate.seniorId,
                            selectableSeniors
                          )}
                        </span>
                      </div>
                      <p>
                        L’intervention et sa demande d’évaluation seront supprimées.
                        Cette action est définitive et une nouvelle saisie vierge
                        s’ouvrira ensuite.
                      </p>
                      {pendingDeletionError ? (
                        <div className="auth-error" role="alert">
                          {pendingDeletionError}
                        </div>
                      ) : null}
                      <div className="account-sheet__actions account-sheet__actions--split">
                        <button
                          className="account-button"
                          disabled={isDeletingPendingIntervention}
                          onClick={() => {
                            setPendingDeletionCandidateId(null);
                            setPendingDeletionError('');
                          }}
                          type="button"
                        >
                          Annuler
                        </button>
                        <button
                          className="account-button account-button--danger"
                          disabled={isDeletingPendingIntervention}
                          onClick={() => void handleDeletePendingIntervention()}
                          type="button"
                        >
                          {isDeletingPendingIntervention
                            ? 'Suppression…'
                            : 'Supprimer et recommencer'}
                        </button>
                      </div>
                    </div>
                  ) : pendingInterventions.length > 0 ? (
                    <div className="account-pending-list" role="list">
                      {pendingInterventions.map((intervention) => (
                        <article
                          className="account-pending-row"
                          key={intervention.id}
                          role="listitem"
                        >
                          <div className="account-pending-row__copy">
                            <strong>
                              {getProcedureLabel(
                                intervention.procedure,
                                customSurgicalInterventions
                              )}
                            </strong>
                            <span>
                              {formatIsoDate(intervention.date)} ·{' '}
                              {getPendingInterventionSeniorLabel(
                                intervention.seniorId,
                                selectableSeniors
                              )}
                            </span>
                          </div>
                          <button
                            aria-label={`Supprimer ${getProcedureLabel(
                              intervention.procedure,
                              customSurgicalInterventions
                            )} du ${formatIsoDate(intervention.date)}`}
                            className="account-pending-row__delete"
                            onClick={() => {
                              setPendingDeletionError('');
                              setPendingDeletionCandidateId(intervention.id);
                            }}
                            type="button"
                          >
                            <Trash2 aria-hidden="true" />
                            <span>Supprimer</span>
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="account-pending-empty">
                      <LockKeyhole aria-hidden="true" />
                      <strong>Aucune intervention en attente</strong>
                      <p>
                        Les interventions déjà évaluées restent définitivement
                        protégées dans ton historique.
                      </p>
                    </div>
                  )}
                </div>
              </AccountSheetFrame>
            ) : null}

            {activeSheet === 'about' ? (
              <AccountSheetFrame
                description="Les contenus détaillés seront complétés ensuite."
                eyebrow="À propos"
                icon={<Info strokeWidth={2} />}
                title="À propos de Mon Journal de Bloc"
                onClose={closeSheet}
              >
                <div className="account-sheet__stack">
                  <div className="account-about-list">
                    <div>
                      <strong>Version</strong>
                      <span>{packageJson.version}</span>
                    </div>
                    <div>
                      <strong>Mentions légales</strong>
                      <span>À rédiger</span>
                    </div>
                    <div>
                      <strong>Politique de confidentialité</strong>
                      <span>À rédiger</span>
                    </div>
                  </div>
                </div>
              </AccountSheetFrame>
            ) : null}

          </div>
        </div>
      ) : null}
    </ScreenContainer>
  );
}

function AccountSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="account-section">
      <h2 className="account-section__title">{title}</h2>
      {children}
    </section>
  );
}

function AccountActionRow({
  icon,
  label,
  description,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button className="account-action-row" onClick={onClick} type="button">
      <span className="account-action-row__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="account-action-row__copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      <ChevronRight aria-hidden="true" className="account-action-row__chevron" />
    </button>
  );
}

function AccountSheetFrame({
  title,
  description,
  eyebrow,
  icon,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div className="account-sheet__header">
        <div className="account-sheet__heading-group">
          {icon ? (
            <span className="account-sheet__heading-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div className="account-sheet__heading">
            {eyebrow ? (
              <span className="account-sheet__eyebrow">{eyebrow}</span>
            ) : null}
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
        </div>
        <button
          aria-label="Fermer"
          className="account-sheet__close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" />
        </button>
      </div>
      {children}
    </>
  );
}

function SheetRange({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  min: number;
  max: number;
  disabled?: boolean;
}) {
  return (
    <label className="account-sheet__field">
      <span>{label}</span>
      <div className="account-sheet__range-wrap">
        <input
          className="account-sheet__range"
          disabled={disabled}
          max={max}
          min={min}
          onChange={onChange}
          step={1}
          type="range"
          value={value}
        />
        <strong className="account-sheet__range-value">
          {label === 'Zoom' ? `${value}%` : value}
        </strong>
      </div>
    </label>
  );
}

function SheetField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  type?: 'email' | 'text' | 'password';
}) {
  return (
    <label className="account-sheet__field">
      <span>{label}</span>
      <input
        className="account-sheet__input"
        onChange={onChange}
        type={type}
        value={value}
      />
    </label>
  );
}

function SheetSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <label className="account-sheet__field">
      <span>{label}</span>
      <span className="account-sheet__select-wrap">
        <select
          className="account-sheet__input account-sheet__select"
          onChange={onChange}
          value={value}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className="account-sheet__select-icon" />
      </span>
    </label>
  );
}

function formatSemesterLabel(value: string) {
  const normalizedValue = value.trim().toUpperCase();

  if (normalizedValue.startsWith('S')) {
    return `Semestre ${normalizedValue.slice(1)}`;
  }

  return normalizedValue;
}
