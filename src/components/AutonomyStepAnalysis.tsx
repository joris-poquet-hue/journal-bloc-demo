import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';

export type AutonomyRadarPoint = {
  id: string;
  label: string;
  score: number;
};

type AutonomyStepAnalysisProps = {
  children: ReactNode;
  points: AutonomyRadarPoint[];
};

type RadarCoordinate = AutonomyRadarPoint & {
  x: number;
  y: number;
};

type StepAnalysisView = 'radar' | 'list';

const RADAR_LEVELS = [1, 2, 3, 4] as const;
const RADAR_START_ANGLE = -Math.PI / 2;

function getRadarPoint(
  centerX: number,
  centerY: number,
  radius: number,
  angle: number
) {
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

function formatSvgPoints(points: Array<{ x: number; y: number }>) {
  return points
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(' ');
}

function AutonomyRadarChart({ points }: { points: AutonomyRadarPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [containerWidth, setContainerWidth] = useState(0);
  const [activePointId, setActivePointId] = useState<string | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.round(container.getBoundingClientRect().width);

      setContainerWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth
      );
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);

      return () => window.removeEventListener('resize', updateWidth);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  const chart = useMemo(() => {
    const width = Math.max(containerWidth, 300);
    const height = Math.min(520, Math.max(340, width * 0.94));
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width * 0.39, height * 0.39, 205);
    const angleStep = (Math.PI * 2) / points.length;
    const axes = points.map((point, index) => ({
      ...getRadarPoint(
        centerX,
        centerY,
        radius,
        RADAR_START_ANGLE + index * angleStep
      ),
      id: point.id,
    }));
    const rings = RADAR_LEVELS.map((level) => ({
      level,
      points: points.map((_, index) =>
        getRadarPoint(
          centerX,
          centerY,
          radius * (level / 4),
          RADAR_START_ANGLE + index * angleStep
        )
      ),
    }));
    const values: RadarCoordinate[] = points.map((point, index) => ({
      ...point,
      ...getRadarPoint(
        centerX,
        centerY,
        radius * (Math.max(0, Math.min(point.score, 100)) / 100),
        RADAR_START_ANGLE + index * angleStep
      ),
    }));

    return { axes, centerX, centerY, height, radius, rings, values, width };
  }, [containerWidth, points]);

  const activePoint = chart.values.find((point) => point.id === activePointId);
  const tooltipHalfWidth = Math.min(140, chart.width / 2 - 12);
  const tooltipLeft = activePoint
    ? Math.max(
        tooltipHalfWidth,
        Math.min(chart.width - tooltipHalfWidth, activePoint.x)
      )
    : 0;
  const tooltipStyle = activePoint
    ? ({
        '--autonomy-radar-tooltip-left': `${tooltipLeft}px`,
        '--autonomy-radar-tooltip-top': `${activePoint.y}px`,
      } as CSSProperties)
    : undefined;
  const tooltipPlacement = activePoint && activePoint.y < 82 ? 'bottom' : 'top';

  function handlePointKeyDown(
    event: KeyboardEvent<SVGCircleElement>,
    pointId: string
  ) {
    if (event.key === 'Escape') {
      setActivePointId(null);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setActivePointId((currentPointId) =>
        currentPointId === pointId ? null : pointId
      );
    }
  }

  return (
    <div className="autonomy-radar-chart" ref={containerRef}>
      <svg
        aria-labelledby={`${titleId} ${descriptionId}`}
        height={chart.height}
        role="group"
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        width={chart.width}
        xmlns="http://www.w3.org/2000/svg"
      >
        <title id={titleId}>Autonomie par étape opératoire</title>
        <desc id={descriptionId}>
          Chaque axe représente une étape distincte. L’échelle va de 1 à 4,
          avec le niveau 0 au centre.
        </desc>

        {chart.rings.map((ring) => (
          <g aria-hidden="true" key={ring.level}>
            <polygon
              className={`autonomy-radar-chart__ring autonomy-radar-chart__ring--${ring.level}`}
              points={formatSvgPoints(ring.points)}
            />
            <text
              className="autonomy-radar-chart__scale-label"
              x={chart.centerX + 9}
              y={chart.centerY - chart.radius * (ring.level / 4) + 4}
            >
              {ring.level}
            </text>
          </g>
        ))}

        {chart.axes.map((axis) => (
          <line
            aria-hidden="true"
            className="autonomy-radar-chart__axis"
            key={axis.id}
            x1={chart.centerX}
            x2={axis.x}
            y1={chart.centerY}
            y2={axis.y}
          />
        ))}

        <polygon
          aria-hidden="true"
          className="autonomy-radar-chart__area"
          points={formatSvgPoints(chart.values)}
        />

        {chart.values.map((point) => (
          <g key={point.id}>
            <circle
              aria-hidden="true"
              className={`autonomy-radar-chart__point${
                activePointId === point.id
                  ? ' autonomy-radar-chart__point--active'
                  : ''
              }`}
              cx={point.x}
              cy={point.y}
              r={activePointId === point.id ? 8 : 6}
            />
            <circle
              aria-label={`Afficher l’étape opératoire : ${point.label}`}
              aria-pressed={activePointId === point.id}
              className="autonomy-radar-chart__hit-area"
              cx={point.x}
              cy={point.y}
              onBlur={() => setActivePointId(null)}
              onFocus={() => setActivePointId(point.id)}
              onKeyDown={(event) => handlePointKeyDown(event, point.id)}
              onPointerDown={(event) => {
                if (event.pointerType === 'mouse') {
                  return;
                }

                event.preventDefault();
                setActivePointId((currentPointId) =>
                  currentPointId === point.id ? null : point.id
                );
              }}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') {
                  setActivePointId(point.id);
                }
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === 'mouse') {
                  setActivePointId(null);
                }
              }}
              r="22"
              role="button"
              tabIndex={0}
            />
          </g>
        ))}
      </svg>

      {activePoint ? (
        <div
          className={`autonomy-radar-chart__tooltip autonomy-radar-chart__tooltip--${tooltipPlacement}`}
          role="tooltip"
          style={tooltipStyle}
        >
          {activePoint.label}
        </div>
      ) : null}

      <p className="autonomy-radar-chart__hint">
        Survolez un point pour afficher l’étape opératoire.
      </p>
    </div>
  );
}

