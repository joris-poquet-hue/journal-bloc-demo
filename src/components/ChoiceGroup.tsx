import { ChoiceOption } from '../types';
import { ChoiceChip } from './ChoiceChip';
import { SectionCard } from './SectionCard';

type ChoiceGroupProps<T extends string> = {
  title: string;
  description?: string;
  options: ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  columns?: 1 | 2 | 3;
};

export function ChoiceGroup<T extends string>({
  title,
  description,
  options,
  value,
  onChange,
  columns = 2,
}: ChoiceGroupProps<T>) {
  const gridClassName =
    columns === 1
      ? 'choice-grid--single'
      : columns === 3
        ? 'choice-grid--triple'
        : 'choice-grid--double';

  return (
    <SectionCard description={description} title={title}>
      <div className={`choice-grid ${gridClassName}`}>
        {options.map((option) => (
          <ChoiceChip
            key={option.value}
            description={option.description}
            label={option.label}
            onPress={() => onChange(option.value)}
            selected={value === option.value}
          />
        ))}
      </div>
    </SectionCard>
  );
}
