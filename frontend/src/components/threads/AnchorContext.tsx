'use client';

import React from 'react';
import type { FindingAnchor } from './ThreadLauncher';

export function AnchorContext({ finding }: { finding: FindingAnchor }) {
  return (
    <div style={{ position: 'sticky', top: 0, background: 'var(--bg, #fff)', zIndex: 1, paddingBottom: '0.5rem' }}>
      <h3 style={{ margin: 0 }}>{finding.test_name}</h3>
      <p style={{ margin: '0.25rem 0' }}>{finding.value} {finding.unit || ''}</p>
      <p style={{ margin: '0.25rem 0' }}>Reference: {finding.reference_range || 'N/A'}</p>
      <p style={{ margin: '0.25rem 0' }}>Flag: {(finding.flag || 'normal').toUpperCase()}</p>
    </div>
  );
}
