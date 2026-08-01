import { formatIsoDate } from '../utils/date';
import type { DailyAutonomyPoint } from '../utils/progressStatistics';

export function AutonomyLineChart({
  ariaLabel,
  series,
}: {
  ariaLabel: string;
  series: DailyAutonomyPoint[];
}) {
  if (!series.length) return null;

  const width = 330;
  const height = 255;
  const left = 44;
  const right = 14;
  const top = 16;
  const bottom = 43;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const baselineY = height - bottom;
  const points = series.map((point, index) => ({
    ...point,
    x:
      series.length === 1
        ? left + chartWidth / 2
        : left + (chartWidth * index) / (series.length - 1),
    y: top + chartHeight - (point.score / 100) * chartHeight,
  }));
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  const currentScore = lastPoint.score;
  const areaPath =
    points.length > 1
      ? `M ${firstPoint.x} ${baselineY} L ${points
          .map((point) => `${point.x} ${point.y}`)
          .join(' L ')} L ${lastPoint.x} ${baselineY} Z`
      : null;

  return (
    <div aria-label={ariaLabel} className="progress-line-chart" role="img">
      <div className="progress-line-chart__summary">
        <strong>{currentScore} %</strong>
        <span>Score actuel</span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient
            id="progress-autonomy-area-gradient"
            x1="0"
            x2="0"
            y1="0"
            y2="1"
          >
            <stop offset="0%" stopColor="#16b8cf" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#16b8cf" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[100, 75, 50, 25, 0].map((value) => {
          const y = top + chartHeight - (value / 100) * chartHeight;

          return (
            <g key={value}>
              <line
                className="progress-line-chart__grid"
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
              />
              <text className="progress-line-chart__axis-label" x={4} y={y + 4}>
                {value}%
              </text>
            </g>
          );
        })}

        <line
          className="progress-line-chart__axis"
          x1={left}
          x2={left}
          y1={top}
          y2={baselineY}
        />
        <line
          className="progress-line-chart__axis"
          x1={left}
          x2={width - right}
          y1={baselineY}
          y2={baselineY}
        />

        {areaPath ? <path className="progress-line-chart__area" d={areaPath} /> : null}

        {points.length > 1 ? (
          <polyline
            className="progress-line-chart__line"
            fill="none"
            points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          />
        ) : null}

        {points.map((point, index) => (
          <g key={point.id}>
            {index === 0 || index === points.length - 1 ? (
              <circle
                className="progress-line-chart__point-halo"
                cx={point.x}
                cy={point.y}
                r="8"
              />
            ) : null}
            <circle
              className={`progress-line-chart__point ${
                index === 0 || index === points.length - 1
                  ? 'progress-line-chart__point--edge'
                  : ''
              }`.trim()}
              cx={point.x}
              cy={point.y}
              r={index === 0 || index === points.length - 1 ? 5 : 4.5}
            />
            <text
              className="progress-line-chart__point-value"
              x={point.x}
              y={Math.max(point.y - 12, 10)}
            >
              {point.score}%
            </text>
          </g>
        ))}

        {points.length === 1 ? (
          <text
            className="progress-line-chart__date-label"
            x={firstPoint.x}
            y={height - 10}
          >
            {formatIsoDate(firstPoint.date)}
          </text>
        ) : (
          <>
            <text
              className="progress-line-chart__date-label progress-line-chart__date-label--first"
              x={firstPoint.x}
              y={height - 10}
            >
              {formatIsoDate(firstPoint.date)}
            </text>
            <text
              className="progress-line-chart__date-label progress-line-chart__date-label--last"
              x={lastPoint.x}
              y={height - 10}
            >
              {formatIsoDate(lastPoint.date)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
