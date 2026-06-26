import type { CSSProperties } from 'react';

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
  const safeValue = getSafeValue(value);
  const progress = Math.max(8, ((safeValue - 1) / 9) * 100);
  const sliderStyle = {
    '--difficulty-progress': `${progress}%`,
  } as CSSProperties;

  return (
    <div className="complexity-slider">
      <div className="complexity-slider__value">
        Difficulté ressentie : <strong>{safeValue} / 10</strong>
      </div>
      <input
        aria-label="Difficulté ressentie de l’intervention"
        className="complexity-slider__input"
        max={10}
        min={1}
        onChange={(event) =>
          onChange(Number(event.target.value) as Complexity)
        }
        style={sliderStyle}
        step={1}
        type="range"
        value={safeValue}
      />
      <div className="complexity-slider__scale" aria-hidden="true">
        <span>1</span>
        <span>10</span>
      </div>
    </div>
  );
}
