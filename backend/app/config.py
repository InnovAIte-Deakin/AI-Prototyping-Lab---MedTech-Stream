"""
Configuration management for ReportRx backend.
"""

from __future__ import annotations

from typing import List, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # OpenAI
    openai_api_key: str
    openai_model: str = "gpt-5"
    openai_fallback_models: List[str] = ["gpt-4.1", "gpt-4o"]
    openai_max_tokens: int = 1500
    openai_temperature: float = 0.3
    openai_timeout: int = 20

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = True
    allowed_origins: str = (
        "http://localhost:3000,http://localhost:5173,"
        "http://127.0.0.1:3000,http://127.0.0.1:5173"
    )

    # App metadata
    app_version: str = "1.0.0"

    # pydantic-settings v2 configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("openai_fallback_models", mode="before")
    @classmethod
    def _parse_fallbacks(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [m.strip() for m in v.split(",") if m.strip()]
        return v

    def cors_origins(self) -> List[str]:
        """Return CORS origins as a list."""
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


# Global settings instance
settings = Settings()
