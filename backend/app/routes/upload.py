"""
File upload and text processing routes.
"""

import logging
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from ..services.pdf_service import pdf_service
from ..services.parser_service import parser_service

logger = logging.getLogger(__name__)
router = APIRouter()

@router.post("/upload")
async def upload_report(
    file: Optional[UploadFile] = File(None),
    text_content: Optional[str] = Form(None),
):
    """
    Upload a lab report file (PDF or text) or provide raw text content.
    Returns extracted text for downstream parsing.
    """
    try:
        if not file and not text_content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either file upload or text content must be provided",
            )

        extracted_text = ""

        if file:
            logger.info(f"Processing uploaded file: {file.filename}")

            # Validate file type
            if file.content_type not in ("application/pdf", "text/plain"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only PDF and text files are supported",
                )

            # Validate file size (10 MB max)
            content = await file.read()
            if len(content) > 10 * 1024 * 1024:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="File size must be under 10MB",
                )

            # Extract text
            if file.content_type == "application/pdf":
                extracted_text = pdf_service.extract_text_from_pdf(content)
            else:
                extracted_text = content.decode("utf-8", errors="replace")

            logger.info(f"Extracted {len(extracted_text)} characters from file")

        elif text_content:
            logger.info("Processing text content")
            extracted_text = text_content.strip()

        if not extracted_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No text content could be extracted from the input",
            )

        return {
            "status": "success",
            "content": extracted_text,
            "content_length": len(extracted_text),
            "source": "file" if file else "text",
        }

    except HTTPException:
        raise
    except RuntimeError as e:
        logger.error(f"Upload processing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )
    except Exception as e:
        logger.error(f"Upload processing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process upload: {e}",
        )

@router.post("/parse")
async def parse_report(payload: dict):
    """
    Parse lab report text and return structured tests.
    Expected payload: {"content": "<raw text>"}
    """
    try:
        text_content = (payload or {}).get("content", "")
        if not text_content or not isinstance(text_content, str) or not text_content.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Content field is required and cannot be empty",
            )

        logger.info("Starting report parsing")
        parsed_tests = parser_service.parse_report_text(text_content)

        if not parsed_tests:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=("No lab test data could be extracted from the content. "
                        "Ensure the report contains recognizable lab values."),
            )

        tests_data = [
            {
                "name": t.name,
                "value": t.value,
                "unit": t.unit,
                "reference_range": t.reference_range,
            }
            for t in parsed_tests
        ]

        logger.info(f"Successfully parsed {len(tests_data)} tests")

        return {
            "status": "success",
            "tests": tests_data,
            "test_count": len(tests_data),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report parsing failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse report: {e}",
        )
