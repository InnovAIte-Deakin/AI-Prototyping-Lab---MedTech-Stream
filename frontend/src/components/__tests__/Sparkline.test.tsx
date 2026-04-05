import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sparkline } from '../Sparkline';

describe('Sparkline', () => {
  it('renders svg when there are at least two points', () => {
    render(
      <Sparkline
        points={[
          { observed_at: '2026-01-01T00:00:00Z', value: 12.1 },
          { observed_at: '2026-02-01T00:00:00Z', value: 12.8 },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: /biomarker trend sparkline/i })).toBeInTheDocument();
  });

  it('returns null for single-point data', () => {
    const { container } = render(
      <Sparkline points={[{ observed_at: '2026-01-01T00:00:00Z', value: 12.1 }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
