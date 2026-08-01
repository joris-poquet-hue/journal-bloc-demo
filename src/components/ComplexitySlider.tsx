import { useId, type CSSProperties } from 'react';

import { defaultComplexityRating } from '../data/mockData';
import { Complexity } from '../types';

type ComplexitySliderProps = {
  value: Complexity | null;
  onChange: (value: Complexity) => void;
};

function getSafeValue(value: Complexity | null) {
  return value ?? defaultComplexityRating;
}

export function ComplexitySlider({
  value,
  onChange,
}: ComplexitySliderProps) {
  const inputId = useId();
  const safeValue = getSafeValue(value);
  const progress = ((safeValue - 1) / 9) * 100;
  const thumbOffset = 14 - (progress / 100) * 28;
  const sliderStyle = {
    '--difficulty-progress': `calc(${progress}% + ${thumbOffset}px)`,
  } as CSSProperties;

  return (
    <div className="complexity-slider">
      <div className="complexity-slider__control" style={sliderStyle}>
        <output
          className="complexity-slider__value"
          htmlFor={inputId}
        >
          {safeValue} / 10
        </output>
        <input
          aria-label="Difficulté ressentie de l’intervention"
          className="complexity-slider__input"
          id={inputId}
          max={10}
          min={1}
          onChange={(event) =>
            onChange(Number(event.target.value) as Complexity)
          }
          step={1}
          type="range"
          value={safeValue}
        />
      </div>
    </div>
  );
}
