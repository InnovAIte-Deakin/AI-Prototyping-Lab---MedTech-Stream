from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.db.session import get_db_session
from app.dependencies.auth import AuthContext, get_current_auth_context
from app.services.auth import (
    AuthError,
    TokenBundle,
    login_account,
    refresh_account_session,
    register_account,
    revoke_session,
    role_names_for_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    roles: list[str]
    is_active: bool


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8)
    role: Literal["patient", "caregiver", "clinician"]
    display_name: str | None = Field(default=None, max_length=120)


class RegisterResponse(BaseModel):
    user: UserOut


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=16)


class AuthTokensResponse(BaseModel):
    access_token: str
    token_type: str
    access_token_expires_at: datetime
    refresh_token: str
    refresh_token_expires_at: datetime
    user: UserOut


class MeResponse(BaseModel):
    user: UserOut


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        roles=role_names_for_user(user),
        is_active=user.is_active,
    )


def _tokens_response(*, user: User, token_bundle: TokenBundle) -> AuthTokensResponse:
    return AuthTokensResponse(
        access_token=token_bundle.access_token,
        token_type="bearer",
        access_token_expires_at=token_bundle.access_token_expires_at,
        refresh_token=token_bundle.refresh_token,
        refresh_token_expires_at=token_bundle.refresh_token_expires_at,
        user=_user_out(user),
    )


def _raise_auth_http_error(exc: AuthError) -> None:
    headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
    raise HTTPException(status_code=exc.status_code, detail=exc.detail, headers=headers)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register_endpoint(
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_db_session),
) -> RegisterResponse:
    try:
        user = await register_account(
            session,
            email=payload.email,
            password=payload.password,
            role_name=payload.role,
            display_name=payload.display_name,
        )
    except AuthError as exc:
        _raise_auth_http_error(exc)

    return RegisterResponse(user=_user_out(user))


@router.post("/login", response_model=AuthTokensResponse)
async def login_endpoint(
    payload: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> AuthTokensResponse:
    try:
        user, token_bundle = await login_account(
            session,
            email=payload.email,
            password=payload.password,
            user_agent=request.headers.get("user-agent"),
            client_host=request.client.host if request.client else None,
        )
    except AuthError as exc:
        _raise_auth_http_error(exc)

    return _tokens_response(user=user, token_bundle=token_bundle)


@router.post("/refresh", response_model=AuthTokensResponse)
async def refresh_endpoint(
    payload: RefreshRequest,
    session: AsyncSession = Depends(get_db_session),
) -> AuthTokensResponse:
    try:
        user, token_bundle = await refresh_account_session(
            session,
            refresh_token=payload.refresh_token,
        )
    except AuthError as exc:
        _raise_auth_http_error(exc)

    return _tokens_response(user=user, token_bundle=token_bundle)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout_endpoint(
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    await revoke_session(session, auth_session=auth.auth_session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=MeResponse)
async def me_endpoint(auth: AuthContext = Depends(get_current_auth_context)) -> MeResponse:
    return MeResponse(user=_user_out(auth.user))
