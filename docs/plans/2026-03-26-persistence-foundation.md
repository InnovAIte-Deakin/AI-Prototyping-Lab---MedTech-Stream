# Persistence Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish the durable backend foundation for accounts, sharing, messaging, report findings, and biomarker history without storing raw uploads or extracted free text by default.

**Architecture:** The backend uses SQLAlchemy 2.x ORM models with an async `DatabaseManager` wired into FastAPI app state, and Alembic manages the schema for PostgreSQL. Tests use fast SQLite-backed metadata creation plus lightweight factories so model relationships and constraints can be exercised without requiring a running Postgres instance.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, Alembic, asyncpg, SQLite test harness, pytest

---

## Bootstrap

- Start the database with `docker compose up -d postgres`.
- Apply migrations with `docker compose run --rm backend alembic upgrade head` or `cd backend && alembic upgrade head`.
- Run backend tests with `cd backend && pytest -q`.

## Foundation Scope

- `users`, `roles`, `user_roles`, and `auth_sessions` establish local-account and refresh-session persistence.
- `reports`, `report_findings`, and `biomarker_observations` persist structured report data and trend-ready biomarker history without persisting raw files or extracted free text.
- `consent_shares`, `audit_events`, `conversation_threads`, `thread_participants`, `thread_messages`, `notifications`, and `clinician_response_templates` provide the minimum durable collaboration surface for later FR8, FR9, FR10, FR12, and FR13 work.

## Privacy Defaults

- Reports default to private sharing mode.
- Consent shares default to report-scoped, read-only access.
- Refresh sessions store token hashes and metadata, not plaintext refresh tokens.
- Audit events store actor/resource/context metadata only.

## Test Helpers

- `backend/tests/factories.py` provides cheap, persisted patient/caregiver/clinician/report/share/thread graphs.
- Persistence tests use SQLite metadata creation to validate ownership rules, default privacy settings, relationship wiring, and integrity constraints before later API work is added.