export function AutonomyStepAnalysis({
  children,
  points,
}: AutonomyStepAnalysisProps) {
  const [view, setView] = useState<StepAnalysisView>('radar');
  const canRenderRadar = points.length >= 3;
  const activeView = canRenderRadar ? view : 'list';

  return (
    <div className="autonomy-step-analysis" data-testid="autonomy-step-analysis">
      <div
        aria-label="Affichage de l’analyse par étape"
        className="autonomy-step-analysis__tabs"
        role="group"
      >
        <button
          aria-pressed={activeView === 'radar'}
          className={
            activeView === 'radar'
              ? 'autonomy-step-analysis__tab autonomy-step-analysis__tab--active'
              : 'autonomy-step-analysis__tab'
          }
          disabled={!canRenderRadar}
          onClick={() => setView('radar')}
          type="button"
        >
          Radar
        </button>
        <button
          aria-pressed={activeView === 'list'}
          className={
            activeView === 'list'
              ? 'autonomy-step-analysis__tab autonomy-step-analysis__tab--active'
              : 'autonomy-step-analysis__tab'
          }
          onClick={() => setView('list')}
          type="button"
        >
          Liste
        </button>
      </div>

      {activeView === 'radar' ? (
        <div>
          <AutonomyRadarChart points={points} />
        </div>
      ) : (
        <div className="autonomy-step-analysis__list-panel">
          {children}
        </div>
      )}
    </div>
  );
}
