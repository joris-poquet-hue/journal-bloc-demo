type InternalAvatarProps = {
  firstName: string;
  lastName: string;
  imageSrc?: string | null;
  className: string;
};

function getInitials(firstName: string, lastName: string) {
  return `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase();
}

export function InternalAvatar({
  firstName,
  lastName,
  imageSrc,
  className,
}: InternalAvatarProps) {
  return (
    <span className={`${className} internal-avatar`} aria-hidden="true">
      {imageSrc ? (
        <img
          alt=""
          className="internal-avatar__image"
          src={imageSrc}
        />
      ) : (
        <span className="internal-avatar__initials">
          {getInitials(firstName, lastName)}
        </span>
      )}
    </span>
  );
}
