type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  className?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit';
};

export function PrimaryButton({
  label,
  onPress,
  className,
  disabled = false,
  variant = 'primary',
  type = 'button',
}: PrimaryButtonProps) {
  return (
    <button
      className={['app-button', `app-button--${variant}`, className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled}
      onClick={onPress}
      type={type}
    >
      {label}
    </button>
  );
}
