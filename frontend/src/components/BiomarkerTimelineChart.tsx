'use client';

import { useMemo, useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  TimeScale,
  Tooltip,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

import type { ReportHistoryEntry } from '@/lib/reportHistory';
import { buildBiomarkerTimeline } from '@/lib/reportTimeline';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, TimeScale, Filler, Tooltip, Legend, annotationPlugin);

export function BiomarkerTimelineChart({ reports }: { reports: ReportHistoryEntry[] }) {
  const [selectedBiomarkerKey, setSelectedBiomarkerKey] = useState('');

  const timeline = useMemo(() => buildBiomarkerTimeline(reports), [reports]);

  const chartSpanYears = useMemo(() => {
    if (timeline.reportDates.length < 2) return 0;
    const min = Math.min(...timeline.reportDates);
    const max = Math.max(...timeline.reportDates);
    return (max - min) / (365.25 * 24 * 60 * 60 * 1000);
  }, [timeline.reportDates]);

  const timeUnit = chartSpanYears > 2 ? 'year' : 'month';

  const activeSeries = useMemo(() => {
    if (timeline.series.length === 0) return [];
    const chosen = timeline.series.find((item) => item.biomarkerKey === selectedBiomarkerKey);
    return [chosen ?? timeline.series[0]];
  }, [selectedBiomarkerKey, timeline.series]);

  const selectedSeries = activeSeries[0] ?? null;
  const visibleCount = activeSeries.length;

  const activeReportDates = timeline.reportDates;

  const chartData: ChartData<'line'> = {
    datasets: activeSeries.map((series) => ({
      label: series.displayName,
      data: series.points,
      borderColor: series.color,
      backgroundColor: series.color,
      pointBackgroundColor: (ctx) => {
        const raw = ctx.raw as any;
        if (!raw || raw.y === null || raw.y === undefined) return 'transparent';
        const low = series.referenceRangeLow;
        const high = series.referenceRangeHigh;
        const isOutOfRange = typeof raw.y === 'number' && ((typeof low === 'number' && raw.y < low) || (typeof high === 'number' && raw.y > high) || raw.flag === 'low' || raw.flag === 'high' || raw.flag === 'abnormal');
        return isOutOfRange ? '#ef4444' : series.color;
      },
      pointBorderColor: (ctx) => {
        const raw = ctx.raw as any;
        if (!raw || raw.y === null || raw.y === undefined) return 'transparent';
        return '#ffffff';
      },
      pointRadius: 4,
      pointHoverRadius: 6,
      pointBorderWidth: 2,
      tension: 0.35,
      fill: false,
      spanGaps: false,
      borderWidth: 2,
      parsing: false,
    })),
  };

  const annotations: any = {};
  if (visibleCount === 1) {
    const series = activeSeries[0];
    if (typeof series.referenceRangeLow === 'number' && typeof series.referenceRangeHigh === 'number') {
      annotations.referenceBand = {
        type: 'box',
        xMin: activeReportDates[0],
        xMax: activeReportDates[activeReportDates.length - 1],
        yMin: series.referenceRangeLow,
        yMax: series.referenceRangeHigh,
        backgroundColor: 'rgba(40, 167, 69, 0.10)',
        borderWidth: 0,
      };
    }
  }

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'x',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      annotation: { annotations: annotations as any },
      tooltip: {
        backgroundColor: '#ffffff',
        borderColor: '#e5e7eb',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 10,
        titleColor: '#111827',
        bodyColor: '#111827',
        titleFont: { size: 13, weight: 600 },
        bodyFont: { size: 13 },
        boxPadding: 4,
        usePointStyle: true,
        callbacks: {
          title(items) {
            const raw = items[0]?.raw as any;
            const value = raw?.x ?? raw?.reportDate ?? null;
            if (!value) return '';
            return new Intl.DateTimeFormat(undefined, {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            }).format(new Date(value));
          },
          label(context) {
            const raw = context.raw as any;
            if (!raw || raw.y === null || raw.y === undefined) return '';
            const point = raw;
            const unit = point.unit ? ` ${point.unit}` : '';
            const ref = point.referenceRangeText ? ` • Ref ${point.referenceRangeText}` : '';
            const matchingSeries = activeSeries.find((item) => item.displayName === context.dataset.label);
            const outOfRangeHigh = matchingSeries && typeof matchingSeries.referenceRangeHigh === 'number' && typeof point.y === 'number' && point.y > matchingSeries.referenceRangeHigh;
            const outOfRangeLow = matchingSeries && typeof matchingSeries.referenceRangeLow === 'number' && typeof point.y === 'number' && point.y < matchingSeries.referenceRangeLow;
            let flag = '';
            if (point.flag === 'high' || point.flag === 'abnormal' || outOfRangeHigh) {
              flag = ' • ↑ High';
            } else if (point.flag === 'low' || outOfRangeLow) {
              flag = ' • ↓ Low';
            }
            return `${context.dataset.label}: ${point.y}${unit}${flag}${ref}`;
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: timeUnit,
          tooltipFormat: 'dd MMM yyyy',
          displayFormats: {
            month: 'dd MMM yyyy',
            year: 'yyyy',
          },
        },
        ticks: {
          source: 'data',
          autoSkip: false,
          color: '#6b7280',
          font: { size: 12 },
          maxRotation: 35,
          minRotation: 35,
        },
        title: {
          display: true,
          text: 'Report date (lab test date)',
          color: '#6b7280',
          font: { size: 12 },
        },
        grid: {
          display: false,
        },
        border: {
          display: false,
        },
      },
      y: {
        title: {
          display: true,
          text: 'Value',
          color: '#6b7280',
          font: { size: 12 },
        },
        ticks: {
          color: '#6b7280',
          font: { size: 12 },
        },
        grid: {
          color: '#f0f0f0',
          lineWidth: 0.5,
        },
        border: {
          display: false,
        },
      },
    },
  };

  if (reports.length < 2) {
    return (
      <div className="biomarker-timeline-empty">
        Upload at least 2 reports to see biomarker trends over time.
      </div>
    );
  }

  return (
    <div className="biomarker-timeline-card">
      <div className="biomarker-timeline-toolbar">
        <div className="field biomarker-timeline-filter">
          <label htmlFor="biomarker-filter">Select biomarker</label>
          <select
            id="biomarker-filter"
            value={selectedSeries?.biomarkerKey ?? selectedBiomarkerKey}
            onChange={(e) => setSelectedBiomarkerKey(e.target.value)}
          >
            {timeline.series.map((series) => (
              <option key={series.biomarkerKey} value={series.biomarkerKey}>
                {series.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {timeline.series.length === 0 ? (
        <div className="biomarker-timeline-empty">
          No biomarkers available for trend visualization.
        </div>
      ) : (
        <div className="biomarker-timeline-shell" role="img" aria-label="Biomarker timeline chart">
          <Line data={chartData} options={options} />
        </div>
      )}
    </div>
  );
}
