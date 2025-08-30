"""
OpenAI service for generating lab report interpretations.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Dict, List, Optional, Tuple

from openai import AsyncOpenAI
from openai import (
    APIError,
    AuthenticationError,
    BadRequestError,
    NotFoundError,
    RateLimitError,
)

from ..config import settings
from ..models import LabTest

__all__ = ["OpenAIService", "openai_service"]

logger = logging.getLogger(__name__)

# Minimal tokens used for a short retry if the first response hits the length limit
_MIN_SHORT_RETRY_TOKENS = 256


class OpenAIService:
    """Service for interacting with the OpenAI API (async)."""

    def __init__(self) -> None:
        """Initialize OpenAI client and model settings."""
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model: str = settings.openai_model
        self.max_tokens: int = settings.openai_max_tokens
        self.temperature: float = settings.openai_temperature
        self.request_timeout: int = settings.openai_timeout
        self.fallback_models: List[str] = list(settings.openai_fallback_models)

    # --------------------------
    # Prompt construction
    # --------------------------
    def create_interpretation_prompt(
        self,
        tests: List[LabTest],
        patient_context: Optional[str] = None,
    ) -> str:
        """
        Create a structured prompt for OpenAI to interpret lab results.

        Args:
            tests: List of LabTest items to interpret.
            patient_context: Optional free-text patient context.

        Returns:
            Formatted prompt string suitable for a user message.
        """
        prompt = (
            "You are a medical explainer for laypeople. Provide clear, educational "
            "explanations and emphasize that this is not medical advice.\n\n"
            "GUIDELINES:\n"
            "- Use simple language that non-clinicians can understand.\n"
            "- Explain what each test measures and why it matters.\n"
            "- Indicate whether values are normal, high, or low.\n"
            "- For abnormal values, outline common causes and sensible follow-ups.\n"
            "- Include a brief disclaimer to consult a healthcare professional.\n"
            "- Keep an encouraging, neutral tone. Focus on education, not diagnosis.\n\n"
        )

        if patient_context:
            prompt += f"PATIENT CONTEXT: {patient_context}\n\n"

        prompt += "LAB RESULTS TO INTERPRET:\n\n"

        for i, test in enumerate(tests, start=1):
            status = self._determine_test_status(test)
            prompt += (
                f"{i}. {test.name}\n"
                f"   Your Value: {test.value} {test.unit}\n"
                f"   Reference Range: {test.reference_range}\n"
                f"   Status: {status}\n\n"
            )

        prompt += (
            "Please provide a structured interpretation that includes:\n\n"
            "1. Overall Assessment: a short summary of the results.\n"
            "2. Individual Test Explanations: for each test, explain what it measures, "
            "   what the specific value means versus the reference range, and whether it needs attention.\n"
            "3. Key Takeaways: the most important points to remember.\n"
            "4. Next Steps: what to discuss with a healthcare provider.\n\n"
            "Use short sections with headers and bullets where helpful. End with a brief disclaimer."
        )

        return prompt

    # --------------------------
    # Helpers
    # --------------------------
    def _parse_reference_range(self, ref: str) -> Optional[Tuple[float, float]]:
        """
        Parse a numeric reference range from a string.

        Supports forms like:
          - '12.0 - 15.5'
          - '12.0–15.5' (en dash)
          - '12-15'
        Returns (low, high) if parsed, otherwise None.
        """
        if not ref:
            return None

        # Normalize unicode dashes and strip units/commas
        cleaned = ref.replace("–", "-").replace("—", "-").replace(",", " ")
        # Find first 'a - b' numeric pattern
        match = re.search(
            r"(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)", cleaned
        )
        if not match:
            return None

        try:
            low = float(match.group(1))
            high = float(match.group(2))
            if low > high:
                low, high = high, low
            return low, high
        except ValueError:
            return None

    def _determine_test_status(self, test: LabTest) -> str:
        """
        Basic logic to determine if a test value is NORMAL, HIGH, or LOW.

        This is intentionally simple; production code should consider unit
        normalization, age/sex, and lab-specific reference intervals.
        """
        rng = self._parse_reference_range(test.reference_range or "")
        try:
            value = float(test.value)
        except (TypeError, ValueError):
            return "NEEDS_REVIEW"

        if rng:
            low, high = rng
            if value < low:
                return "LOW"
            if value > high:
                return "HIGH"
            return "NORMAL"

        return "NEEDS_REVIEW"

    async def _complete_once(self, model: str, messages: List[Dict[str, str]]) -> str:
        """
        Perform a single completion call with timeout handling.
        Retries once with fewer tokens if the finish_reason is 'length'.
        """
        resp = await asyncio.wait_for(
            self.client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            ),
            timeout=self.request_timeout,
        )

        choice = resp.choices[0]
        text = (choice.message.content or "").strip()

        if choice.finish_reason == "length":
            # One shorter retry to finish the thought
            resp2 = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=self.temperature,
                    max_tokens=max(_MIN_SHORT_RETRY_TOKENS, int(self.max_tokens * 0.75)),
                ),
                timeout=self.request_timeout,
            )
            text = (resp2.choices[0].message.content or "").strip() or text

        return text

    async def _complete_with_fallback(
        self, messages: List[Dict[str, str]]
    ) -> str:
        """
        Try the primary model followed by configured fallbacks.
        Returns the first successful text or raises an Exception with a summary.
        """
        errors: List[str] = []
        models: List[str] = [self.model, *self.fallback_models]

        for m in models:
            try:
                return await self._complete_once(m, messages)
            except (NotFoundError, BadRequestError) as e:
                # Model missing/inaccessible or bad request: try the next model
                logger.error("Model '%s' failed: %s", m, e)
                errors.append(f"{m}: {type(e).__name__}")
                continue
            except (AuthenticationError, RateLimitError, APIError, asyncio.TimeoutError) as e:
                # Transient or account issues: log and try next model
                logger.error("OpenAI error on '%s': %s", m, e)
                errors.append(f"{m}: {type(e).__name__}")
                continue
            except Exception as e:  # safeguard
                logger.error("Unexpected OpenAI error on '%s': %s", m, e)
                errors.append(f"{m}: {type(e).__name__}")
                continue

        raise Exception(f"All models failed: {', '.join(errors)}")

    # --------------------------
    # Public API
    # --------------------------
    async def interpret_lab_results(
        self,
        tests: List[LabTest],
        patient_context: Optional[str] = None,
    ) -> str:
        """
        Generate a patient-friendly interpretation for the supplied lab tests.
        """
        try:
            prompt = self.create_interpretation_prompt(tests, patient_context)
            logger.info("Sending interpretation request for %d tests to OpenAI", len(tests))

            messages: List[Dict[str, str]] = [
                {
                    "role": "system",
                    "content": (
                        "You are a medical explainer for laypeople. Explain what each test measures, "
                        "what the result means versus the reference range, and when to talk to a GP. "
                        "Do not diagnose or prescribe. Be concise and educational."
                    ),
                },
                {"role": "user", "content": prompt},
            ]

            interpretation = await self._complete_with_fallback(messages)
            if not interpretation:
                raise Exception("Empty response from OpenAI")

            logger.info("Successfully generated interpretation")
            return interpretation.strip()

        except asyncio.CancelledError:
            logger.warning("OpenAI request was cancelled")
            raise
        except Exception as e:
            logger.error("OpenAI API error: %s", e)
            raise Exception(f"Failed to generate interpretation: {e}") from e

    async def ping(self) -> bool:
        """
        Minimal readiness probe for the current primary model.
        Returns True if the client responds to a trivial prompt.
        """
        try:
            resp = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=self.model,
                    messages=[{"role": "user", "content": "Reply with ok"}],
                    temperature=0,
                    max_tokens=2,
                ),
                timeout=max(5, int(self.request_timeout / 3)),
            )
            txt = (resp.choices[0].message.content or "").strip().lower()
            return txt.startswith("ok")
        except Exception as e:
            logger.error("OpenAI ping failed: %s", e)
            return False


# Global service instance
openai_service = OpenAIService()
