# Parse Architecture Cleanup Design

**Date:** 2026-04-05

**Goal:** Make the parse path read like the rest of the backend by moving multipart/JSON orchestration out of the router and into a dedicated service layer, while preserving the existing `/api/v1/parse` contract.

## Current State

The parsing stack already has strong lower-level building blocks:

- `backend/app/services/parser.py` handles text-to-rows parsing.
- `backend/app/services/ocr.py` handles PDF/image text extraction.

The inconsistency is `backend/app/routers/parse.py`, which currently owns:

- upload collection
- payload-size validation
- file-type validation
- OCR dispatch
- JSON body validation
- parse response shaping

That is too much transport-plus-domain logic in one router compared with the cleaner auth and report paths.

## Target Architecture

### Router Responsibility

The parse router should be limited to:

- receiving the FastAPI request and file params
- reading request metadata/body
- calling the parse pipeline service
- returning the shaped response

### Parse Pipeline Service

A new dedicated service module will own:

- collecting and validating upload inputs
- extracting text from supported uploads
- validating JSON parse payloads
- shaping the final parse response

This keeps OCR orchestration and parse response construction together in one backend domain service.

### Existing Parser/OCR Services

`parser.py` and `ocr.py` remain unchanged in responsibility:

- `parser.py` stays responsible for text parsing
- `ocr.py` stays responsible for OCR/text extraction primitives

The new parse pipeline composes them rather than replacing them.

## Contract Strategy

The external `/api/v1/parse` response should remain stable:

- `rows`
- `unparsed_lines`
- `unparsed`
- `meta`
- `extracted_text`

Error behavior should also remain stable unless the current behavior is clearly inconsistent or under-specified.

## Testing Strategy

Use TDD for the new service layer:

1. write failing tests for new parse-pipeline behavior
2. run them red
3. implement the service minimally
4. rerun focused tests green
5. rerun backend suite

Coverage focus:

- multipart upload validation
- JSON text payload validation
- parse response shaping
- API-level regression for JSON parse and multi-upload ordering

## Why This Is The Right Level Of Change

This is a senior-level cleanup, not a cosmetic rewrite:

- it standardizes the router/service split
- it keeps existing parser and OCR responsibilities intact
- it improves testability by making parse orchestration callable without a full request object
- it avoids breaking the frontend contract while making the backend look intentionally designed
