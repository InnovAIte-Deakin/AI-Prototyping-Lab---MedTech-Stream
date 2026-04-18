import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { DoctorSummaryDocument } from '../../../../components/DoctorSummaryDocument';

describe('DoctorSummaryDocument — FR13', () => {
  const baseProps = {
    reportTitle: 'Annual Blood Panel',
    reportDate: '2026-04-05',
    patientName: 'Jane Doe',
    flaggedFindings: [
      { test_name: 'Glucose', value: '130', unit: 'mg/dL', flag: 'high', reference_range: '70-100' },
      { test_name: 'Hemoglobin', value: '10.2', unit: 'g/dL', flag: 'low', reference_range: '12-17' },
    ],
    allFindings: [
      { test_name: 'Glucose', value: '130', unit: 'mg/dL', flag: 'high', reference_range: '70-100' },
      { test_name: 'Hemoglobin', value: '10.2', unit: 'g/dL', flag: 'low', reference_range: '12-17' },
      { test_name: 'Sodium', value: '138', unit: 'mEq/L', flag: 'normal', reference_range: '135-145' },
    ],
    interpretationSummary: 'Elevated glucose may indicate pre-diabetes. Low hemoglobin is consistent with mild anemia.',
    trendNotes: 'Glucose trending up over last 3 visits.',
    threads: [
      {
        title: 'Blood sugar questions',
        patientQuestions: [
          'What does high glucose mean for me?',
          'Should I change my diet?',
        ],
      },
    ],
  };

  it('renders the report title and patient name', () => {
    render(<DoctorSummaryDocument {...baseProps} />);
    expect(screen.getByText('Annual Blood Panel')).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
  });

  it('renders flagged findings in the table', () => {
    render(<DoctorSummaryDocument {...baseProps} />);
    expect(screen.getByText('Glucose')).toBeInTheDocument();
    expect(screen.getByText('Hemoglobin')).toBeInTheDocument();
    expect(screen.getByText('HIGH')).toBeInTheDocument();
    expect(screen.getByText('LOW')).toBeInTheDocument();
  });

  it('renders the AI interpretation summary', () => {
    render(<DoctorSummaryDocument {...baseProps} />);
    expect(screen.getByText(/Elevated glucose may indicate pre-diabetes/)).toBeInTheDocument();
  });

  it('renders trend notes when provided', () => {
    render(<DoctorSummaryDocument {...baseProps} />);
    expect(screen.getByText(/Glucose trending up over last 3 visits/)).toBeInTheDocument();
  });

  it('renders patient questions from threads', () => {
    render(<DoctorSummaryDocument {...baseProps} />);
    expect(screen.getByText('What does high glucose mean for me?')).toBeInTheDocument();
    expect(screen.getByText('Should I change my diet?')).toBeInTheDocument();
  });

  it('renders normal findings grid', () => {
    render(<DoctorSummaryDocument {...baseProps} />);
    expect(screen.getByText(/Sodium/)).toBeInTheDocument();
  });

  it('renders without crashing when no interpretation or threads given', () => {
    render(
      <DoctorSummaryDocument
        reportTitle="Minimal"
        reportDate="2026-01-01"
        patientName="John"
        flaggedFindings={[]}
        allFindings={[]}
        threads={[]}
      />
    );
    expect(screen.getByText('Minimal')).toBeInTheDocument();
  });
});
