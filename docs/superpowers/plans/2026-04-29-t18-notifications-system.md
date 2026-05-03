# T18 Notifications System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an in-app notification system for patient and clinician users, including unread badge refresh, a slide-in drawer, a full notifications page, backend read/list endpoints, and notification triggers for consent and thread activity.

**Architecture:** Extend the existing notification table and router instead of replacing them. Add a dedicated backend notification service for idempotent event creation, wire it into the consent-sharing and thread paths, and expose a canonical list/read/read-all contract with compatibility aliases during rollout. On the frontend, centralize unread state in a notifications provider, reuse one item component for the drawer and history page, and route notification clicks to report, thread, or clinician dashboard targets.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy async ORM, Alembic, pytest, Next.js 14, React 18, TypeScript, Vitest, Testing Library, existing T13 UI primitives

---

## Scope Check

This is one feature area with two implementation surfaces:

- backend notification data, triggers, and read/list APIs
- frontend notification badge, drawer, page, and deep links

The work is large enough to benefit from decomposition, but the sub-parts are sequentially connected and still belong to one plan.

## File Structure

### Create
- `backend/app/services/notifications.py`
  - canonical notification helpers, serialization, dedupe checks, and query helpers
- `backend/alembic/versions/20260429_04_notifications_v2.py`
  - additive schema migration for notification resource fields and any enum widening needed
- `backend/tests/test_notifications_api.py`
  - failing backend contract tests for list/read/read-all behavior and auth isolation
- `backend/tests/test_notification_triggers.py`
  - failing backend tests for share, thread, view, and expiry notification emission
- `frontend/src/lib/notificationsApi.ts`
  - fetch helpers and route mapping helpers for notification data
- `frontend/src/store/notificationsStore.tsx`
  - shared unread-count and drawer state
- `frontend/src/components/notifications/NotificationBell.tsx`
  - bell badge button in the header
- `frontend/src/components/notifications/NotificationDrawer.tsx`
  - slide-in panel and shared item list rendering
- `frontend/src/components/notifications/NotificationListItem.tsx`
  - reusable notification row/item view
- `frontend/src/app/notifications/page.tsx`
  - full notifications history page
- `frontend/src/app/reports/shared/page.tsx`
  - clinician shared-reports dashboard target for clinician notifications
- `frontend/src/components/notifications/__tests__/NotificationBell.test.tsx`
- `frontend/src/components/notifications/__tests__/NotificationDrawer.test.tsx`
- `frontend/src/app/notifications/__tests__/page.test.tsx`
- `frontend/src/app/reports/shared/__tests__/page.test.tsx`
- `frontend/src/app/reports/[reportId]/__tests__/notification-deeplinks.test.tsx`

### Modify
- `backend/app/db/models.py`
  - extend the existing `Notification` model and notification enum values
- `backend/app/routers/notifications.py`
  - replace the old list/read shape with the canonical envelope and read-all endpoint
- `backend/app/dependencies/reports.py`
  - emit clinician-viewed-report notifications on successful shared access
- `backend/app/services/reports.py`
  - emit share confirmation/revocation notifications and expiry-related notifications
- `backend/app/routers/threads.py`
  - emit patient/clinician thread notifications on message creation
- `backend/app/main.py`
  - register the expiry-warning scheduler job and any notification cleanup hooks
- `backend/tests/test_threads_anchor_notifications.py`
  - update the existing thread/notification integration assertions to the new envelope
- `frontend/src/app/layout.tsx`
  - mount the notifications provider above the global header
- `frontend/src/components/Header.tsx`
  - render the bell, unread badge, and drawer trigger for authenticated users
- `frontend/src/app/reports/[reportId]/page.tsx`
  - read deep-link query params for sharing panel and thread focus

---

### Task 1: Write Failing Backend API Contract Tests

