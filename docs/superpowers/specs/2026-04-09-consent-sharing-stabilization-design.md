# Consent Sharing Stabilization Design (Post-Review Fix Plan)

Date: 2026-04-09
Branch: backend/consent-sharing
Status: Proposed

## 1. Context

Branch review identified blocking issues in consent-sharing backend and tests:

- Audit log retrieval is not scoped to the requested report.
- Expiry cleanup writes audit events with inconsistent `resource_type`.
- Clinician shared-report endpoint path differs between implementation and tests.
- New tests are incompatible with current synchronous test harness/factory APIs.
- Some tests reference non-existent `AuditEvent.share_id`.

This design defines a focused stabilization pass to make behavior correct, testable, and consistent with current backend conventions.

## 2. Goals

- Ensure audit log endpoint returns only events relevant to the requested report.
- Standardize audit event taxonomy for consent share lifecycle events.
- Align API path contract and tests for clinician shared report listing.
- Make new consent-sharing tests executable under current backend test architecture.
- Remove invalid model field usage from tests and assert against real schema.

## 3. Non-Goals

- No redesign of auth/token flows.
- No frontend UX redesign.
- No broader persistence schema migration beyond what is needed to stabilize behavior.
- No refactor of unrelated parser/interpret/translate modules.

## 4. Approaches Considered

## Approach A (Recommended): Minimal Surface Stabilization

- Keep canonical clinician listing path as `/api/v1/reports/shared-reports`.
- Fix service/query logic and normalize audit `resource_type` to `consent_share`.
- Rewrite failing consent-sharing tests to match current sync fixture/factory contracts.
- Add focused tests for report-scoped audit retrieval and cleanup audit consistency.

Trade-offs:
- Fastest and lowest-risk path.
- Preserves existing router organization (`reports` router owns report-sharing concerns).
- Does not offer temporary backward-compatibility alias for `/clinician/shared-reports`.

## Approach B: Dual Endpoint Compatibility During Transition

- Same as Approach A, plus add temporary alias endpoint `/api/v1/clinician/shared-reports` that delegates to report router logic.

Trade-offs:
- Reduces client break risk if external clients already use old path.
- Increases maintenance overhead and deprecation management.
- Not necessary if no external dependency exists yet.

## Approach C: Broader Domain Re-segmentation

- Introduce dedicated `consent` module/router/service boundaries and migrate all sharing/audit logic to it.

Trade-offs:
- Best long-term separation of concerns.
- Too large for current stabilization ask; higher regression risk and delivery delay.

## Recommendation

Choose Approach A.

Reasoning: The branch needs correctness and test reliability fixes first. Approach A resolves all identified blockers with the smallest behavioral surface area and lowest merge risk.

## 5. Design Decisions

### 5.1 API Contract Decision

Canonical clinician shared-report endpoint will be:

- `GET /api/v1/reports/shared-reports`

All tests and docs will align to this path.

### 5.2 Audit Event Taxonomy

All consent sharing lifecycle events will use:

- `resource_type = "consent_share"`

Actions:

- `created`
- `revoked`
- `expired`

This unifies lookup behavior across access checks, audit retrieval, and cleanup jobs.

### 5.3 Report-Scoped Audit Retrieval

`get_report_audit_log(report_id, owner_user_id, actions)` will be constrained to consent shares that apply to that report:

- Include report-scoped share events where `ConsentShare.scope = report` and `ConsentShare.report_id = report_id`.
- Include patient-scoped share events where `ConsentShare.scope = patient` and `ConsentShare.report_id IS NULL` only if they grant access to the same report owner (subject user).

Return ordering remains descending by `occurred_at`.

### 5.4 Test Architecture Alignment

Given current backend tests use synchronous SQLAlchemy `Session` and sync factory methods:

- Convert new consent-sharing tests to sync style (no `async def`, no `await` on sync factories).
- Use factory parameter names that exist today (`subject`, `created_by`, `grantee`).
- Remove `AsyncSession` fixture annotations in these tests.
- Replace `AuditEvent.share_id` assertions with `AuditEvent.resource_id` + `resource_type` filters.

### 5.5 Import Stability in Test Harness

To avoid import collisions for `tests.factories` during pytest invocation:

- Ensure local tests package import is unambiguous (prefer explicit package import strategy compatible with current project layout).
- Add targeted regression check in test run instructions to verify pytest discovers local factories correctly.

## 6. Implementation Outline

1. Service Fixes
- Update `get_report_audit_log` query predicates for true report scoping.
- Update `cleanup_expired_shares` to write `resource_type="consent_share"`.

2. Contract Alignment
- Confirm clinician shared-report route remains under reports router.
- Update tests and docs that currently target `/api/v1/clinician/shared-reports`.

3. Test Suite Stabilization
- Refactor new consent-sharing tests to sync style and valid factory args.
- Replace invalid model-field assertions and align expectations with real schema.

4. Verification
- Run targeted consent-sharing test subset.
- Run broader backend tests relevant to reports/auth/audit to catch regressions.

## 7. Error Handling and Edge Cases

- Expired shares must deny access with clear 403 detail and write at most one expiry audit event per share for lazy-access path.
- Cleanup job should remain idempotent for already-revoked shares.
- Audit retrieval should return 403 for non-owner and 404 for non-existent report.
- Action filter must only include valid events for the report scope.

## 8. Testing Strategy

Required automated coverage:

- Unit/service tests:
  - `get_report_audit_log` returns only report-relevant events.
  - `cleanup_expired_shares` writes `consent_share` events.
  - Expiry access path dedupe behavior remains correct.

- API tests:
  - `GET /api/v1/reports/shared-reports` returns expected rows and excludes revoked/expired.
  - `GET /api/v1/audit/reports/{report_id}` enforces owner-only access and action filters.

- Harness checks:
  - pytest import/discovery works from documented working directory and PYTHONPATH setup.

## 9. Acceptance Criteria for This Stabilization

- No new consent-sharing test fails due to fixture style mismatch, invalid factory args, or invalid model fields.
- Audit log endpoint is demonstrably report-scoped with tests proving exclusion of unrelated report events.
- Cleanup and access-path audit events use identical resource taxonomy (`consent_share`).
- Clinician shared-report path contract is consistent across implementation, tests, and docs.

## 10. Risks and Mitigations

- Risk: Over-tight audit filtering could hide expected patient-scope events.
  - Mitigation: Add explicit tests for both report-scope and patient-scope shares affecting the target report.

- Risk: Endpoint path change assumptions may break external consumers.
  - Mitigation: Keep canonical reports router path and document clearly; add alias only if stakeholder confirms external dependency.

- Risk: Test refactor masks async behavior assumptions.
  - Mitigation: Keep service-level behavior assertions strong and deterministic with current sync fixture model.

## 11. Rollout

- Single PR update on current branch.
- Merge only after targeted and relevant backend tests pass.
- Include concise release note in PR summary: "Consent-sharing stabilization (audit scoping, taxonomy consistency, contract/test alignment)."
