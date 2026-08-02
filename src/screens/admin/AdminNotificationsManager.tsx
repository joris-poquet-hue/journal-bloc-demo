import {
  Bell,
  CalendarClock,
  ExternalLink,
  Pencil,
  Send,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  cancelBackendAdminNotificationMessage,
  countBackendAdminNotificationRecipients,
  createBackendAdminNotificationMessage,
  loadBackendAdminNotificationMessages,
  retractBackendAdminNotificationMessage,
  updateBackendAdminNotificationMessage,
} from '../../services/backendRepository';
import type {
  BackendAdminNotificationMessage,
  BackendAdminNotificationMessageInput,
} from '../../shared/backendTypes';
import type { Institution, InternalProfile, Senior } from '../../types';
import { formatDisplayName } from '../../data/mockData';

type AdminNotificationsManagerProps = {
  institutions: Institution[];
  internalProfiles: InternalProfile[];
  seniors: Senior[];
};

type MessageForm = {
  actionLabel: string;
  actionTarget: string;
  actionType: 'external_url' | 'internal_path' | 'none';
  audienceInstitutionId: string;
  audienceProfileId: string;
  audienceRole: 'internal' | 'senior';
  audienceType: BackendAdminNotificationMessage['audienceType'];
  body: string;
  date: string;
  deletionPolicy: BackendAdminNotificationMessage['deletionPolicy'];
  isScheduled: boolean;
  time: string;
  title: string;
};

function formatLocalDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

const emptyForm = (): MessageForm => {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  return {
    actionLabel: '',
    actionTarget: '',
    actionType: 'none',
    audienceInstitutionId: '',
    audienceProfileId: '',
    audienceRole: 'internal',
    audienceType: 'all',
    body: '',
    date: formatLocalDateInput(tomorrow),
    deletionPolicy: 'on_read',
    isScheduled: false,
    time: '09:00',
    title: '',
  };
};

function formatAdminMessageDate(value: string | null) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function getStatusLabel(status: BackendAdminNotificationMessage['status']) {
  switch (status) {
    case 'scheduled':
      return 'Programmé';
    case 'sending':
      return 'Envoi en cours';
    case 'sent':
      return 'Envoyé';
    case 'cancelled':
      return 'Annulé';
    case 'retracted':
      return 'Retiré';
  }
}