**Files:**
- Create: `backend/tests/test_notifications_api.py`
- Modify: `backend/tests/test_threads_anchor_notifications.py`
- Test: `backend/tests/test_notifications_api.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_notifications_api.py
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from tests.support.consent_api import auth_headers, consent_api, login, seed_report, seed_user


def _future_expiry_iso(days: int = 7) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def test_notifications_list_returns_envelope_and_total_unread(consent_api) -> None:
    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient-notif@example.com", role="patient")
        clinician = seed_user(session, email="clinician-notif@example.com", role="clinician")
        report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

    patient_token = login(consent_api, email=patient.email)
    share_resp = consent_api.client.post(
        f"/api/v1/reports/{report.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": clinician.email,
            "scope": "report",
            "access_level": "comment",
            "expires_at": _future_expiry_iso(),
        },
    )
    assert share_resp.status_code == 201, share_resp.text

    response = consent_api.client.get(
        "/api/v1/notifications",
        headers=auth_headers(patient_token),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert "items" in payload
    assert "total_unread" in payload
    assert payload["total_unread"] >= 1
    assert all(item["recipient_user_id"] == patient.id for item in payload["items"])


def test_notifications_patch_read_all_marks_user_rows_read(consent_api) -> None:
    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient-readall@example.com", role="patient")
        clinician = seed_user(session, email="clinician-readall@example.com", role="clinician")
        report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

    patient_token = login(consent_api, email=patient.email)
    consent_api.client.post(
        f"/api/v1/reports/{report.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": clinician.email,
            "scope": "report",
            "access_level": "comment",
            "expires_at": _future_expiry_iso(),
        },
    )

    response = consent_api.client.patch(
        "/api/v1/notifications/read-all",
        headers=auth_headers(patient_token),
    )
    assert response.status_code in (200, 204), response.text

    unread = consent_api.client.get(
        "/api/v1/notifications?unread_only=true",
        headers=auth_headers(patient_token),
    )
    assert unread.status_code == 200, unread.text
    assert unread.json()["items"] == []
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && C:/Users/khanh/anaconda3/envs/Study/python.exe -m pytest -q tests/test_notifications_api.py`

Expected: FAIL because the router still returns the older T7-shaped payload and does not expose `read-all`.

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/tests/test_notifications_api.py backend/tests/test_threads_anchor_notifications.py
git commit -m "test(notifications): add failing API contract coverage"
```

---

### Task 2: Implement the Canonical Notification Contract

**Files:**
- Create: `backend/app/services/notifications.py`
- Create: `backend/alembic/versions/20260429_04_notifications_v2.py`
- Modify: `backend/app/db/models.py`
- Modify: `backend/app/routers/notifications.py`
- Modify: `backend/tests/test_threads_anchor_notifications.py`
- Test: `backend/tests/test_notifications_api.py`

- [ ] **Step 1: Write the minimal implementation**

```python
# backend/app/services/notifications.py
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Notification


async def list_notifications(session: AsyncSession, *, user_id: str, unread_only: bool, limit: int, offset: int):
    stmt = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    rows = (await session.scalars(stmt)).all()
    unread = await session.scalar(
        select(func.count()).select_from(Notification).where(Notification.user_id == user_id).where(Notification.read_at.is_(None))
    )
    return rows, int(unread or 0)


