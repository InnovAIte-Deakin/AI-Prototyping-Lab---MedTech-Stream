# T18 Notifications System Design

Date: 2026-04-29
Branch: backend/consent-sharing
Status: Proposed

## 1. Purpose

Build a complete in-app notification system for authenticated patient and clinician users.
The system must cover three surfaces that behave as one product:

- the unread bell indicator in the global nav bar
- a slide-in notification drawer for quick actions
- a full `/notifications` page for history and filtering

The implementation must reuse the existing consent-sharing and thread infrastructure rather than duplicating it.

## 2. Current State

The repo already has a notifications table and a `/api/v1/notifications` router, but they are still shaped around the older T7 contract:

- the model uses `kind`, `title`, `payload`, and `read_at`
- the router exposes list and unread-count behavior, but not the newer envelope and read-all endpoint
- thread replies already create notification rows for the other thread participants
- the frontend header has no bell, drawer, or notifications page
- there is no shared notification store for unread counts or polling

The app also already has the right adjacent primitives for this work:

- T13 UI primitives (`Button`, `Badge`, `Card`, `Modal`, `Table`, `Input`, `TextArea`)
- a global header mounted from `frontend/src/app/layout.tsx`
- a role-aware auth store
- a report detail page that can host deep-linked sharing and thread state

## 3. Scope and Non-Goals

In scope:

- backend notification model evolution using the existing table
- notification event creation for share, thread, view, and expiry flows
- read/list endpoints for the authenticated user only
- global nav bell with unread badge
- slide-in notification drawer
- full notifications page with filters and bulk read actions
- supporting clinician dashboard deep links
- backend and frontend tests written TDD-first

Out of scope:

- push notifications, email notifications, or browser service workers
- real-time websocket delivery
- a separate notification creation API for public clients
- unrelated report parsing or interpretation changes
- replacing the existing consent-sharing or thread architecture

## 4. Approaches Considered

### Approach A (Recommended): Extend the existing notification stack in place

- keep the current notifications table and router as the backbone
- widen the model to the canonical notification contract
- add a dedicated notification service for event creation and deduping
- wire notification emission into the existing share, thread, report-access, and expiry paths
- build a shared frontend notification store and reuse one item renderer in the drawer and page

Trade-offs:

- smallest change surface
- preserves current tests and data flow
- requires a careful compatibility layer while the frontend moves from the old contract to the new one

### Approach B: Replace the current router with a brand-new notification subsystem

- add a new service and new endpoints
- keep the old route as a thin compatibility wrapper during migration

Trade-offs:

- cleaner on paper
- larger migration risk
- duplicates more code for no product gain

### Approach C: Make notifications frontend-only and derive them from other API responses

- compute badges and panels from reports and thread payloads without storing notification rows

Trade-offs:

- avoids schema work
- fails the persistence and audit requirements
- cannot support read state or historical notification pages properly

### Recommendation

Choose Approach A.

It satisfies the feature set with the least architectural churn and reuses the existing consent-sharing and thread implementation as the source of truth.

## 5. Design Decisions

### 5.1 Canonical Notification Contract

The canonical notification shape exposed to the frontend is:

- `id`
- `recipient_user_id`
- `type`
- `message`
- `read`
- `created_at`
- `resource_type`
- `resource_id`

For transition safety, the API may also include legacy convenience fields such as `thread_id`, `report_id`, `kind`, `title`, `payload`, and `read_at` until all clients are migrated.

Implementation note:

- storage can continue to use `read_at` internally if that is the least risky path
- `read` is derived from `read_at` in API responses
- `recipient_user_id` is the canonical ownership boundary; users can only list or update their own notifications

### 5.2 Event Taxonomy

The notification type enum must cover the following events exactly:

Patient-facing events:

- `report_shared_confirmed`
- `clinician_viewed_report`
- `clinician_replied_in_thread`
- `share_expiring_soon`
- `share_revocation_confirmed`

