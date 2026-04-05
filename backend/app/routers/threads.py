from __future__ import annotations

import json
from datetime import datetime, UTC
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    ConversationThread,
    MessageKind,
    Report,
    ThreadMessage,
    ThreadParticipant,
    User,
)
from app.db.session import get_db_session
from app.dependencies.auth import AuthContext, get_current_auth_context
from app.dependencies.reports import get_accessible_report
from app.services.questions import generate_questions

router = APIRouter(tags=["threads"])


class QuestionPromptsResponse(BaseModel):
    prompts: list[str]


@router.get("/reports/{report_id}/question-prompts", response_model=QuestionPromptsResponse)
async def get_question_prompts(
    report: Report = Depends(get_accessible_report),
    auth: AuthContext = Depends(get_current_auth_context),
) -> QuestionPromptsResponse:
    prompts, _ = await generate_questions(report.findings)
    return QuestionPromptsResponse(prompts=prompts)


class ThreadMessageOut(BaseModel):
    id: str
    author_user_id: str
    author_name: str
    kind: str
    body: str
    created_at: datetime


class ConversationThreadOut(BaseModel):
    id: str
    report_id: str | None
    subject_user_id: str
    title: str | None
    status: str
    created_at: datetime
    messages: list[ThreadMessageOut] = []


class CreateThreadRequest(BaseModel):
    title: str | None = None
    initial_message: str


@router.get("/reports/{report_id}/threads", response_model=list[ConversationThreadOut])
async def list_report_threads(
    report: Report = Depends(get_accessible_report),
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> list[ConversationThreadOut]:
    stmt = (
        select(ConversationThread)
        .where(ConversationThread.report_id == report.id)
        .order_by(ConversationThread.created_at.desc())
        .options(selectinload(ConversationThread.messages).selectinload(ThreadMessage.author_user))
    )
    result = await session.scalars(stmt)
    threads = result.all()

    out = []
    for thread in threads:
        messages = sorted(thread.messages, key=lambda m: m.created_at)
        msgs_out = [
            ThreadMessageOut(
                id=m.id,
                author_user_id=m.author_user_id,
                author_name=m.author_user.display_name if m.author_user else "Unknown",
                kind=m.kind.value,
                body=m.body,
                created_at=m.created_at,
            )
            for m in messages
        ]
        out.append(
            ConversationThreadOut(
                id=thread.id,
                report_id=thread.report_id,
                subject_user_id=thread.subject_user_id,
                title=thread.title,
                status=thread.status.value,
                created_at=thread.created_at,
                messages=msgs_out,
            )
        )
    return out


@router.post("/reports/{report_id}/threads", response_model=ConversationThreadOut, status_code=status.HTTP_201_CREATED)
async def create_thread(
    payload: CreateThreadRequest,
    report: Report = Depends(get_accessible_report),
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> ConversationThreadOut:
    thread = ConversationThread(
        subject_user_id=report.subject_user_id,
        created_by_user_id=auth.user.id,
        report_id=report.id,
        title=payload.title or "Questions for Clinician",
    )
    session.add(thread)
    await session.flush()

    participant = ThreadParticipant(thread_id=thread.id, user_id=auth.user.id)
    session.add(participant)

    message = ThreadMessage(
        thread_id=thread.id,
        author_user_id=auth.user.id,
        kind=MessageKind.TEXT,
        body=payload.initial_message,
    )
    session.add(message)
    await session.commit()
    await session.refresh(thread)

    return ConversationThreadOut(
        id=thread.id,
        report_id=thread.report_id,
        subject_user_id=thread.subject_user_id,
        title=thread.title,
        status=thread.status.value,
        created_at=thread.created_at,
        messages=[
            ThreadMessageOut(
                id=message.id,
                author_user_id=message.author_user_id,
                author_name=auth.user.display_name,
                kind=message.kind.value,
                body=message.body,
                created_at=message.created_at,
            )
        ],
    )


class AddMessageRequest(BaseModel):
    body: str | None = None
    template_payload: dict[str, Any] | None = None


@router.post("/threads/{thread_id}/messages", response_model=ThreadMessageOut, status_code=status.HTTP_201_CREATED)
async def add_message(
    thread_id: str,
    payload: AddMessageRequest,
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> ThreadMessageOut:
    thread = await session.scalar(select(ConversationThread).where(ConversationThread.id == thread_id))
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")

    if payload.template_payload:
        kind = MessageKind.TEMPLATE
        body = json.dumps(payload.template_payload)
    elif payload.body:
        kind = MessageKind.TEXT
        body = payload.body
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Must provide body or template_payload")

    message = ThreadMessage(
        thread_id=thread.id,
        author_user_id=auth.user.id,
        kind=kind,
        body=body,
    )
    session.add(message)
    
    participant = await session.scalar(
        select(ThreadParticipant).where(
            ThreadParticipant.thread_id == thread.id,
            ThreadParticipant.user_id == auth.user.id
        )
    )
    if not participant:
        session.add(ThreadParticipant(thread_id=thread.id, user_id=auth.user.id))

    await session.commit()
    await session.refresh(message)

    return ThreadMessageOut(
        id=message.id,
        author_user_id=message.author_user_id,
        author_name=auth.user.display_name,
        kind=message.kind.value,
        body=message.body,
        created_at=message.created_at,
    )
