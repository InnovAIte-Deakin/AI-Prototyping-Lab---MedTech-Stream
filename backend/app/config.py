"""
Configuration management for ReportRx backend.
"""
import os
from typing import List, Union
from pydantic import field_validator


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # OpenAI Configuration
    openai_api_key: str
    # Default to a widely available model; override via OPENAI_MODEL
    openai_model: str = "gpt-5"
    openai_max_tokens: int = 2000
    openai_temperature: float = 0.3
    
    openai_timeout: int = 20
    # Comma-separated or JSON list of fallbacks, highest to lowest priority
    openai_fallback_models: List[str] = ["gpt-4.1", "gpt-4o"]
    
    # Server Configuration
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    
    # CORS Configuration
    allowed_origins: str = "http://localhost:3000,http://localhost:5173"
    
    class Config:
        env_file = ".env"
        case_sensitive = False
    
    @property
    def cors_origins(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        return [origin.strip() for origin in self.allowed_origins.split(",")]


    @field_validator("openai_fallback_models", mode="before")
    @classmethod
    def _parse_fallbacks(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            return [m.strip() for m in v.split(",") if m.strip()]
        return v


# Global settings instance
settings = Settings()
