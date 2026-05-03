# T14 — Patient-Facing Pages Redesign

## Overview

Task T14 redesigns all patient-facing screens to match the Figma "Luminous Clarity" specification, building on the design tokens and UI primitives established in T13. The redesign covers four screens: the Home/Upload page, My Reports history, Single Report view, and a new reusable Sharing Preferences panel.

## What Changed

### 1. Home / Upload Page (`src/app/parse/page.tsx`, `styles/parse.css`)

Matches Figma: side-by-side upload layout with hero heading.

- **Hero heading** updated to "Understand Your Lab Results." with blue accent on "Lab Results" (matches home page Figma)
- **Side-by-side input layout**: file upload on the left, paste text on the right, with vertical "OR" divider between them
- **Submit button** renamed to "Process Text Summary" with arrow icon per Figma
- **Results table** redesigned as "Biomarker Analysis" with:
  - Columns: Test Name, Result, Status, Reference Range (matches Figma order)
  - Status badges using T13 Badge component (`Optimal`, `HIGH`, `LOW`)
  - Flagged rows get subtle red background highlight
  - "Download PDF" button in header
- **Feature cards** (Smart Markers, Trend Analysis, Doctor-Ready) shown below upload when no results are displayed

### 2. My Reports History Page (`src/app/reports/page.tsx`)

Matches Figma: trend analysis section, comprehensive report table, and slide-in sharing panel.

- **Header**: "My Report History" with count text "You have N clinical reports available for review."
- **Selected Biomarker dropdown** in top-right corner
- **Biomarker Trend Analysis section** with:
  - Chart card with accent bar title and time period pills (6 Months / 1 Year)
  - Purple "Clinical Insight" card with gradient background
- **Comprehensive Report History** table:
  - Columns: Report Date (with time), Panel/Type (with icon), Test Results (as chips), Interpretation (badge), Actions (eye + share icons)
  - **"General Panel" replaces "Unknown panel"** when panel type is missing
  - Search input for filtering reports
  - Pagination footer (Showing X-Y of Z reports)
- **Mobile fallback list** preserved for responsive design
- **Sharing** now opens the new `SharingPreferencesPanel` slide-in instead of inline form

### 3. Single Report View (`src/app/reports/[reportId]/page.tsx`)

Matches Figma: two-column layout with clinical summary and intelligence panel.

- **Breadcrumb navigation**: Reports > Report Title
- **Report header**: title, patient info, and action buttons (Share Report + Export PDF) in top-right
- **Clinical Summary card** with:
  - Purple left accent bar (secondary color)
  - "AI Analysis Ready" badge when interpretation is available
  - Summary text from AI interpretation
  - Status indicator cards: "Critical Markers — Normal Range" (green) and "Action Required — N flagged results" (amber)
- **Two-column layout**:
  - **Left column**: Clinical Summary, Lab Results & Biomarkers table, Biomarker Trends, Patient Questions, Audit Log
  - **Right column**: Sharing Preferences sidebar card, Intelligence Panel (wrapping ThreadView)
- **Lab Results & Biomarkers table**:
  - Columns: Biomarker, Result (with unit), Reference Range, Status
  - Badge flags: `HIGH` (red), `LOW` (blue), `OPTIMAL` (green), `ABNORMAL` (amber)
  - Flagged rows highlighted with subtle red background
  - Result values use display typography, flagged values in red
- **Intelligence Panel**: header with icon + "Contextual Analysis Assistant" subtitle, wrapping the existing ThreadView component
- **Sharing sidebar card** with inline controls + "Include Doctor-Ready Summary PDF" checkbox (FR13)
- **Share Report button** also opens the slide-in SharingPreferencesPanel

### 4. Sharing Preferences Panel (`src/components/SharingPreferencesPanel.tsx` — new)

Reusable slide-in side panel matching Figma.

- Slides in from the right with overlay backdrop
- Fields: Clinician Email, Access Scope (Summary only / Full report), Expiry Date
- "Share Report" gradient CTA button
- "Revoke Access" danger button (shown when share is active)
- Security note: "A secure, encrypted link will be sent to the clinician."
- Escape key and overlay click to close
- Used from both My Reports page and Single Report view

### 5. CSS Additions (`src/app/globals.css`)

~500 lines of new CSS classes using T13 design tokens:

| Category | Classes |
|----------|---------|
| Sharing Panel | `.sharing-panel`, `.sharing-panel-overlay`, `.sharing-panel-header`, `.sharing-panel-body`, `.sharing-panel-field`, `.sharing-panel-label` |
| Report History | `.trend-section`, `.trend-chart-card`, `.clinical-insight-card`, `.rh-table`, `.rh-date`, `.rh-panel`, `.rh-result-chips`, `.rh-actions`, `.rh-pagination` |
| Report Detail | `.report-breadcrumb`, `.report-header`, `.clinical-summary-card`, `.ai-badge`, `.status-indicators`, `.report-layout`, `.lab-table`, `.lab-row-flagged` |
| Intelligence Panel | `.intelligence-panel`, `.intelligence-panel-header`, `.intelligence-panel-tabs`, `.chat-message`, `.chat-bubble`, `.chat-input-bar` |
| Questions Card | `.questions-card`, `.questions-card-item`, `.questions-share-btn` |
| Sidebar | `.sharing-sidebar`, `.biomarker-selector`, `.report-details-card` |

