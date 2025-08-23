"""
Pydantic models for request/response validation.
"""
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


class LabTest(BaseModel):
    """Individual lab test data model."""
    name: str = Field(..., description="Name of the lab test")
    value: float = Field(..., description="Numeric value of the test result")
    unit: str = Field(..., description="Unit of measurement")
    reference_range: str = Field(..., description="Normal reference range")
    
    @field_validator('name')
    def validate_name(cls, v):
        if not v or not v.strip():
            raise ValueError('Test name cannot be empty')
        return v.strip()

    @field_validator('unit')
    def validate_unit(cls, v):
        if not v or not v.strip():
            raise ValueError('Unit cannot be empty')
        return v.strip()

    @field_validator('reference_range')
    def validate_reference_range(cls, v):
        if not v or not v.strip():
            raise ValueError('Reference range cannot be empty')
        return v.strip()


class InterpretReportRequest(BaseModel):
    """Request model for lab report interpretation."""
    tests: List[LabTest] = Field(..., min_length=1, description="List of lab tests to interpret")
    patient_context: Optional[str] = Field(None, description="Additional patient context (age, gender, etc.)")
    
    @field_validator('tests')
    def validate_tests(cls, v):
        if not v:
            raise ValueError('At least one test must be provided')
        return v


class InterpretReportResponse(BaseModel):
    """Response model for lab report interpretation."""
    interpretation: str = Field(..., description="AI-generated interpretation of the lab results")
    status: str = Field(default="success", description="Response status")
    test_count: int = Field(..., description="Number of tests interpreted")


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str = Field(..., description="Error message")
    status: str = Field(default="error", description="Response status")
    details: Optional[str] = Field(None, description="Additional error details")