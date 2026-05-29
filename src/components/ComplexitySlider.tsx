import { complexityOptions } from '../data/mockData';
import { Complexity } from '../types';

type ComplexitySliderProps = {
  value: Complexity | null;
  onChange: (value: Complexity) => void;
};

const complexityOrder: Complexity[] = ['simple', 'intermediaire', 'difficile'];

export function ComplexitySlider({
  value,
  onChange,
}: ComplexitySliderProps) {
  const selectedIndex = value ? complexityOrder.indexOf(value) : 0;
  const safeIndex = selectedIndex >= 0 ? selectedIndex : 0;

  return (
    <div className="complexity-slider">
      <input
        aria-label="Difficulté de l’intervention"
        className="complexity-slider__input"
        max={2}
        min={0}
        onChange={(event) =>
          onChange(complexityOrder[Number(event.target.value)])
        }
        step={1}
        type="range"
        value={safeIndex}
      />
      <div className="complexity-slider__labels">
        {complexityOptions.map((option) => (
          <button
            key={option.value}
            className={`complexity-slider__label ${
              value === option.value ? 'complexity-slider__label--active' : ''
            }`}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
