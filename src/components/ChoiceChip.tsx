type ChoiceChipProps = {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  compact?: boolean;
};

export function ChoiceChip({
  label,
  description,
  selected,
  onPress,
  compact = false,
}: ChoiceChipProps) {
  return (
    <button
      className={`choice-chip ${selected ? 'choice-chip--selected' : ''} ${
        compact ? 'choice-chip--compact' : ''
      }`}
      onClick={onPress}
      type="button"
    >
      <span className="choice-chip__label">{label}</span>
      {description ? (
        <span className="choice-chip__description">{description}</span>
      ) : null}
    </button>
  );
}
