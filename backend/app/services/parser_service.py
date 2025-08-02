"""
Lab report parsing service for extracting structured test data.
"""
import re
import logging
from typing import List, Dict, Any, Optional
from ..models import LabTest

logger = logging.getLogger(__name__)


class ReportParserService:
    """Service for parsing lab reports and extracting test data."""
    
    def __init__(self):
        """Initialize parser with common test patterns."""
        # Common lab test patterns with variations
        self.test_patterns = {
            # Complete Blood Count (CBC)
            'hemoglobin': r'(?:hemoglobin|hgb|hb)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            'hematocrit': r'(?:hematocrit|hct)[\s:]*(\d+\.?\d*)\s*([%a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            'wbc': r'(?:white blood cell|wbc|leukocyte)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            'rbc': r'(?:red blood cell|rbc|erythrocyte)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            'platelet': r'(?:platelet|plt)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            
            # Basic Metabolic Panel
            'glucose': r'(?:glucose|blood sugar)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            'sodium': r'(?:sodium|na)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            'potassium': r'(?:potassium|k)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            'chloride': r'(?:chloride|cl)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            'creatinine': r'(?:creatinine|creat)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            'bun': r'(?:blood urea nitrogen|bun|urea)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            
            # Liver Function Tests
            'alt': r'(?:alanine aminotransferase|alt|sgpt)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            'ast': r'(?:aspartate aminotransferase|ast|sgot)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            'bilirubin': r'(?:total bilirubin|bilirubin|bili)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
            'albumin': r'(?:albumin|alb)[\s:]*(\d+\.?\d*)\s*([a-zA-Z/]+)?\s*(?:ref|reference|normal)?[\s:]*(\d+\.?\d*\s*[-–]\s*\d+\.?\d*)',
        }
    
    def parse_report_text(self, text: str) -> List[LabTest]:
        """
        Parse lab report text and extract structured test data.
        
        Args:
            text: Raw lab report text
            
        Returns:
            List of LabTest objects
        """
        logger.info("Starting report parsing")
        
        # Clean and normalize text
        normalized_text = self._normalize_text(text)
        
        # Extract tests using patterns
        extracted_tests = []
        
        for test_name, pattern in self.test_patterns.items():
            matches = re.finditer(pattern, normalized_text, re.IGNORECASE | re.MULTILINE)
            
            for match in matches:
                try:
                    value = float(match.group(1))
                    unit = match.group(2) if match.group(2) else self._get_default_unit(test_name)
                    reference_range = match.group(3) if match.group(3) else self._get_default_range(test_name)
                    
                    # Clean up unit and reference range
                    unit = self._clean_unit(unit)
                    reference_range = self._clean_reference_range(reference_range)
                    
                    lab_test = LabTest(
                        name=self._format_test_name(test_name),
                        value=value,
                        unit=unit,
                        reference_range=reference_range
                    )
                    
                    extracted_tests.append(lab_test)
                    logger.debug(f"Extracted test: {lab_test.name} = {lab_test.value} {lab_test.unit}")
                    
                except (ValueError, IndexError) as e:
                    logger.warning(f"Failed to parse test {test_name}: {e}")
                    continue
        
        # Remove duplicates (keep first occurrence)
        unique_tests = []
        seen_names = set()
        
        for test in extracted_tests:
            if test.name not in seen_names:
                unique_tests.append(test)
                seen_names.add(test.name)
        
        logger.info(f"Successfully parsed {len(unique_tests)} unique tests")
        return unique_tests
    
    def _normalize_text(self, text: str) -> str:
        """Normalize text for better pattern matching."""
        # Convert to lowercase for pattern matching
        text = text.lower()
        
        # Replace common separators
        text = re.sub(r'[:\-–—]+', ':', text)
        
        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text)
        
        return text
    
    def _get_default_unit(self, test_name: str) -> str:
        """Get default unit for a test if not found in text."""
        unit_map = {
            'hemoglobin': 'g/dL',
            'hematocrit': '%',
            'wbc': 'K/uL',
            'rbc': 'M/uL',
            'platelet': 'K/uL',
            'glucose': 'mg/dL',
            'sodium': 'mEq/L',
            'potassium': 'mEq/L',
            'chloride': 'mEq/L',
            'creatinine': 'mg/dL',
            'bun': 'mg/dL',
            'alt': 'U/L',
            'ast': 'U/L',
            'bilirubin': 'mg/dL',
            'albumin': 'g/dL',
        }
        return unit_map.get(test_name, 'units')
    
    def _get_default_range(self, test_name: str) -> str:
        """Get default reference range for a test if not found in text."""
        range_map = {
            'hemoglobin': '12.0 - 16.0',
            'hematocrit': '36.0 - 48.0',
            'wbc': '4.0 - 11.0',
            'rbc': '4.2 - 5.4',
            'platelet': '150 - 450',
            'glucose': '70 - 100',
            'sodium': '135 - 145',
            'potassium': '3.5 - 5.0',
            'chloride': '98 - 107',
            'creatinine': '0.7 - 1.3',
            'bun': '7 - 20',
            'alt': '7 - 56',
            'ast': '10 - 40',
            'bilirubin': '0.2 - 1.2',
            'albumin': '3.5 - 5.0',
        }
        return range_map.get(test_name, '0 - 100')
    
    def _clean_unit(self, unit: str) -> str:
        """Clean and standardize unit strings."""
        if not unit:
            return 'units'
        
        # Remove extra characters and normalize
        unit = re.sub(r'[^\w/%]', '', unit)
        
        # Common unit mappings
        unit_mappings = {
            'gdl': 'g/dL',
            'mgdl': 'mg/dL',
            'meql': 'mEq/L',
            'ul': 'U/L',
            'kul': 'K/uL',
            'mul': 'M/uL',
        }
        
        return unit_mappings.get(unit.lower(), unit)
    
    def _clean_reference_range(self, range_str: str) -> str:
        """Clean and standardize reference range strings."""
        if not range_str:
            return '0 - 100'
        
        # Normalize separators
        range_str = re.sub(r'[–—]', '-', range_str)
        range_str = re.sub(r'\s+', ' ', range_str.strip())
        
        return range_str
    
    def _format_test_name(self, test_key: str) -> str:
        """Format test name for display."""
        name_map = {
            'hemoglobin': 'Hemoglobin',
            'hematocrit': 'Hematocrit',
            'wbc': 'White Blood Cell Count',
            'rbc': 'Red Blood Cell Count',
            'platelet': 'Platelet Count',
            'glucose': 'Glucose',
            'sodium': 'Sodium',
            'potassium': 'Potassium',
            'chloride': 'Chloride',
            'creatinine': 'Creatinine',
            'bun': 'Blood Urea Nitrogen',
            'alt': 'ALT (Alanine Aminotransferase)',
            'ast': 'AST (Aspartate Aminotransferase)',
            'bilirubin': 'Total Bilirubin',
            'albumin': 'Albumin',
        }
        return name_map.get(test_key, test_key.title())


# Global service instance
parser_service = ReportParserService()