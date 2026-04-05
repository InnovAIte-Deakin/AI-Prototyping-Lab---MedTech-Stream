export type TrendDirection = 'improving' | 'stable' | 'worsening';

export type ReportTrendPoint = {
  report_id: string;
  observed_at: string;
  value: number;
  unit: string | null;
  flag: 'low' | 'high' | 'normal' | 'abnormal' | 'unknown';
};

export type BiomarkerTrend = {
  biomarker_key: string;
  display_name: string;
  unit: string | null;
  direction: TrendDirection;
  trend_note: string;
  sparkline: ReportTrendPoint[];
};

export type ReportTrendsResponse = {
  report_id: string;
  subject_user_id: string;
  trends: BiomarkerTrend[];
};

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000';
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

function safeLocalStorageGet(key: string): string | null {
  if (!isBrowser) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getStoredSession(): { accessToken?: string } | null {
  const raw = safeLocalStorageGet('reportx_session');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getAuthToken(): string | null {
  return getStoredSession()?.accessToken ?? null;
}

export async function fetchReportTrends(reportId: string): Promise<ReportTrendsResponse> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('User is not authenticated.');
  }
  if (!reportId?.trim()) {
    throw new Error('reportId is required');
  }

  const response = await fetch(`${BACKEND_URL}/api/v1/reports/${encodeURIComponent(reportId)}/trends`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Unexpected response when fetching report trends: ${response.status} ${errorText}`);
  }
  return response.json();
}
