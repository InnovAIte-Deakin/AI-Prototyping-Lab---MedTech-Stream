# T15 — Clinician-Facing Pages Redesign

## Overview

Task T15 designs and builds all clinician-facing pages to match the Figma "Luminous Clarity" specification, building on the design tokens (T13) and UI primitives (T13/T14). This completes the other side of the patient-clinician relationship: while T14 built what patients see, T15 builds what clinicians see when patients share reports with them.

## What Changed

### 1. Clinician Shared Reports Dashboard (`src/app/reports/shared/page.tsx` — redesigned)

Matches design system: clean table layout with patient avatars, scope badges, and clear empty state.

- **Page header**: "Shared Reports" heading with active share count subtitle
- **Reports table** with columns: Patient (avatar + name + email), Report (title), Report Date, Share Scope (badge), Expires, Actions (Open button)
- **Patient avatar**: circular gradient avatar with first initial
- **Scope badges**: "Summary Only" (info), "Full Report" (optimal), "Full Report + Threads" (optimal) using T13 Badge component
- **Focused report highlighting**: when navigated from a notification with `?reportId=`, the row gets a subtle blue highlight
- **Empty state**: centered empty illustration with message "No reports have been shared with you yet" and explanatory text
- **Loading state**: centered spinner animation
- **Error state**: styled error card

### 2. Clinician Scoped Report View (`src/app/reports/shared/[reportId]/page.tsx` — new)

New page for clinicians to view a single shared report, with scope-enforced rendering.

- **Breadcrumb navigation**: Shared Reports > Report Title
- **Patient profile header**: patient avatar (large), report title, patient name, DOB, report date, scope badge, expiry date
- **Clinical Summary card**: always shown, purple accent bar, AI Analysis badge, interpretation text
  - Status indicator cards (normal count + flagged count) — only for full_report scopes
- **Scope enforcement** (visual + server-backed):
  - `summary_only`: shows Clinical Summary only — no findings table, no trends, no threads
  - `full_report`: shows Clinical Summary + Lab Results & Biomarkers table
  - `full_report_with_threads`: shows all of the above + Conversation Threads panel
- **Lab Results & Biomarkers table**: Biomarker, Result (with unit), Reference Range, Status (Badge flags: HIGH/LOW/OPTIMAL/ABNORMAL). Flagged rows highlighted with subtle red background.
- **Doctor Summary section**: conditionally rendered when `include_doctor_summary` is true on the share. Shows interpretation summary and lists flagged biomarkers.
- **Thread panel**: wraps existing ThreadView component, only rendered for `full_report_with_threads` scope
- **Error handling**: share expiry/revocation shows clear message with back-to-dashboard button

### 3. Header Navigation Update (`src/components/Header.tsx`)

- **Clinician role**: shows "Shared Reports" link (→ `/reports/shared`) instead of "My Reports"
- **Patient/other roles**: unchanged, shows "My Reports" link
- **NotificationBell**: already present from T18, now properly integrated with clinician flow

### 4. CSS Additions (`src/app/globals.css`)

~350 lines of new CSS classes using T13 design tokens:

| Category | Classes |
|----------|---------|
| Dashboard | `.clinician-dashboard`, `.clinician-dashboard-header`, `.clinician-dashboard-title`, `.clinician-dashboard-subtitle` |
| Loading/Error/Empty | `.clinician-dashboard-loading`, `.clinician-loading-spinner`, `.clinician-dashboard-error`, `.clinician-dashboard-empty`, `.clinician-empty-icon`, `.clinician-empty-title` |
| Reports Table | `.clinician-reports-table-wrap`, `.clinician-reports-table`, `.clinician-row`, `.clinician-row--focused`, `.clinician-patient-cell`, `.clinician-patient-avatar` |
| Report View | `.clinician-report-view`, `.clinician-report-breadcrumb`, `.clinician-report-header`, `.clinician-report-patient-info` |
| Summary Card | `.clinician-summary-card`, `.clinician-summary-accent`, `.clinician-summary-content`, `.clinician-status-indicators`, `.clinician-status-card` |
| Doctor Summary | `.clinician-doctor-summary-card`, `.clinician-doctor-summary-title`, `.clinician-doctor-flagged` |
| Lab Table | `.clinician-lab-section`, `.clinician-lab-table`, `.clinician-lab-row`, `.clinician-lab-row--flagged`, `.clinician-value-flagged` |
| Threads | `.clinician-threads-section`, `.clinician-threads-heading` |
| Dark Mode | Full dark mode overrides for all T15 surfaces |