export function AdminNotificationsManager({
  institutions,
  internalProfiles,
  seniors,
}: AdminNotificationsManagerProps) {
  const [form, setForm] = useState<MessageForm>(() => emptyForm());
  const [messages, setMessages] = useState<BackendAdminNotificationMessage[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [recipientCount, setRecipientCount] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const activeInstitutions = institutions.filter(
    (institution) => institution.status === 'active'
  );
  const activeProfiles = useMemo(
    () =>
      [
        ...internalProfiles
          .filter((profile) => profile.isActive !== false)
          .map((profile) => ({
            id: profile.id,
            label: `${formatDisplayName(profile.firstName, profile.lastName)} · Interne`,
          })),
        ...seniors
          .filter((senior) => senior.isActive !== false)
          .map((senior) => ({
            id: senior.id,
            label: `${formatDisplayName(senior.firstName, senior.lastName)} · Senior`,
          })),
      ].sort((left, right) => left.label.localeCompare(right.label, 'fr-FR')),
    [internalProfiles, seniors]
  );

  const loadMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      setMessages(await loadBackendAdminNotificationMessages());
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Impossible de charger les messages.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    let cancelled = false;

    const updateRecipientCount = async () => {
      if (
        (form.audienceType === 'institution' && !form.audienceInstitutionId) ||
        (form.audienceType === 'profile' && !form.audienceProfileId)
      ) {
        setRecipientCount(0);
        return;
      }

      try {
        const count = await countBackendAdminNotificationRecipients({
          audienceInstitutionId:
            form.audienceType === 'institution'
              ? form.audienceInstitutionId
              : null,
          audienceProfileId:
            form.audienceType === 'profile' ? form.audienceProfileId : null,
          audienceRole: form.audienceType === 'role' ? form.audienceRole : null,
          audienceType: form.audienceType,
        });

        if (!cancelled) {
          setRecipientCount(Number(count) || 0);
        }
      } catch {
        if (!cancelled) {
          setRecipientCount(0);
        }
      }
    };

    void updateRecipientCount();

    return () => {
      cancelled = true;
    };
  }, [
    form.audienceInstitutionId,
    form.audienceProfileId,
    form.audienceRole,
    form.audienceType,
  ]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingMessageId(null);
    setFeedback(null);
  };

  const buildInput = (): BackendAdminNotificationMessageInput | null => {
    if (!form.title.trim() || !form.body.trim()) {
      setFeedback('Le titre et le message sont obligatoires.');
      return null;
    }

    if (recipientCount < 1) {
      setFeedback('Cette cible ne contient actuellement aucun destinataire actif.');
      return null;
    }

    let scheduledAt: string | null = null;
    if (form.isScheduled) {
      const scheduledDate = new Date(`${form.date}T${form.time}`);
      if (Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
        setFeedback('Choisis une date et une heure futures.');
        return null;
      }
      scheduledAt = scheduledDate.toISOString();
    }

    if (form.actionType !== 'none') {
      if (!form.actionLabel.trim() || !form.actionTarget.trim()) {
        setFeedback('Le libellé et la destination du bouton sont obligatoires.');
        return null;
      }

      if (form.actionType === 'external_url') {
        try {
          const url = new URL(form.actionTarget);
          if (url.protocol !== 'https:') {
            throw new Error('unsupported protocol');
          }
        } catch {
          setFeedback('Le lien externe doit être une adresse https:// valide.');
          return null;
        }
      }
    }

    return {
      actionLabel: form.actionType === 'none' ? null : form.actionLabel.trim(),
      actionTarget: form.actionType === 'none' ? null : form.actionTarget.trim(),
      actionType: form.actionType === 'none' ? null : form.actionType,
      audienceInstitutionId:
        form.audienceType === 'institution' ? form.audienceInstitutionId : null,
      audienceProfileId:
        form.audienceType === 'profile' ? form.audienceProfileId : null,
      audienceRole: form.audienceType === 'role' ? form.audienceRole : null,
      audienceType: form.audienceType,
      body: form.body.trim(),
      deletionPolicy: form.deletionPolicy,
      scheduledAt,
      title: form.title.trim(),
    };
  };

  const submitMessage = async () => {
    const input = buildInput();
    if (!input) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const nextMessages = editingMessageId
        ? await updateBackendAdminNotificationMessage(editingMessageId, input)
        : await createBackendAdminNotificationMessage(input);
      setMessages(nextMessages);
      setFeedback(
        editingMessageId
          ? 'Le message programmé a été mis à jour.'
          : form.isScheduled
            ? 'Le message a été programmé.'
            : 'Le message a été envoyé.'
      );
      setEditingMessageId(null);
      setForm(emptyForm());
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Impossible d’enregistrer le message.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const editMessage = (message: BackendAdminNotificationMessage) => {
    const scheduledDate = new Date(message.scheduledAt);
    setEditingMessageId(message.id);
    setForm({
      actionLabel: message.actionLabel ?? '',
      actionTarget: message.actionTarget ?? '',
      actionType: message.actionType ?? 'none',
      audienceInstitutionId: message.audienceInstitutionId ?? '',
      audienceProfileId: message.audienceProfileId ?? '',
      audienceRole: message.audienceRole ?? 'internal',
      audienceType: message.audienceType,
      body: message.body,
      date: formatLocalDateInput(scheduledDate),
      deletionPolicy: message.deletionPolicy,
      isScheduled: true,
      time: `${String(scheduledDate.getHours()).padStart(2, '0')}:${String(
        scheduledDate.getMinutes()
      ).padStart(2, '0')}`,
      title: message.title,
    });
    window.scrollTo({ behavior: 'smooth', top: 0 });
  };

  const cancelMessage = async (messageId: string) => {
    setFeedback(null);
    try {
      await cancelBackendAdminNotificationMessage(messageId);
      await loadMessages();
      setFeedback('Le message programmé a été annulé.');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Impossible d’annuler le message.'
      );
    }
  };

  const retractMessage = async (messageId: string) => {
    setFeedback(null);
    try {
      await retractBackendAdminNotificationMessage(messageId);
      await loadMessages();
      setFeedback('Le message a été retiré des centres de notifications.');
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : 'Impossible de retirer le message.'
      );
    }
  };

  return (
    <div className="admin-notifications-page">
      <div className="admin-notifications-layout">
        <section className="admin-notification-composer">
          <header>
            <span className="admin-notification-composer__icon"><Send /></span>
            <div>
              <span>{editingMessageId ? 'Modification' : 'Nouveau message'}</span>
              <h3>{editingMessageId ? 'Modifier le message programmé' : 'Rédiger un message'}</h3>
            </div>
          </header>

          <div className="admin-notification-form">
            <label>
              Titre
              <input
                maxLength={100}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                value={form.title}
              />
            </label>
            <label>
              Message
              <textarea
                maxLength={1500}
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                rows={5}
                value={form.body}
              />
            </label>

            <div className="admin-notification-form__grid">
              <label>
                Destinataires
                <select
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    audienceType: event.target.value as MessageForm['audienceType'],
                  }))}
                  value={form.audienceType}
                >
                  <option value="all">Tous les utilisateurs</option>
                  <option value="role">Par rôle</option>
                  <option value="institution">Par établissement</option>
                  <option value="profile">Un utilisateur précis</option>
                </select>
              </label>

              {form.audienceType === 'role' ? (
                <label>
                  Rôle
                  <select
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      audienceRole: event.target.value as MessageForm['audienceRole'],
                    }))}
                    value={form.audienceRole}
                  >
                    <option value="internal">Internes</option>
                    <option value="senior">Seniors</option>
                  </select>
                </label>
              ) : null}

              {form.audienceType === 'institution' ? (
                <label>
                  Établissement
                  <select
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      audienceInstitutionId: event.target.value,
                    }))}
                    value={form.audienceInstitutionId}
                  >
                    <option value="">Choisir</option>
                    {activeInstitutions.map((institution) => (
                      <option key={institution.id} value={institution.id}>{institution.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              {form.audienceType === 'profile' ? (
                <label>
                  Utilisateur
                  <select
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      audienceProfileId: event.target.value,
                    }))}
                    value={form.audienceProfileId}
                  >
                    <option value="">Choisir</option>
                    {activeProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>

            <div className="admin-notification-recipient-count">
              <Users aria-hidden="true" />
              <strong>{recipientCount}</strong>
              <span>destinataire{recipientCount > 1 ? 's' : ''} actif{recipientCount > 1 ? 's' : ''}</span>
            </div>

            <fieldset className="admin-notification-choice">
              <legend>Moment de l’envoi</legend>
              <label>
                <input
                  checked={!form.isScheduled}
                  name="notification-timing"
                  onChange={() => setForm((current) => ({ ...current, isScheduled: false }))}
                  type="radio"
                />
                Maintenant
              </label>
              <label>
                <input
                  checked={form.isScheduled}
                  name="notification-timing"
                  onChange={() => setForm((current) => ({ ...current, isScheduled: true }))}
                  type="radio"
                />
                Programmer
              </label>
            </fieldset>

            {form.isScheduled ? (
              <div className="admin-notification-form__grid">
                <label>
                  Date
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                    type="date"
                    value={form.date}
                  />
                </label>
                <label>
                  Heure
                  <input
                    onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))}
                    type="time"
                    value={form.time}
                  />
                </label>
              </div>
            ) : null}

            <fieldset className="admin-notification-choice">
              <legend>Après lecture</legend>
              <label>
                <input
                  checked={form.deletionPolicy === 'on_read'}
                  name="notification-deletion"
                  onChange={() => setForm((current) => ({ ...current, deletionPolicy: 'on_read' }))}
                  type="radio"
                />
                Supprimer automatiquement
              </label>
              <label>
                <input
                  checked={form.deletionPolicy === 'manual'}
                  name="notification-deletion"
                  onChange={() => setForm((current) => ({ ...current, deletionPolicy: 'manual' }))}
                  type="radio"
                />
                Conserver jusqu’à suppression manuelle
              </label>
            </fieldset>

            <label>
              Bouton d’action facultatif
              <select
                onChange={(event) => setForm((current) => ({
                  ...current,
                  actionType: event.target.value as MessageForm['actionType'],
                }))}
                value={form.actionType}
              >
                <option value="none">Aucun bouton</option>
                <option value="internal_path">Page de l’application</option>
                <option value="external_url">Lien externe</option>
              </select>
            </label>

            {form.actionType !== 'none' ? (
              <div className="admin-notification-form__grid">
                <label>
                  Libellé du bouton
                  <input
                    maxLength={60}
                    onChange={(event) => setForm((current) => ({ ...current, actionLabel: event.target.value }))}
                    value={form.actionLabel}
                  />
                </label>
                <label>
                  {form.actionType === 'external_url' ? 'Adresse du lien' : 'Page'}
                  {form.actionType === 'internal_path' ? (
                    <select
                      onChange={(event) => setForm((current) => ({ ...current, actionTarget: event.target.value }))}
                      value={form.actionTarget}
                    >
                      <option value="">Choisir</option>
                      <option value="/accueil">Accueil</option>
                      <option value="/progression">Progression</option>
                      <option value="/historique">Historique</option>
                      <option value="/trophees">Trophées</option>
                      <option value="/profil">Profil</option>
                    </select>
                  ) : (
                    <input
                      onChange={(event) => setForm((current) => ({ ...current, actionTarget: event.target.value }))}
                      placeholder="https://…"
                      type="url"
                      value={form.actionTarget}
                    />
                  )}
                </label>
              </div>
            ) : null}

            {feedback ? <p className="admin-notification-feedback">{feedback}</p> : null}

            <div className="admin-notification-form__actions">
              {editingMessageId ? (
                <button className="admin-secondary-button" onClick={resetForm} type="button">
                  Annuler la modification
                </button>
              ) : null}
              <button
                className="flow-button flow-button--primary"
                disabled={isSaving}
                onClick={() => void submitMessage()}
                type="button"
              >
                <Send aria-hidden="true" />
                {isSaving ? 'Enregistrement…' : form.isScheduled ? 'Programmer' : 'Envoyer'}
              </button>
            </div>
          </div>
        </section>

        <aside className="admin-notification-preview">
          <span>Aperçu</span>
          <article>
            <header>
              <Bell aria-hidden="true" />
              <span>Mon Journal de Bloc</span>
            </header>
            <strong>{form.title.trim() || 'Titre du message'}</strong>
            <p>{form.body.trim() || 'Votre message apparaîtra ici.'}</p>
            {form.actionType !== 'none' && form.actionLabel ? (
              <span className="admin-notification-preview__action">
                {form.actionLabel}
                {form.actionType === 'external_url' ? <ExternalLink /> : null}
              </span>
            ) : null}
          </article>
        </aside>
      </div>

      <section className="admin-notification-history">
        <header>
          <div>
            <span>Suivi</span>
            <h3>Messages envoyés et programmés</h3>
          </div>
          <button onClick={() => void loadMessages()} type="button">Actualiser</button>
        </header>

        {isLoading ? (
          <p>Chargement des messages…</p>
        ) : messages.length ? (
          <div className="admin-notification-history__list">
            {messages.map((message) => (
              <article key={message.id}>
                <div className="admin-notification-history__main">
                  <span className={`admin-notification-status admin-notification-status--${message.status}`}>
                    {getStatusLabel(message.status)}
                  </span>
                  <strong>{message.title}</strong>
                  <p>{message.body}</p>
                  <time dateTime={message.scheduledAt}>
                    {message.status === 'sent' ? 'Envoyé le ' : 'Prévu le '}
                    {formatAdminMessageDate(message.sentAt ?? message.scheduledAt)}
                  </time>
                </div>
                <div className="admin-notification-history__stats">
                  <span><strong>{message.recipientCount}</strong> destinataires</span>
                  <span><strong>{message.unreadCount}</strong> non lus</span>
                  <span><strong>{message.readCount}</strong> lus</span>
                </div>
                <div className="admin-notification-history__actions">
                  {message.status === 'scheduled' ? (
                    <>
                      <button onClick={() => editMessage(message)} type="button">
                        <Pencil aria-hidden="true" /> Modifier
                      </button>
                      <button onClick={() => void cancelMessage(message.id)} type="button">
                        <XCircle aria-hidden="true" /> Annuler
                      </button>
                    </>
                  ) : null}
                  {message.status === 'sent' ? (
                    <button onClick={() => void retractMessage(message.id)} type="button">
                      <Trash2 aria-hidden="true" /> Retirer
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-notification-history__empty">
            <CalendarClock aria-hidden="true" />
            <strong>Aucun message préparé</strong>
          </div>
        )}
      </section>
    </div>
  );
}
