# Parse Architecture Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the `/api/v1/parse` flow into a cleaner parse-pipeline service while preserving the route contract and improving regression coverage around JSON and multipart parsing.

**Architecture:** Keep OCR and text parsing in their existing service modules, and add a dedicated parse pipeline service that owns upload validation, text extraction orchestration, JSON payload validation, and response shaping. The router becomes a thin transport adapter that passes request metadata and uploaded files into that service.

**Tech Stack:** FastAPI, Starlette upload handling, pytest, TestClient, PyMuPDF, Pillow, existing parser/OCR services

---

### Task 1: Write Failing Parse Pipeline Tests

**Files:**
- Create: `backend/tests/test_parse_pipeline.py`
- Reference: `backend/app/routers/parse.py`

**Step 1: Write the failing tests**

Add unit tests for the service module that does not exist yet:

- upload validation rejects too many files
- JSON payload validation requires a `text` field
- parse response shaping preserves row order and expected response keys

Example shape:

```python
def test_extract_text_from_uploads_rejects_too_many_files():
    uploads = [FakeUpload(...) for _ in range(6)]
    with pytest.raises(ParseServiceError) as exc:
        asyncio.run(extract_text_from_uploads(uploads, content_length=None))
    assert exc.value.status_code == 413
```

**Step 2: Run the new test file to verify failure**

Run:

```bash
pytest backend/tests/test_parse_pipeline.py
```

Expected:

- failure because the service module/functions do not exist yet

### Task 2: Implement The Parse Pipeline Service

**Files:**
- Create: `backend/app/services/parse_pipeline.py`
- Modify: `backend/app/routers/parse.py`
- Test: `backend/tests/test_parse_pipeline.py`

**Step 1: Implement the minimal service**

Add:

- `ParseServiceError`
- `ParseConfig`
- `collect_uploads`
- `extract_text_from_uploads`
- `extract_text_from_json_payload`
- `build_parse_response`

Keep signatures explicit and keep OCR/parser dependencies injectable where useful for tests.

**Step 2: Refactor the router to call the service**

The router should retain:

- route decorator
- FastAPI request/file params
- body loading via `request.json()` when needed
- translation from service errors to `HTTPException`

Move orchestration and response-building into the service.

**Step 3: Run the focused tests**

Run:

```bash
pytest backend/tests/test_parse_pipeline.py
```

Expected:

- focused service tests pass

### Task 3: Add API Regression Tests For Parse

**Files:**
- Modify: `backend/tests/test_parser_pdf.py`
- Create or Modify: `backend/tests/test_parse_api.py`
- Reference: `backend/app/routers/parse.py`

**Step 1: Write a failing API-level regression test**

Add tests for:

- JSON `{"text": ...}` parsing path
- multi-file upload path preserving combined extracted text order

**Step 2: Run the targeted API parse tests**

Run:

```bash
pytest backend/tests/test_parse_api.py backend/tests/test_parser_pdf.py
```

Expected:

- if the router contract drifted during refactor, the new tests catch it

**Step 3: Fix only the minimum necessary**

Keep the route contract stable and avoid broad parser changes.

### Task 4: Final Verification

**Files:**
- Review: `backend/app/services/parse_pipeline.py`
- Review: `backend/app/routers/parse.py`
- Review: `docs/plans/2026-04-05-parse-architecture-cleanup-design.md`

**Step 1: Run lint**

Run:

```bash
python -m ruff check backend
```

Expected:

- no lint errors

**Step 2: Run full backend verification**

Run:

```bash
pytest backend/tests
```

Expected:

- backend suite remains green

**Step 3: Report remaining gaps**

Limit the final summary to real next seams only, such as:

- interpretation path still mixing router and service concerns
- startup migration execution still coupled to lifespan
