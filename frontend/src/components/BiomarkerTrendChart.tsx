type ChartPoint = {
  observed_at: string;
  value: number;
};

function formatDateLabel(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  const dt = new Date(timestamp);
  const date = new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(dt);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(dt);
  return `${date}|${time}`;
}

export function BiomarkerTrendChart({
  title,
  points,
  unit,
  observationDates,
  width = 760,
  height = 300,
}: {
  title: string;
  points: ChartPoint[];
  unit: string | null;
  observationDates?: string[];
  width?: number;
  height?: number;
}) {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }

  const sorted = [...points].sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
  const values = sorted.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const valueRange = maxValue - minValue;
  const timestamps = sorted.map((point) => Date.parse(point.observed_at));
  const minTimestamp = Math.min(...timestamps);
  const maxTimestamp = Math.max(...timestamps);
  const timestampRange = Math.max(1, maxTimestamp - minTimestamp);

  const margin = { top: 20, right: 26, bottom: 106, left: 56 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  const xForTimestamp = (timestamp: number) => {
    const normalized = (timestamp - minTimestamp) / timestampRange;
    return margin.left + normalized * chartWidth;
  };

  const path = sorted
    .map((point) => {
      const x = xForTimestamp(Date.parse(point.observed_at));
      const normalized = valueRange === 0 ? 0.5 : (point.value - minValue) / valueRange;
      const y = margin.top + (1 - normalized) * chartHeight;
      return `${point === sorted[0] ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const xAxisDateValues = Array.from(new Set((observationDates?.length ? observationDates : sorted.map((p) => p.observed_at))
    .filter(Boolean)
    .sort((a, b) => Date.parse(a) - Date.parse(b))));

  return (
    <figure style={{ margin: '0.75rem 0 0' }}>
      <figcaption style={{ marginBottom: '0.5rem', fontWeight: 600 }}>{title}</figcaption>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Biomarker trend chart"
      >
        <line x1={margin.left} y1={margin.top + chartHeight} x2={margin.left + chartWidth} y2={margin.top + chartHeight} stroke="currentColor" strokeWidth="1" />
        <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + chartHeight} stroke="currentColor" strokeWidth="1" />

        <path d={path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        <text x={margin.left - 8} y={margin.top + 4} textAnchor="end" fontSize="12">
          {maxValue.toFixed(2)}
        </text>
        <text x={margin.left - 8} y={margin.top + chartHeight + 4} textAnchor="end" fontSize="12">
          {minValue.toFixed(2)}
        </text>

        {xAxisDateValues.map((value) => {
          const tickX = xForTimestamp(Date.parse(value));
          const [datePart, timePart] = formatDateLabel(value).split('|');
          return (
            <g key={value}>
              <line
                x1={tickX}
                y1={margin.top + chartHeight}
                x2={tickX}
                y2={margin.top + chartHeight + 6}
                stroke="currentColor"
                strokeWidth="1"
              />
              <text x={tickX} y={margin.top + chartHeight + 20} textAnchor="middle" fontSize="10">
                <tspan x={tickX} dy="0">{datePart}</tspan>
                <tspan x={tickX} dy="12">{timePart || ''}</tspan>
              </text>
            </g>
          );
        })}

        <text x={margin.left + chartWidth / 2} y={height - 6} textAnchor="middle" fontSize="12">
          X-axis: Observation date
        </text>
        <text x={8} y={margin.top + chartHeight / 2} fontSize="12">
          Y-axis: Value {unit ? `(${unit})` : ''}
        </text>
      </svg>
    </figure>
  );
}
