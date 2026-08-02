import { InternalAvatar } from './InternalAvatar';

type NotificationAvatarButtonProps = {
  className?: string;
  firstName: string;
  imageSrc?: string | null;
  lastName: string;
  onClick: () => void;
  unreadCount: number;
};

export function NotificationAvatarButton({
  className,
  firstName,
  imageSrc,
  lastName,
  onClick,
  unreadCount,
}: NotificationAvatarButtonProps) {
  const accessibleCount = Math.min(unreadCount, 99);

  return (
    <button
      aria-label={
        unreadCount > 0
          ? `Ouvrir les notifications, ${unreadCount} message${
              unreadCount > 1 ? 's' : ''
            } non lu${unreadCount > 1 ? 's' : ''}`
          : 'Ouvrir les notifications'
      }
      className={[
        'notification-avatar-button',
        unreadCount > 0 ? 'notification-avatar-button--unread' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onClick}
      type="button"
    >
      <InternalAvatar
        className="notification-avatar-button__avatar"
        firstName={firstName}
        imageSrc={imageSrc}
        lastName={lastName}
      />
      {unreadCount > 0 ? (
        <span className="notification-avatar-button__count">
          {unreadCount > 99 ? '99+' : accessibleCount}
        </span>
      ) : null}
    </button>
  );
}
