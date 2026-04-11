# FR9 Consent Sharing Gap-Closure Design

Date: 2026-04-10
Branch: backend/consent-sharing
Status: Proposed

## 1. Purpose

This design closes remaining FR9 behavior gaps after the consent-sharing stabilization pass.

Target FR9 outcomes:
- Patients create scoped, expiring shares by specifying clinician, scope, and expiry.
- Revocation and expiry immediately remove access.
- Share, view, revoke, and expiry actions generate timestamped audit events.
- Post-revocation and post-expiry access is denied with clear messages.
- Authenticated clinicians can list actively shared reports with full report details and patient profile details, respecting active share scope.

## 2. Current Gaps

1. View audit events are missing for shared-report access.
2. Clinician shared-report listing excludes patient-scope shares (`scope=patient`) with no direct `report_id` link.
3. Startup migration execution uses shell-level `alembic`, which can resolve outside the active Python environment.

## 3. Scope and Non-Goals

In scope:
- Backend behavior and tests for view auditing.
- Backend behavior and tests for patient-scope expansion in clinician listing.
- Backend startup migration invocation reliability.

Out of scope:
- UI changes.
- Schema redesign beyond additive, minimal migration-safe adjustments.
- Non-FR9 features.

## 4. Approaches Considered

## Approach A (Recommended): Targeted FR9 Gap Closure

- Add report view audit creation when a non-owner accesses a report through active share.
- Expand clinician shared-reports service to include all reports for active patient-scope shares.
- Run alembic via the active interpreter (`python -m alembic`) to remove PATH coupling.
- Add targeted service/API tests for new view-audit and patient-scope listing behavior.

Trade-offs:
- Minimal change surface.
- Preserves current architecture and contracts.
- Requires careful duplicate handling when patient- and report-scope shares coexist.

## Approach B: Domain Module Refactor First

- Move consent and audit orchestration into a dedicated consent domain package, then implement gap fixes.

Trade-offs:
- Cleaner long-term boundaries.
- Higher risk and scope for current FR9 closure.
- Slower delivery.

## Approach C: Event-Layer Abstraction First

- Introduce centralized audit event publisher with event enums before any behavior fixes.

Trade-offs:
- Better consistency and future extensibility.
- Extra abstraction overhead now.
- Not required to satisfy FR9 immediately.

## Recommendation

Choose Approach A.

Reasoning: It directly satisfies FR9 gaps with low risk and minimal architecture churn.

## 5. Design Decisions

### 5.1 View Event Definition

A `view` audit event is created when an authenticated non-owner successfully accesses a report via an active share (report-scope or patient-scope).

Not included as `view` events:
- Owner viewing own report.
- Listing shared reports endpoint calls.

Audit record shape:
- `resource_type = "consent_share"`
- `action = "view"`
- `resource_id = <matching active share id>`
- `actor_user_id = clinician user id`
- `subject_user_id = clinician user id`
- `occurred_at = current UTC`
- context includes at least: `report_id`, `scope`, `access_level`

### 5.2 Patient-Scope Listing Expansion

For an active patient-scope share (`scope=patient`, `report_id IS NULL`), clinician shared-reports listing returns all currently active reports owned by that patient.

Behavior details:
- Each returned row still includes report details + patient profile.
- Dedupe by `report_id` when both patient-scope and report-scope shares grant access.
- Precedence rule for duplicate grants:
  - If both scopes exist for same report, prefer report-scope share metadata for that report row.

### 5.3 Migration Invocation Reliability

Startup migration process in app lifespan must use the active Python interpreter to avoid external PATH dependency.

Decision:
- Replace shell command `alembic upgrade head` with `python -m alembic upgrade head` (using `sys.executable`).

### 5.4 Error and Access Semantics

Retain existing clear denial messages:
- Revoked: `Access has been revoked`
- Expired: `Share has expired`
- Non-clinician listing shared reports: `Only clinicians may view shared reports`

### 5.5 Test-First Strategy

All new behavior changes require tests written first and failing first:
- View-event creation on shared access.
- No view-event creation for owner access.
- Patient-scope listing includes all active patient reports.
- Dedupe and precedence behavior when report- and patient-scope shares overlap.
- Startup migration invocation uses interpreter-based alembic call (unit-level invocation test/mocked subprocess assertion).

## 6. Architecture and Data Flow

### 6.1 Shared Report Access Path

1. Request hits report retrieval dependency.
2. Access grant is evaluated (owner, active share, revoked, expired).
3. If non-owner share access succeeds:
   - create `view` audit event.
   - return report payload.
4. If revoked/expired, deny with existing clear message.

### 6.2 Clinician Listing Path

1. Validate authenticated user role includes clinician.
2. Query active shares for clinician.
3. For report-scope shares: include linked report directly.
4. For patient-scope shares: query active reports for subject patient and include each report.
5. Dedupe by report id with precedence rule.
6. Return report + patient profile rows.

## 7. Testing Plan

Required tests:
- API/integration
  - shared access creates `view` audit event.
  - owner access does not create `view` event.
  - revoked/expired denial remains unchanged.
  - clinician listing includes patient-scope reports.
  - listing dedupes overlap and applies precedence.
- Service-level
  - clinician listing expansion logic for patient-scope shares.
- startup behavior
  - migration subprocess command built with active interpreter.

Regression suites to run:
- consent-sharing subset and audit subset.
- auth/report/audit broader subset.

## 8. Risks and Mitigations

Risk: Excessive audit volume from view events.
- Mitigation: start with per-successful-access events; monitor event volume and add optional throttling later if needed.

Risk: Duplicate listing rows from overlapping shares.
- Mitigation: deterministic dedupe by `report_id` with explicit precedence rule and tests.

Risk: interpreter-based migration command behavior differences.
- Mitigation: unit test command construction and run existing startup-related test paths.

## 9. Definition of Done Mapping

- Patients can create scoped, expiring shares: existing behavior retained and verified.
- Revocation/expiry removes access immediately: existing behavior retained and verified.
- Audit log receives timestamped events quickly and consistently: add `view` event path to complete event set.
- Access after expiry/revocation denied clearly: retained.
- Clinicians retrieve all actively shared reports including patient profile details under active scope: complete via patient-scope expansion.
- Tests cover view/share/revoke/expiry: completed with new view and patient-scope tests.
