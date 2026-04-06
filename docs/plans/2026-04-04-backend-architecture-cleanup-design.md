# Backend Architecture Cleanup Design

**Date:** 2026-04-04

**Goal:** Make the backend look and behave like a deliberately layered system by moving report-domain business rules out of routers, tightening contract behavior around sharing and revocation, and expanding regression coverage before and during refactoring.

## Current State

The backend already has a usable top-level structure:

- `backend/app/main.py` composes middleware, lifespan, and route registration.
- `backend/app/db/*` isolates persistence models and session management.
- `backend/app/dependencies/*` contains auth and access-control helpers.
- `backend/app/services/*` contains reusable domain logic for auth, parsing, OCR, and LLM work.

The main inconsistency is the report domain. `backend/app/routers/reports.py` currently mixes:

- HTTP concerns
- report/share business rules
- persistence updates
- sharing state transitions
- serialization helpers

That makes the report path harder to reason about than the rest of the backend and creates a visibly uneven architecture.

## Target Architecture

### Composition Layer

`backend/app/main.py` remains composition-only:

- application creation
- middleware wiring
- lifespan registration
- router registration

No report-specific business rules should live there.

### Transport Layer

Routers remain responsible for:

- request/response schemas
- HTTP status mapping
- dependency injection
- calling service functions

Routers should not own durable business rules or multi-step state transitions.

### Domain Service Layer

Create a dedicated report-domain service module that centralizes:

- listing reports for a subject
- creating reports and findings
- granting shares
- revoking shares
- recalculating report sharing mode from active consent

This keeps report behavior in one place and makes the backend look internally consistent with the existing auth service.

### Access Layer

Existing dependencies continue to enforce authentication and accessible-report checks.

`get_accessible_report` remains a transport-friendly dependency, but business actions such as granting/revoking shares move into the report service.

## Functional Corrections

The cleanup will preserve route paths and response shapes by default. The one contract area that needs correction is share revocation:

- the system currently supports both report-scoped and patient-scoped shares
- revocation is under-specified from the HTTP layer
- current behavior is not robust enough for patient-scoped consent handling

The cleanup will make revocation behavior explicit and test-backed while keeping the existing endpoint stable for current callers.

## Testing Strategy

The refactor will follow TDD:

1. write a failing regression or behavior test
2. run the targeted test and confirm the expected failure
3. implement the smallest code change
4. rerun the targeted test
5. rerun the backend suite

Coverage focus:

- report creation persistence behavior
- report sharing and revocation flows
- sharing-mode recalculation
- patient-scoped share handling

## Why This Is The Right Level Of Change

This is a targeted cleanup, not a wholesale rewrite.

- It improves architecture where the code is visibly uneven.
- It fixes real functional edge cases instead of rearranging files for style points.
- It keeps backend contracts stable enough to avoid unnecessary frontend breakage.
- It produces a backend that reads like one system, not multiple coding styles merged together.