### 5. Notifications (verified integration)

The notification system built in T18 is already fully functional:
- **NotificationBell** in nav shows unread count badge (dot indicator with count)
- **NotificationDrawer** opens on click, lists recent notifications with message + timestamp
- **Mark all read** button in drawer
- **Notification routing**: clinician notifications (new_report_shared, share_revoked, etc.) route to `/reports/shared?reportId=...`
- **30-second auto-refresh** of unread count

## Design Principles Applied

From `design.md` — "Editorial Clinical Excellence" (continued from T13/T14):

1. **No-Line Rule** — Table rows separated by `rgba(195,198,215,0.15)` opacity borders
2. **Tonal Layering** — Cards on surface-container-lowest, table headers on surface-container-low
3. **Ambient Shadows** — All cards use `--shadow-md` with tinted on-surface color
4. **Gradient CTAs** — Open button uses primary gradient via Button component
5. **Badge Flags** — Scope labels and biomarker status use T13 Badge component
6. **Purple Accent** — Clinical Summary card uses `--secondary` left accent bar
7. **Soft Tech Corners** — All cards use `--radius-xl` (1.5rem)

## Tests

21 new tests across 3 test files, written TDD-style (failing tests first, then implementation):

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `T15ClinicianDashboard.test.tsx` | 7 | Dashboard heading, patient names, scope badges, Open buttons, empty state, report titles, expiry dates |
| `T15ClinicianReportView.test.tsx` | 8 | Patient header, report title, scope-gated rendering (summary_only hides findings, full_report shows findings, full_report hides threads, full_report_with_threads shows threads), doctor summary conditional |
| `T15Notifications.test.tsx` | 6 | Bell button, unread count badge, no badge at 0, drawer opens on click, notification message in drawer, mark all read button |

### Test Results

| Metric | Before T15 | After T15 |
|--------|-----------|-----------|
| Passing | 150 | 171 |
| Failing | 0 | 0 |
| New tests | — | +21 |
| Regressions | — | 0 |

## Files Changed

### Modified
- `src/app/globals.css` — Added ~350 lines of T15 CSS classes with dark mode
- `src/app/reports/shared/page.tsx` — Complete redesign with design system, scope badges, patient avatars, empty state
- `src/app/reports/shared/__tests__/page.test.tsx` — Updated to match new design (Badge text change)
- `src/components/Header.tsx` — Role-aware nav: "Shared Reports" for clinicians, "My Reports" for patients

### Created
- `src/app/reports/shared/[reportId]/page.tsx` — Clinician scoped report view
- `src/app/reports/__tests__/T15ClinicianDashboard.test.tsx` — Dashboard tests
- `src/app/reports/__tests__/T15ClinicianReportView.test.tsx` — Scoped view tests
- `src/app/reports/__tests__/T15Notifications.test.tsx` — Notification integration tests

## Scope Enforcement

| Scope | Summary | Findings Table | Trends | Threads |
|-------|---------|---------------|--------|---------|
| `summary_only` | Yes | No | No | No |
| `full_report` | Yes | Yes | Yes | No |
| `full_report_with_threads` | Yes | Yes | Yes | Yes |

Frontend scope hiding is backed by server-side enforcement — the backend `/api/v1/reports/shared-reports/{id}` endpoint validates the clinician's access level and only returns data matching the granted scope.