### 6. Parse Page CSS (`styles/parse.css`)

- Input methods changed from vertical stack to **side-by-side CSS Grid** (3-column: upload | divider | paste)
- Method divider orientation changed from horizontal to vertical
- Parse header alignment changed from center to left
- Mobile responsive: falls back to single column below 768px

## Design Principles Applied

From `design.md` — "Editorial Clinical Excellence" (continued from T13):

1. **No-Line Rule** — Table row separators use `rgba(195,198,215,0.15)` opacity borders, not solid lines
2. **Tonal Layering** — Cards on surface-container-lowest, table headers on surface-container-low
3. **Ambient Shadows** — All cards use `--shadow-md` with tinted on-surface color
4. **Gradient CTAs** — Share Report button uses `--gradient-primary`, Clinical Insight card uses `--gradient-accent`
5. **Badge Flags** — HIGH/LOW/OPTIMAL/ABNORMAL use the T13 Badge component with semantic color variants
6. **Ghost Borders** — Input fields and table cells use outline-variant at reduced opacity
7. **Slide-in Panels** — Sharing panel uses `backdrop-filter: blur(4px)` overlay per glassmorphism spec

## Tests

28 new tests across 3 test files, written TDD-style:

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `SharingPreferencesPanel.test.tsx` | 15 | Open/close, overlay click, Escape key, all form fields, share/revoke buttons, security note |
| `T14ReportsRedesign.test.tsx` | 6 | General Panel label, actual panel name, interpretation badge, sharing panel open, report count, section heading |
| `T14ReportDetail.test.tsx` | 7 | HIGH/LOW badge rendering, Clinical Summary heading, Export PDF button, Share Report button, Lab Results heading, breadcrumb |

### Test Results

| Metric | Before T14 | After T14 |
|--------|-----------|-----------|
| Passing | 69 | 105 |
| New tests | — | +28 |
| Regressions | — | 0 |

Pre-existing failures (not caused by T14):
- `DoctorSummary.test.tsx` — import/transform error
- `ThreadsFlow.test.tsx` — import/transform error
- `ParseFlow.test.tsx` — import/transform error
- `ReportsFlow.test.tsx` (3 tests) — mock setup issues (pre-existing, mocks updated to handle new API endpoints)

## Files Changed

### Modified
- `src/app/globals.css` — Added ~500 lines of T14 CSS classes
- `src/app/parse/page.tsx` — Redesigned hero, side-by-side upload, Biomarker Analysis table with Badge flags, feature cards
- `src/app/reports/page.tsx` — Redesigned with trend section, clinical insight card, comprehensive table, sharing panel
- `src/app/reports/[reportId]/page.tsx` — Two-column layout, breadcrumb, clinical summary, lab table with badges, intelligence panel
- `src/app/reports/__tests__/ReportsFlow.test.tsx` — Updated mocks to handle /threads, /audit, /question-prompts endpoints
- `styles/parse.css` — Side-by-side grid layout, vertical divider, left-aligned header

### Created
- `src/components/SharingPreferencesPanel.tsx`
- `src/components/__tests__/SharingPreferencesPanel.test.tsx`
- `src/app/reports/__tests__/T14ReportsRedesign.test.tsx`
- `src/app/reports/__tests__/T14ReportDetail.test.tsx`

## How to Use

### Using the Sharing Panel
```tsx
import { SharingPreferencesPanel } from '@/components/SharingPreferencesPanel';

<SharingPreferencesPanel
  open={isPanelOpen}
  onClose={() => setIsPanelOpen(false)}
  onShare={handleShare}
  onRevoke={handleRevoke}
  clinicianEmail={email}
  onClinicianEmailChange={(e) => setEmail(e.target.value)}
  scope={scope}
  onScopeChange={(e) => setScope(e.target.value)}
  expiresAt={expiresAt}
  onExpiresAtChange={(e) => setExpiresAt(new Date(e.target.value).getTime())}
  shareActive={isActive}
  statusMessage={statusMsg}
/>
```

### Using flag badges in tables
```tsx
import { Badge } from '@/components/ui/Badge';

// Map flag to badge variant
const variant = flag === 'high' ? 'high' : flag === 'low' ? 'low' : 'optimal';
const label = flag === 'normal' || !flag ? 'OPTIMAL' : flag.toUpperCase();

<Badge variant={variant}>{label}</Badge>
```

### Panel name resolution
```tsx
// "General Panel" is shown when panel type is unknown
function resolvePanelShortName(entry: ReportHistoryEntry): string {
  const explicit = entry.panelName?.trim();
  if (explicit) return explicit;
  const fromTitle = entry.title?.match(/\b(LFT|KFT|FBC|CBC|BMP|CMP|LIPID|TFT)\b/i)?.[1];
  if (fromTitle) return fromTitle.toUpperCase();
  return 'General Panel';
}
```
