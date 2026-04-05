type SparklinePoint = {
  observed_at: string;
  value: number;
};

function toNumber(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

export function Sparkline({
  points,
  width = 180,
  height = 44,
  strokeWidth = 2,
}: {
  points: SparklinePoint[];
  width?: number;
  height?: number;
  strokeWidth?: number;
}) {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }

  const sorted = [...points].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  const values = sorted.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = strokeWidth;
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;
  const valueRange = max - min;

  const d = sorted
    .map((point, idx) => {
      const x = pad + (idx / (sorted.length - 1)) * innerWidth;
      const normalized = valueRange === 0 ? 0.5 : (point.value - min) / valueRange;
      const y = pad + (1 - normalized) * innerHeight;
      return `${idx === 0 ? 'M' : 'L'} ${toNumber(x, 0).toFixed(2)} ${toNumber(y, 0).toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Biomarker trend sparkline"
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
