import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BiomarkerTrendChart } from '../BiomarkerTrendChart';

describe('BiomarkerTrendChart', () => {
  it('renders chart with x and y axis annotations', () => {
    render(
      <BiomarkerTrendChart
        title="ALT"
        unit="U/L"
        points={[
          { observed_at: '2026-01-01T00:00:00Z', value: 21 },
          { observed_at: '2026-02-01T00:00:00Z', value: 35 },
          { observed_at: '2026-03-01T00:00:00Z', value: 29 },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: /biomarker trend chart/i })).toBeInTheDocument();
    expect(screen.getByText(/x-axis: observation date/i)).toBeInTheDocument();
    expect(screen.getByText(/y-axis: value/i)).toBeInTheDocument();
  });

  it('returns null for single observation', () => {
    const { container } = render(
      <BiomarkerTrendChart
        title="ALT"
        unit="U/L"
        points={[{ observed_at: '2026-01-01T00:00:00Z', value: 21 }]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
