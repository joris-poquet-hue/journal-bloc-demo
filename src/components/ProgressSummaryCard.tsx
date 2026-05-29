import { useEffect, useState } from 'react';

import { SectionCard } from './SectionCard';

type ProgressSummaryCardProps = {
  totalInterventions: number;
  primaryOperatorCount: number;
};

type ProgressStatProps = {
  label: string;
  value: number;
};

export function ProgressSummaryCard({
  totalInterventions,
  primaryOperatorCount,
}: ProgressSummaryCardProps) {
  return (
    <SectionCard
      title="Progression"
      description="Ce semestre ..."
    >
      <div className="progress-summary">
        <ProgressStat
          label="Participation au bloc"
          value={totalInterventions}
        />
        <ProgressStat
          label="En tant qu'opérateur principal"
          value={primaryOperatorCount}
        />
      </div>
    </SectionCard>
  );
}

function ProgressStat({ label, value }: ProgressStatProps) {
  const animatedValue = useAnimatedCount(value);

  return (
    <div className="progress-stat">
      <strong className="progress-stat__value">{animatedValue}</strong>
      <span className="progress-stat__label">{label}</span>
    </div>
  );
}

function useAnimatedCount(targetValue: number) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    let frameId = 0;
    const duration = 700;
    const startTime = performance.now();

    const tick = (currentTime: number) => {
      const progress = Math.min((currentTime - startTime) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(targetValue * easedProgress));

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    setDisplayValue(0);
    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [targetValue]);

  return displayValue;
}
