type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  type?: 'button' | 'submit';
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  type = 'button',
}: PrimaryButtonProps) {
  return (
    <button
      className={`app-button app-button--${variant}`}
      disabled={disabled}
      onClick={onPress}
      type={type}
    >
      {label}
    </button>
  );
}
