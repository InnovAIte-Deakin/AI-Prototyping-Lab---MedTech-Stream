# FR9 Consent Sharing Review-Fix Design

Date: 2026-04-10
Branch: backend/consent-sharing
Status: Proposed

## 1. Purpose

This design addresses the remaining issues found during branch review for FR9 consent sharing behavior and coding conventions.

Goals for this fix cycle:
- Eliminate report-audit cross-report leakage for report-specific audit retrieval.
- Improve automatic expiry cleanup timing defaults to better align with FR9 operational latency expectations.
- Preserve existing API contracts and message semantics.
- Keep clinician validation as role-based only (no `is_verified` gate) per product decision.

## 2. Inputs and Constraints

Source findings:
- Report-specific audit retrieval can include unrelated events due to patient-scope share id reuse.
- Default cleanup interval may be too coarse for FR9 timing intent.
- Existing clinician sharing rule is role-only and remains intentional.

Constraints:
- Minimize change surface (Approach 1 selected).
- No schema migration in this cycle.
- No frontend changes.
- No broad refactoring.

## 3. Scope and Non-Goals

In scope:
- `backend/app/services/reports.py`
  - Tighten report-audit filtering logic.
- `backend/app/main.py`
  - Reduce default `CLEANUP_INTERVAL_MINUTES` while preserving env override.
- `backend/tests/test_audit_log_retrieval.py`
  - Strengthen report-isolation assertions for audit events.
- `backend/tests/test_expired_share_cleanup.py`
  - Ensure cleanup behavior remains correct with updated default cadence assumptions.

Out of scope:
- Introducing `is_verified` clinician gate.
- Audit schema redesign.
- New endpoints or response model changes.
- Unrelated cleanup/refactor work.

## 4. Selected Approach

Approach 1: Minimal surgical fixes.

Why:
- Directly resolves the blocking correctness issue.
- Keeps blast radius small and low risk.
- Preserves already stabilized FR9 behavior and contracts.

## 5. Design Details

### 5.1 Report-Scoped Audit Filtering

Problem:
- Filtering by consent share ids alone is insufficient when patient-scope shares can apply to multiple reports.

Design:
- Keep endpoint route unchanged (`/api/v1/audit/reports/{report_id}`).
- In `get_report_audit_log`, enforce event-level report relevance:
  - Include events where `context.report_id == requested_report_id`.
  - Include report-scope events tied to requested report even if context is sparse.
  - Exclude events whose context clearly targets other report ids.
- Preserve existing action filter behavior (`action` query param).

Result:
- Report audit endpoint becomes truly report-scoped and deterministic.

### 5.2 Expiry Cleanup Default Timing

Problem:
- Cleanup schedule default can delay automatic revocation/audit visibility compared to FR9 expectations.

Design:
- Update default cleanup interval constant in app lifespan scheduler setup from 60 minutes to 5 minutes.
- Keep `CLEANUP_INTERVAL_MINUTES` env override unchanged.
- Keep immediate deny-on-access behavior for expired/revoked shares unchanged.

Result:
- Better out-of-the-box timing without changing deployment-level configurability.

### 5.3 Clinician Verification Rule (Explicitly Frozen)

Decision:
- Share recipient eligibility remains role-based (`clinician` role required).
- `is_verified` is not enforced in this fix cycle.

Rationale:
- Product decision for this cycle is role-only sufficiency.
- Avoid introducing policy changes unrelated to current blocking defect.

## 6. Data Flow

### 6.1 Report Audit Retrieval

1. Validate report exists and requester owns it.
2. Identify candidate consent shares relevant to the owner/report relationship.
3. Query consent audit events for those shares.
4. Apply report relevance rules at event level.
5. Apply optional action filter.
6. Return events ordered newest-first.

### 6.2 Expiry Automation

1. Scheduler triggers cleanup job at configured interval (shorter default).
2. Cleanup marks active expired shares as revoked.
3. Cleanup writes `expired` audit events.
4. Access dependency continues immediate denial for expired/revoked shares regardless of scheduler timing.

## 7. Error Handling and Compatibility

- Keep existing HTTP status codes and detail messages for revoked/expired/forbidden paths.
- Keep audit response schema unchanged.
- Keep migration startup behavior unchanged beyond previously adopted interpreter-based invocation.

## 8. Testing Strategy

Primary tests:
- `backend/tests/test_audit_log_retrieval.py`
  - Verify report-specific endpoint excludes unrelated report events in overlap scenarios.
  - Verify action filter still returns only requested actions.
- `backend/tests/test_expired_share_cleanup.py`
  - Verify revoked marking and `expired` audit emission still hold.
  - Verify multi-expired cleanup behavior remains correct.

Regression subset:
- `backend/tests/test_audit_sharing.py`
- `backend/tests/test_expiry_enforcement.py`
- `backend/tests/test_startup_migrations.py`

## 9. Risks and Mitigations

Risk: Over-filtering removes valid audit rows.
- Mitigation: Add overlap and mixed-scope tests that assert expected inclusion and exclusion explicitly.

Risk: Shorter cleanup interval increases DB activity.
- Mitigation: Keep env override and choose a moderate default; monitor post-deploy.

Risk: Ambiguity between patient-wide and report-scoped audit semantics.
- Mitigation: Keep endpoint explicitly report-scoped and encode this in tests.

## 10. Definition of Done

- Report-scoped audit retrieval no longer leaks unrelated report events.
- Expiry cleanup default cadence is 5 minutes while remaining configurable.
- Existing FR9 behavior for deny messages and audit taxonomy remains intact.
- Targeted and regression tests pass.
- No API contract changes.
