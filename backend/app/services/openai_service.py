"""
OpenAI service for generating lab report interpretations.
"""
import asyncio
import logging
from typing import List, Optional
from openai import OpenAI
from ..models import LabTest
from ..config import settings

logger = logging.getLogger(__name__)


class OpenAIService:
    """Service for interacting with OpenAI API."""
    
    def __init__(self):
        """Initialize OpenAI client."""
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model
        self.max_tokens = settings.openai_max_tokens
        self.temperature = settings.openai_temperature
        self.request_timeout = settings.openai_timeout
    
    def create_interpretation_prompt(self, tests: List[LabTest], patient_context: Optional[str] = None) -> str:
        """
        Create a structured prompt for OpenAI to interpret lab results.
        
        Args:
            tests: List of lab tests to interpret
            patient_context: Optional patient context information
            
        Returns:
            Formatted prompt string
        """
        prompt = """You are a medical AI assistant helping patients understand their lab results. 
Provide clear, educational explanations in plain language while emphasizing that this is not medical advice.

IMPORTANT GUIDELINES:
- Use simple, non-technical language that patients can understand
- Explain what each test measures and why it's important
- Clearly indicate if values are normal, high, or low
- For abnormal values, explain possible causes and suggest follow-up
- Always include disclaimers about consulting healthcare providers
- Be encouraging and supportive in tone
- Focus on education, not diagnosis

"""
        
        if patient_context:
            prompt += f"PATIENT CONTEXT: {patient_context}\n\n"
        
        prompt += "LAB RESULTS TO INTERPRET:\n\n"
        
        for i, test in enumerate(tests, 1):
            # Determine if value is within normal range (basic logic)
            status = self._determine_test_status(test)
            
            prompt += f"{i}. {test.name}\n"
            prompt += f"   Your Value: {test.value} {test.unit}\n"
            prompt += f"   Reference Range: {test.reference_range} {test.unit}\n"
            prompt += f"   Status: {status}\n\n"
        
        prompt += """Please provide a comprehensive interpretation that includes:

1. **Overall Assessment**: A brief summary of the results
2. **Individual Test Explanations**: For each test, explain:
   - What this test measures
   - What your specific result means
   - Whether it's normal or needs attention
3. **Key Takeaways**: Important points to remember
4. **Next Steps**: What to discuss with your healthcare provider

Format your response in clear sections with headers. Use bullet points where helpful.
Always end with a disclaimer about consulting healthcare professionals."""

        return prompt
    
    def _determine_test_status(self, test: LabTest) -> str:
        """
        Basic logic to determine if a test value is normal, high, or low.
        This is a simplified implementation - in production, you'd want more sophisticated parsing.
        """
        try:
            # Try to parse reference range (assumes format like "12.0 - 15.5" or "12.0-15.5")
            range_str = test.reference_range.replace(" ", "")
            if "-" in range_str:
                parts = range_str.split("-")
                if len(parts) == 2:
                    low = float(parts[0])
                    high = float(parts[1])
                    
                    if test.value < low:
                        return "LOW"
                    elif test.value > high:
                        return "HIGH"
                    else:
                        return "NORMAL"
        except (ValueError, IndexError):
            # If parsing fails, return unknown
            pass
        
        return "NEEDS_REVIEW"
    
    async def interpret_lab_results(self, tests: List[LabTest], patient_context: Optional[str] = None) -> str:
        """
        Generate interpretation for lab results using OpenAI.
        
        Args:
            tests: List of lab tests to interpret
            patient_context: Optional patient context
            
        Returns:
            AI-generated interpretation
            
        Raises:
            Exception: If OpenAI API call fails
        """
        try:
            prompt = self.create_interpretation_prompt(tests, patient_context)

            logger.info(f"Sending interpretation request for {len(tests)} tests to OpenAI")

            try:
                response = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.client.chat.completions.create,
                        model=self.model,
                        messages=[
                            {
                                "role": "system",
                                "content": "You are a helpful medical AI assistant that explains lab results in simple, educational language. Always emphasize that your explanations are for educational purposes only and not a substitute for professional medical advice.",
                            },
                            {
                                "role": "user",
                                "content": prompt,
                            },
                        ],
                        max_tokens=self.max_tokens,
                        temperature=self.temperature,
                    ),
                    timeout=self.request_timeout,
                )
            except asyncio.TimeoutError:
                logger.error("OpenAI request timed out")
                raise Exception("OpenAI request timed out")

            interpretation = response.choices[0].message.content

            if not interpretation:
                raise Exception("Empty response from OpenAI")

            logger.info("Successfully generated interpretation")
            return interpretation.strip()

        except asyncio.CancelledError:
            logger.warning("OpenAI request was cancelled")
            raise
        except Exception as e:
            logger.error(f"OpenAI API error: {str(e)}")
            raise Exception(f"Failed to generate interpretation: {str(e)}")


# Global service instance
openai_service = OpenAIService()