Clinician-facing events:

- `new_report_shared`
- `share_revoked`
- `patient_message_in_thread`
- `share_expiry_warning`
- `share_expired`

These names should be the canonical event identifiers used by backend creation helpers and frontend icon/route mapping.

### 5.3 Event-to-Route Mapping

The frontend should use notification type plus resource fields to navigate without extra lookup calls.

| Type | Recipient | Resource data | Target |
|---|---|---|---|
| `report_shared_confirmed` | patient | `resource_type=report`, `report_id` present for report-scoped shares | `/reports/[reportId]?panel=sharing` |
| `share_revocation_confirmed` | patient | same as above | `/reports/[reportId]?panel=sharing` |
| `share_expiring_soon` | patient | same as above | `/reports/[reportId]?panel=sharing` |
| `clinician_viewed_report` | patient | `resource_type=report`, `report_id` present | `/reports/[reportId]` |
| `clinician_replied_in_thread` | patient | `resource_type=thread`, `thread_id` and `report_id` present | `/reports/[reportId]?threadId=[threadId]` |
| `patient_message_in_thread` | clinician | `resource_type=thread`, `thread_id` and `report_id` present | `/reports/[reportId]?threadId=[threadId]` |
| `new_report_shared` | clinician | `resource_type=dashboard`, optional `report_id` when report-scoped | `/reports/shared?reportId=[reportId]` or `/reports/shared` |
| `share_revoked` | clinician | `resource_type=dashboard`, optional `report_id` when report-scoped | `/reports/shared?reportId=[reportId]` or `/reports/shared` |
| `share_expiry_warning` | clinician | `resource_type=dashboard` or `report` depending on the share scope, `report_id` optional | `/reports/shared?reportId=[reportId]` or `/reports/shared` |
| `share_expired` | clinician | `resource_type=dashboard`, optional `report_id` | `/reports/shared?reportId=[reportId]` or `/reports/shared` |

Patient share confirmations and revocations are confirmations, not external attention events. They should not be treated as if someone else acted on the user’s behalf.

Route fallback rules:

- if a patient-scoped share does not have a single report anchor, patient-facing confirmations and expiry warnings fall back to the patient reports dashboard
- if a clinician-facing event does not have a report anchor, the frontend falls back to `/reports/shared`
- when a `report_id` is available, it should be used to focus the relevant report or row after navigation

### 5.4 Event Emission Boundaries

Notification creation should live in the domain layer closest to the underlying behavior:

- share creation and revocation should emit patient and clinician notifications from the reports service
- successful report access by an authorised clinician should emit `clinician_viewed_report` for the patient
- thread message creation should emit a notification to the other side of the conversation, with the event type chosen from the author’s role
- share-expiry warnings should come from a scheduled background scan over active consent shares
- share-expired notifications should come from the expiry cleanup path, with an on-access fallback if a clinician hits an already-expired share before cleanup has run

Notification creation must be idempotent for the same recipient, type, and resource identity so scheduler retries do not spam users.

### 5.5 Read and List API Behavior

The canonical API contract is:

- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/{id}/read`
- `PATCH /api/v1/notifications/read-all`

Required list behavior:

- return only the authenticated user’s notifications
- order newest first
- support `unread_only=true`, `limit`, and `offset`
- return `total_unread` in the response envelope

Recommended response envelope:

- `items`
- `total_unread`
- `limit`
- `offset`

Compatibility behavior during rollout:

- keep `GET /api/v1/notifications/unread-count` as an alias for the same unread count
- keep `POST /api/v1/notifications/{id}/read` as a compatibility alias for the PATCH read endpoint if that reduces frontend churn

### 5.6 Frontend State and Refresh

The frontend should introduce a shared notifications store or provider so the bell, drawer, and full page share the same unread count and mutation helpers.

Refresh rules:

- refresh unread count on route changes
- refresh unread count on a short polling interval
- refresh immediately after marking one notification read or marking all as read

The bell badge must be hidden when unread count is zero.

### 5.7 Drawer and Page UX

The drawer is the fast path:

- slides in from the right
- shows the 10 most recent notifications
- includes a `Mark all read` action in the header
- closes on outside click or Escape
- clicking an item marks it read and navigates to the deep link target
- includes a `View all` link to `/notifications`

The `/notifications` page is the history path:

- shows the full notification list for the authenticated user
- includes filter controls for All, Unread, and By type
- uses offset-based pagination or a load-more pattern for large histories
- reuses the same notification row/item component as the drawer in a larger layout
- includes a bulk `Mark all read` button
- includes a clear empty state

### 5.8 Supporting Clinician Dashboard

Because clinician deep links need a meaningful target, the implementation should add a clinician-facing shared reports dashboard at `/reports/shared` backed by the existing `/api/v1/reports/shared-reports` endpoint.

This page should:

- require authentication
- render shared report rows and patient context
- allow optional focus on a report via `reportId` query param
- serve as the destination for `new_report_shared`, `share_revoked`, `share_expiry_warning`, and `share_expired`

### 5.9 Accessibility and Styling Rules

The notification UI must use the established T13 primitives only and follow the existing clinical design language:

- `Button`, `Badge`, `Card`, `Modal`, `Table`, `Input`, and `TextArea` are the allowed primitives
- the drawer and page can add CSS classes, but should not introduce a new component library
- use clear focus states, readable relative timestamps, and aria labels for icon-only controls
- use the existing app shell and header styles rather than introducing a separate visual language

## 6. Data Flow

1. A share, thread, view, or expiry event occurs in the backend.
2. The nearest service/helper emits one or more notification rows for the correct recipient user IDs.
3. The list/read endpoints expose the authenticated user’s notifications and unread count.
4. The global header refreshes unread count on navigation and polling.
5. The bell opens the drawer, the drawer shows the latest 10 items, and clicking one marks it read before navigation.
6. The full page fetches the same notification data in larger pages and applies filters.

## 7. Testing Strategy

Backend tests should cover:

- one notification created for each required trigger event
- patient events do not leak to clinicians and clinician events do not leak to patients
- list endpoint returns only the authenticated user’s records
- list endpoint order, unread count, and pagination behavior
- single-read and read-all endpoints persist read state
- compatibility behavior for the existing notification route during migration

Frontend tests should cover:

- bell badge shows the correct unread count
- bell badge disappears at zero
- drawer opens on click and closes on outside click or Escape
- clicking a notification marks it read and navigates to the mapped route
- full page renders notifications, filter controls, and mark-all-read behavior
- clinician dashboard deep links open the expected shared-reports view

Prefer TDD for both layers: write the failing test first, run it red, then implement the minimal code needed to make it pass.

## 8. Risks and Mitigations

Risk: duplicate expiry warnings or expiry notifications from scheduled scans.

- Mitigation: make notification creation idempotent by recipient, type, and resource identity.

Risk: unread count drifts when the user navigates between report pages and the notifications UI.

- Mitigation: refresh count on route change, on a short poll, and after every read mutation.

Risk: deep-link targets diverge from the data the backend emits.

- Mitigation: centralise route mapping in the frontend and keep report/thread identifiers on the notification payload during the transition.

Risk: compatibility breaks existing thread tests or current consumers.

- Mitigation: keep the existing endpoints as aliases until the new frontend contract is in place, then remove the aliases only after verification.

## 9. Definition of Done

This feature is complete when:

- notifications are created for the required share, view, reply, warning, and expiry events
- users can only read and update their own notifications
- the list endpoint returns the authenticated user’s notifications newest-first with total unread count
- the bell badge updates without a full page reload
- the drawer and `/notifications` page work end to end
- clinician deep links land on a useful shared-reports dashboard
- backend and frontend tests cover the new behavior and pass