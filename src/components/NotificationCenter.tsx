import { Bell, CheckCheck, ExternalLink, Trash2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef } from 'react';

import type { BackendUserNotification } from '../shared/backendTypes';

type NotificationCenterProps = {
  isOpen: boolean;
  notifications: BackendUserNotification[];
  onClose: () => void;
  onDelete: (notificationId: string) => Promise<void>;
  onNavigate: (notification: BackendUserNotification) => void;
  onRead: (notificationId: string) => Promise<void>;
  onReadAll: () => Promise<void>;
};

function formatNotificationDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function NotificationCenter({
  isOpen,
  notifications,
  onClose,
  onDelete,
  onNavigate,
  onRead,
  onReadAll,
}: NotificationCenterProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const orderedNotifications = useMemo(
    () =>
      [...notifications].sort((left, right) => {
        if (Boolean(left.readAt) !== Boolean(right.readAt)) {
          return left.readAt ? 1 : -1;
        }

        return right.createdAt.localeCompare(left.createdAt);
      }),
    [notifications]
  );
  const unreadCount = notifications.filter((notification) => !notification.readAt)
    .length;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') {
    return null;
  }

  const openNotification = async (notification: BackendUserNotification) => {
    if (!notification.readAt) {
      await onRead(notification.id);
    }

    if (notification.actionType === 'external_url' && notification.actionTarget) {
      window.open(notification.actionTarget, '_blank', 'noopener,noreferrer');
      return;
    }

    if (notification.actionType && notification.actionTarget) {
      onClose();
      onNavigate(notification);
    }
  };

  return createPortal(
    <div className="notification-center-backdrop" onClick={onClose}>
      <section
        aria-labelledby="notification-center-title"
        aria-modal="true"
        className="notification-center"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="notification-center__header">
          <div className="notification-center__heading">
            <span className="notification-center__icon" aria-hidden="true">
              <Bell />
            </span>
            <div>
              <span>Centre de notifications</span>
              <h2 id="notification-center-title">Mes messages</h2>
            </div>
          </div>
          <button
            aria-label="Fermer les notifications"
            className="notification-center__close"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="notification-center__toolbar">
          <span>
            {unreadCount > 0
              ? `${unreadCount} message${unreadCount > 1 ? 's' : ''} non lu${
                  unreadCount > 1 ? 's' : ''
                }`
              : 'Tout est à jour'}
          </span>
          {unreadCount > 0 ? (
            <button onClick={() => void onReadAll()} type="button">
              <CheckCheck aria-hidden="true" />
              Tout marquer comme lu
            </button>
          ) : null}
        </div>

        <div className="notification-center__list">
          {orderedNotifications.length ? (
            orderedNotifications.map((notification) => {
              const isUnread = !notification.readAt;
              const isManualMessage =
                notification.kind === 'admin_message' &&
                notification.deletionPolicy === 'manual';

              return (
                <article
                  className={`notification-center__item${
                    isUnread ? ' notification-center__item--unread' : ''
                  }`}
                  key={notification.id}
                >
                  <button
                    className="notification-center__item-main"
                    onClick={() => void openNotification(notification)}
                    type="button"
                  >
                    <span className="notification-center__item-marker" aria-hidden="true" />
                    <span className="notification-center__item-copy">
                      {notification.kind === 'admin_message' ? (
                        <span className="notification-center__sender">
                          Mon Journal de Bloc
                        </span>
                      ) : null}
                      <strong>{notification.title}</strong>
                      <span>{notification.body}</span>
                      <time dateTime={notification.createdAt}>
                        {formatNotificationDate(notification.createdAt)}
                      </time>
                    </span>
                    {notification.actionType === 'external_url' ? (
                      <ExternalLink
                        aria-label="Ce lien s’ouvre dans un nouvel onglet"
                        className="notification-center__external"
                      />
                    ) : null}
                  </button>

                  {isManualMessage ? (
                    <button
                      aria-label={`Supprimer le message ${notification.title}`}
                      className="notification-center__delete"
                      onClick={() => void onDelete(notification.id)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  ) : null}
                </article>
              );
            })
          ) : (
            <div className="notification-center__empty">
              <Bell aria-hidden="true" />
              <strong>Aucun message</strong>
              <span>Les nouvelles informations apparaîtront ici.</span>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