async def mark_notification_read(session: AsyncSession, *, user_id: str, notification_id: str) -> bool:
    result = await session.execute(
        update(Notification)
        .where(Notification.id == notification_id)
        .where(Notification.user_id == user_id)
        .where(Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    return bool(result.rowcount)
```

```python
# backend/app/routers/notifications.py
class NotificationOut(BaseModel):
    id: str
    recipient_user_id: str
    type: str
    message: str
    read: bool
    created_at: datetime
    resource_type: str
    resource_id: str
    thread_id: str | None = None
    report_id: str | None = None


class NotificationListResponse(BaseModel):
    items: list[NotificationOut]
    total_unread: int
    limit: int
    offset: int
```

```python
# backend/tests/test_threads_anchor_notifications.py
notifications = consent_api.client.get("/api/v1/notifications", headers=auth_headers(patient_token))
assert notifications.status_code == 200, notifications.text
payload = notifications.json()
assert payload["total_unread"] >= 1
assert any(item["thread_id"] == thread_id for item in payload["items"])
```

- [ ] **Step 2: Run tests to verify the contract passes**

Run: `cd backend && C:/Users/khanh/anaconda3/envs/Study/python.exe -m pytest -q tests/test_notifications_api.py tests/test_threads_anchor_notifications.py`

Expected: PASS.

- [ ] **Step 3: Run a focused backend regression check**

Run: `cd backend && C:/Users/khanh/anaconda3/envs/Study/python.exe -m pytest -q tests/test_auth_api.py tests/test_verified_clinician.py`

Expected: PASS.

- [ ] **Step 4: Commit implementation**

```bash
git add backend/app/db/models.py backend/app/routers/notifications.py backend/app/services/notifications.py backend/alembic/versions/20260429_04_notifications_v2.py backend/tests/test_threads_anchor_notifications.py
git commit -m "feat(notifications): add canonical list and read contract"
```

---

### Task 3: Write Failing Backend Trigger Tests

**Files:**
- Create: `backend/tests/test_notification_triggers.py`
- Test: `backend/tests/test_notification_triggers.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_notification_triggers.py
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.db.models import Notification
from tests.support.consent_api import auth_headers, consent_api, login, seed_report, seed_user


def _future_expiry_iso(days: int = 7) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def test_share_creation_emits_patient_and_clinician_notifications(consent_api) -> None:
  with consent_api.session_factory() as session:
    patient = seed_user(session, email="patient-share@example.com", role="patient")
    clinician = seed_user(session, email="clinician-share@example.com", role="clinician")
    report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

  patient_token = login(consent_api, email=patient.email)
  share_resp = consent_api.client.post(
    f"/api/v1/reports/{report.id}/share",
    headers=auth_headers(patient_token),
    json={
      "clinician_email": clinician.email,
      "scope": "report",
      "access_level": "comment",
      "expires_at": _future_expiry_iso(),
    },
  )
  assert share_resp.status_code == 201, share_resp.text

  patient_notifications = consent_api.client.get(
    "/api/v1/notifications",
    headers=auth_headers(patient_token),
  )
  assert any(item["type"] == "report_shared_confirmed" for item in patient_notifications.json()["items"])

  clinician_token = login(consent_api, email=clinician.email)
  clinician_notifications = consent_api.client.get(
    "/api/v1/notifications",
    headers=auth_headers(clinician_token),
  )
  assert any(item["type"] == "new_report_shared" for item in clinician_notifications.json()["items"])


def test_clinician_reply_emits_patient_notification(consent_api) -> None:
  with consent_api.session_factory() as session:
    patient = seed_user(session, email="patient-thread@example.com", role="patient")
    clinician = seed_user(session, email="clinician-thread@example.com", role="clinician")
    report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

  patient_token = login(consent_api, email=patient.email)
  consent_api.client.post(
    f"/api/v1/reports/{report.id}/share",
    headers=auth_headers(patient_token),
    json={
      "clinician_email": clinician.email,
      "scope": "report",
      "access_level": "comment",
      "expires_at": _future_expiry_iso(),
    },
  )
  thread_resp = consent_api.client.post(
    f"/api/v1/reports/{report.id}/threads",
    headers=auth_headers(patient_token),
    json={"initial_message": "What does this mean?"},
  )
  assert thread_resp.status_code == 201, thread_resp.text
  thread_id = thread_resp.json()["id"]

  clinician_token = login(consent_api, email=clinician.email)
  reply_resp = consent_api.client.post(
    f"/api/v1/threads/{thread_id}/messages",
    headers=auth_headers(clinician_token),
    json={"body": "Please recheck in a few weeks."},
  )
  assert reply_resp.status_code == 201, reply_resp.text

  patient_notifications = consent_api.client.get(
    "/api/v1/notifications",
    headers=auth_headers(patient_token),
  )
  assert any(item["type"] == "clinician_replied_in_thread" for item in patient_notifications.json()["items"])


def test_report_access_emits_view_notification(consent_api) -> None:
  with consent_api.session_factory() as session:
    patient = seed_user(session, email="patient-view@example.com", role="patient")
    clinician = seed_user(session, email="clinician-view@example.com", role="clinician")
    report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

  patient_token = login(consent_api, email=patient.email)
  consent_api.client.post(
    f"/api/v1/reports/{report.id}/share",
    headers=auth_headers(patient_token),
    json={
      "clinician_email": clinician.email,
      "scope": "report",
      "access_level": "comment",
      "expires_at": _future_expiry_iso(),
    },
  )

  clinician_token = login(consent_api, email=clinician.email)
  response = consent_api.client.get(
    f"/api/v1/reports/{report.id}",
    headers=auth_headers(clinician_token),
  )
  assert response.status_code == 200, response.text

  patient_notifications = consent_api.client.get(
    "/api/v1/notifications",
    headers=auth_headers(patient_token),
  )
  assert any(item["type"] == "clinician_viewed_report" for item in patient_notifications.json()["items"])


def test_cleanup_emits_expiry_notifications(consent_api) -> None:
  with consent_api.session_factory() as session:
    patient = seed_user(session, email="patient-expiry@example.com", role="patient")
    clinician = seed_user(session, email="clinician-expiry@example.com", role="clinician")
    report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

  patient_token = login(consent_api, email=patient.email)
  consent_api.client.post(
    f"/api/v1/reports/{report.id}/share",
    headers=auth_headers(patient_token),
    json={
      "clinician_email": clinician.email,
      "scope": "report",
      "access_level": "comment",
      "expires_at": (datetime.now(UTC) - timedelta(days=1)).isoformat(),
    },
  )

  clinician_token = login(consent_api, email=clinician.email)
  notifications = consent_api.client.get(
    "/api/v1/notifications",
    headers=auth_headers(clinician_token),
  )
  assert notifications.status_code == 200, notifications.text
  assert any(item["type"] in {"share_expired", "share_expiry_warning"} for item in notifications.json()["items"])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && C:/Users/khanh/anaconda3/envs/Study/python.exe -m pytest -q tests/test_notification_triggers.py`

Expected: FAIL because the new notification helpers and event wiring do not exist yet.

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/tests/test_notification_triggers.py
git commit -m "test(notifications): add failing trigger coverage"
```

---

### Task 4: Implement Notification Event Wiring

**Files:**
- Modify: `backend/app/dependencies/reports.py`
- Modify: `backend/app/services/reports.py`
- Modify: `backend/app/routers/threads.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/services/notifications.py`
- Modify: `backend/tests/test_notification_triggers.py`
- Test: `backend/tests/test_notification_triggers.py`

- [ ] **Step 1: Implement the event helpers and scheduler hooks**

```python
# backend/app/services/notifications.py
async def emit_notification(session: AsyncSession, *, recipient_user_id: str, type: str, message: str, resource_type: str, resource_id: str, report_id: str | None = None, thread_id: str | None = None) -> None:
    existing = await session.scalar(
        select(Notification).where(
            Notification.user_id == recipient_user_id,
            Notification.kind == type,
            Notification.resource_type == resource_type,
            Notification.resource_id == resource_id,
        )
    )
    if existing is not None:
        return
    session.add(
        Notification(
            user_id=recipient_user_id,
            kind=type,
            title=message,
            payload={},
            resource_type=resource_type,
            resource_id=resource_id,
            report_id=report_id,
            thread_id=thread_id,
        )
    )
```

```python
# backend/app/main.py
async def scheduled_share_warning_scan():
    async with app.state.database.session_factory() as session:
        await emit_share_expiry_warnings(session)
```

```python
# backend/app/routers/threads.py
event_type = "clinician_replied_in_thread" if "clinician" in auth.roles else "patient_message_in_thread"
```

```python
# backend/app/dependencies/reports.py
await emit_notification(
    session,
    recipient_user_id=report.subject_user_id,
    type="clinician_viewed_report",
    message=f"{auth.user.display_name} viewed your shared report",
    resource_type="report",
    resource_id=report.id,
    report_id=report.id,
)
```

- [ ] **Step 2: Run tests to verify the trigger tests pass**

Run: `cd backend && C:/Users/khanh/anaconda3/envs/Study/python.exe -m pytest -q tests/test_notification_triggers.py`

Expected: PASS.

- [ ] **Step 3: Run targeted consent-sharing regressions**

Run: `cd backend && C:/Users/khanh/anaconda3/envs/Study/python.exe -m pytest -q tests/test_expiry_enforcement.py tests/test_audit_log_retrieval.py tests/test_threads_anchor_notifications.py`

Expected: PASS.

- [ ] **Step 4: Commit implementation**

```bash
git add backend/app/dependencies/reports.py backend/app/main.py backend/app/routers/threads.py backend/app/services/notifications.py backend/app/services/reports.py backend/tests/test_notification_triggers.py
git commit -m "feat(notifications): wire share and thread notification events"
```

---

### Task 5: Write Failing Frontend Tests

**Files:**
- Create: `frontend/src/components/notifications/__tests__/NotificationBell.test.tsx`
- Create: `frontend/src/components/notifications/__tests__/NotificationDrawer.test.tsx`
- Create: `frontend/src/app/notifications/__tests__/page.test.tsx`
- Create: `frontend/src/app/reports/shared/__tests__/page.test.tsx`
- Create: `frontend/src/app/reports/[reportId]/__tests__/notification-deeplinks.test.tsx`
- Test: the files above

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/components/notifications/__tests__/NotificationBell.test.tsx
it('shows the unread badge and opens the drawer', async () => {
  render(<NotificationBell />);
  expect(screen.getByLabelText(/notifications/i)).toBeInTheDocument();
  expect(screen.getByText('3')).toBeVisible();
});
```

```tsx
// frontend/src/components/notifications/__tests__/NotificationDrawer.test.tsx
it('closes on outside click and escape', async () => {
  render(<NotificationDrawer open onClose={vi.fn()} items={mockItems} />);
  await user.click(screen.getByTestId('notifications-overlay'));
  await user.keyboard('{Escape}');
});
```

```tsx
// frontend/src/app/notifications/__tests__/page.test.tsx
it('renders filter controls and a load-more button', async () => {
  render(<NotificationsPage />);
  expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /unread/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /mark all read/i })).toBeInTheDocument();
});
```

```tsx
// frontend/src/app/reports/[reportId]/__tests__/notification-deeplinks.test.tsx
it('opens the sharing panel when panel=sharing is in the URL', async () => {
  render(<ReportDetailPage searchParams={{ panel: 'sharing' }} />);
  expect(screen.getByRole('dialog', { name: /sharing preferences/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm test -- src/components/notifications/__tests__/NotificationBell.test.tsx src/components/notifications/__tests__/NotificationDrawer.test.tsx src/app/notifications/__tests__/page.test.tsx src/app/reports/shared/__tests__/page.test.tsx src/app/reports/[reportId]/__tests__/notification-deeplinks.test.tsx`

Expected: FAIL because the notification shell, page, and deep-link handling do not exist yet.

- [ ] **Step 3: Commit failing tests**

```bash
git add frontend/src/components/notifications/__tests__/NotificationBell.test.tsx frontend/src/components/notifications/__tests__/NotificationDrawer.test.tsx frontend/src/app/notifications/__tests__/page.test.tsx frontend/src/app/reports/shared/__tests__/page.test.tsx frontend/src/app/reports/[reportId]/__tests__/notification-deeplinks.test.tsx
git commit -m "test(notifications): add failing frontend coverage"
```

---

### Task 6: Implement the Frontend Notification Shell and Deep Links

**Files:**
- Create: `frontend/src/lib/notificationsApi.ts`
- Create: `frontend/src/store/notificationsStore.tsx`
- Create: `frontend/src/components/notifications/NotificationBell.tsx`
- Create: `frontend/src/components/notifications/NotificationDrawer.tsx`
- Create: `frontend/src/components/notifications/NotificationListItem.tsx`
- Create: `frontend/src/app/notifications/page.tsx`
- Create: `frontend/src/app/reports/shared/page.tsx`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/components/Header.tsx`
- Modify: `frontend/src/app/reports/[reportId]/page.tsx`
- Test: the frontend tests from Task 5

- [ ] **Step 1: Implement the shared notification state and route mapper**

```tsx
// frontend/src/store/notificationsStore.tsx
type NotificationsState = {
  unreadCount: number;
  items: NotificationItem[];
  panelOpen: boolean;
  refreshUnreadCount: () => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};
```

```ts
// frontend/src/lib/notificationsApi.ts
export function buildNotificationHref(item: NotificationItem): string {
  switch (item.type) {
    case 'clinician_replied_in_thread':
    case 'patient_message_in_thread':
      return `/reports/${item.report_id}?threadId=${item.thread_id}`;
    case 'new_report_shared':
    case 'share_revoked':
    case 'share_expiry_warning':
    case 'share_expired':
      return item.report_id ? `/reports/shared?reportId=${item.report_id}` : '/reports/shared';
    default:
      return item.report_id ? `/reports/${item.report_id}?panel=sharing` : '/reports';
  }
}
```

```tsx
// frontend/src/app/layout.tsx
<AuthProvider>
  <NotificationsProvider>
    <Header />
    <main id="main" className="container">{children}</main>
  </NotificationsProvider>
</AuthProvider>
```

- [ ] **Step 2: Implement the bell, drawer, and full page using T13 primitives only**

```tsx
// frontend/src/components/Header.tsx
{isAuth ? <NotificationBell /> : null}
```

```tsx
// frontend/src/components/notifications/NotificationDrawer.tsx
<Modal open={open} onClose={onClose} title="Notifications">
  <div className="notifications-drawer-list">
    {items.slice(0, 10).map((item) => (
      <NotificationListItem key={item.id} item={item} onClick={() => handleOpen(item)} />
    ))}
  </div>
</Modal>
```

```tsx
// frontend/src/app/notifications/page.tsx
<Card>
  <div className="notifications-filter-bar">
    <Button variant="ghost" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</Button>
    <Button variant="ghost" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>Unread</Button>
  </div>
  <div className="notifications-list">
    {items.map((item) => (
      <NotificationListItem key={item.id} item={item} onClick={() => handleOpen(item)} />
    ))}
  </div>
  <Button onClick={loadMore}>Load more</Button>
</Card>
```

```tsx
// frontend/src/app/reports/shared/page.tsx
<ProtectedView>
  <Card>
    <h1>Shared Reports</h1>
    <p>Reports currently shared with you.</p>
  </Card>
</ProtectedView>
```

```tsx
// frontend/src/app/reports/[reportId]/page.tsx
const params = useSearchParams();
useEffect(() => {
  if (params.get('panel') === 'sharing') setSharingPanelOpen(true);
  if (params.get('threadId')) setActiveThreadId(params.get('threadId'));
}, [params]);
```

- [ ] **Step 3: Run the frontend notification tests to verify they pass**

Run: `cd frontend && npm test -- src/components/notifications/__tests__/NotificationBell.test.tsx src/components/notifications/__tests__/NotificationDrawer.test.tsx src/app/notifications/__tests__/page.test.tsx src/app/reports/shared/__tests__/page.test.tsx src/app/reports/[reportId]/__tests__/notification-deeplinks.test.tsx`

Expected: PASS.

- [ ] **Step 4: Run a broader frontend regression check**

Run: `cd frontend && npm test`

Expected: PASS.

- [ ] **Step 5: Commit implementation**

```bash
git add frontend/src/app/layout.tsx frontend/src/app/notifications/page.tsx frontend/src/app/reports/[reportId]/page.tsx frontend/src/app/reports/shared/page.tsx frontend/src/components/Header.tsx frontend/src/components/notifications frontend/src/lib/notificationsApi.ts frontend/src/store/notificationsStore.tsx
git commit -m "feat(notifications): add bell drawer and notifications page"
```

---

## Final Verification Before Completion

Before declaring this feature done, run all of the following fresh:

1. `cd backend && C:/Users/khanh/anaconda3/envs/Study/python.exe -m pytest -q`
2. `cd frontend && npm test`
3. `cd frontend && npm run lint`
4. `cd frontend && npm run typecheck`

If any test fails, repair the same slice first before widening scope.