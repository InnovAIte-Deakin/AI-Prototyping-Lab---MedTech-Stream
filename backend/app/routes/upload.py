"""
File upload and text processing routes.
"""
import logging
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from fastapi.responses import JSONResponse
from typing import Optional
from ..models import ErrorResponse
from ..services.pdf_service import pdf_service
from ..services.parser_service import parser_service

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/upload")
async def upload_report(
    file: Optional[UploadFile] = File(None),
    text_content: Optional[str] = Form(None)
):
    """
    Upload a lab report file or accept text content.
    
    Accepts either a PDF file upload or plain text content.
    Returns the extracted text content for further processing.
    """
    # CORS is handled globally by CORSMiddleware. No need to stuff headers into JSON body.
    
    try:
        if not file and not text_content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either file upload or text content must be provided"
            )
        
        extracted_text = ""
        
        if file:
            logger.info(f"Processing uploaded file: {file.filename}")
            
            # Validate file type
            if file.content_type not in ["application/pdf", "text/plain"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Only PDF and text files are supported"
                )
            
            # Validate file size (5MB max)
            content = await file.read()
            if len(content) > 5 * 1024 * 1024:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="File size must be under 5MB"
                )
            
            # Extract text based on file type
            if file.content_type == "application/pdf":
                extracted_text = pdf_service.extract_text_from_pdf(content)
            else:
                extracted_text = content.decode('utf-8')
            
            logger.info(f"Successfully extracted {len(extracted_text)} characters from file")
        
        elif text_content:
            logger.info("Processing text content")
            extracted_text = text_content.strip()
        
        if not extracted_text:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No text content could be extracted from the input"
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
        logger.error(f"Upload processing failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Upload processing failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process upload: {str(e)}"
        )


@router.post("/parse")
async def parse_report(content: dict):
    """
    Parse lab report content and extract structured test data.
    
    Accepts raw text content and returns structured lab test data.
    """
    try:
        if "content" not in content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Content field is required"
            )
        
        text_content = content["content"]
        if not text_content or not text_content.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Content cannot be empty"
            )
        
        logger.info("Starting report parsing")
        
        # Parse the report content
        parsed_tests = parser_service.parse_report_text(text_content)
        
        if not parsed_tests:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No lab test data could be extracted from the content. Please ensure the report contains recognizable lab values."
            )
        
        # Convert to dict format for JSON response
        tests_data = []
        for test in parsed_tests:
            tests_data.append({
                "name": test.name,
                "value": test.value,
                "unit": test.unit,
                "reference_range": test.reference_range
            })
        
        logger.info(f"Successfully parsed {len(tests_data)} tests")
        
        return {
            "status": "success",
            "tests": tests_data,
            "test_count": len(tests_data)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Report parsing failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to parse report: {str(e)}"
        )
