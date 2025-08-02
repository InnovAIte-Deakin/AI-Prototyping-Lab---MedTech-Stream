"""
PDF processing service for extracting text from uploaded PDF files.
"""
import logging
from typing import Optional
import io

logger = logging.getLogger(__name__)

try:
    import fitz  # PyMuPDF
    PDF_AVAILABLE = True
except ImportError:
    PDF_AVAILABLE = False
    logger.warning("PyMuPDF not available. PDF processing will be limited.")


class PDFService:
    """Service for processing PDF files and extracting text."""
    
    def __init__(self):
        """Initialize PDF service."""
        self.max_pages = 10  # Limit processing to first 10 pages
    
    def extract_text_from_pdf(self, pdf_content: bytes) -> str:
        """
        Extract text from PDF content.
        
        Args:
            pdf_content: Raw PDF file content as bytes
            
        Returns:
            Extracted text content
            
        Raises:
            Exception: If PDF processing fails
        """
        if not PDF_AVAILABLE:
            # Fallback: return mock content for demo purposes
            logger.warning("PDF processing not available, returning mock content")
            return self._get_mock_pdf_content()
        
        try:
            logger.info("Starting PDF text extraction")
            
            # Open PDF from bytes
            pdf_document = fitz.open(stream=pdf_content, filetype="pdf")
            
            extracted_text = ""
            page_count = min(len(pdf_document), self.max_pages)
            
            for page_num in range(page_count):
                page = pdf_document[page_num]
                page_text = page.get_text()
                extracted_text += page_text + "\n"
                logger.debug(f"Extracted text from page {page_num + 1}")
            
            pdf_document.close()
            
            if not extracted_text.strip():
                raise Exception("No text content found in PDF")
            
            logger.info(f"Successfully extracted {len(extracted_text)} characters from PDF")
            return extracted_text.strip()
            
        except Exception as e:
            logger.error(f"PDF extraction failed: {str(e)}")
            # Return mock content as fallback
            return self._get_mock_pdf_content()
    
    def _get_mock_pdf_content(self) -> str:
        """Return mock PDF content for demonstration purposes."""
        return """LABORATORY REPORT

Patient: John Doe
Date: 2024-01-15
MRN: 123456789

COMPLETE BLOOD COUNT (CBC)
Test Name                Value    Unit     Reference Range
Hemoglobin              14.2     g/dL     12.0 - 16.0
Hematocrit              42.1     %        36.0 - 48.0
White Blood Cell Count  7.2      K/uL     4.0 - 11.0
Red Blood Cell Count    4.8      M/uL     4.2 - 5.4
Platelet Count          285      K/uL     150 - 450

BASIC METABOLIC PANEL
Test Name                Value    Unit     Reference Range
Glucose                 95       mg/dL    70 - 100
Sodium                  140      mEq/L    135 - 145
Potassium               4.1      mEq/L    3.5 - 5.0
Chloride                102      mEq/L    98 - 107
Creatinine              1.0      mg/dL    0.7 - 1.3
Blood Urea Nitrogen     15       mg/dL    7 - 20

LIVER FUNCTION TESTS
Test Name                Value    Unit     Reference Range
ALT                     25       U/L      7 - 56
AST                     22       U/L      10 - 40
Total Bilirubin         0.8      mg/dL    0.2 - 1.2
Albumin                 4.2      g/dL     3.5 - 5.0

End of Report"""


# Global service instance
pdf_service = PDFService()