from typing import Optional
from pydantic import BaseModel, field_validator

VALID_ASIL = {"QM", "A", "B", "C", "D"}
VALID_TEST_TYPES = {
    "functional", "boundary", "negative",
    "fault_injection", "timing", "safety", "recovery", "stress"
}


class TestCase(BaseModel):
    test_id: str = ""
    requirement_id: str = "REQ_UNKNOWN"
    title: str
    asil: str = "QM"
    test_type: str = "functional"
    preconditions: list[str] = []
    steps: list[str]
    expected_results: list[str]
    # Audit metadata
    source_requirement_text: str = ""
    generation_timestamp: str = ""
    model_version: str = ""
    prompt_version: str = "v1"
    retry_count: int = 0
    validation_status: str = "valid"
    # RAG attribution
    rag_sources: list[str] = []
    rag_top_score: float = 0.0

    @field_validator("asil")
    @classmethod
    def validate_asil(cls, v: str) -> str:
        return v if v in VALID_ASIL else "QM"

    @field_validator("test_type")
    @classmethod
    def validate_test_type(cls, v: str) -> str:
        return v if v in VALID_TEST_TYPES else "functional"

    @field_validator("title")
    @classmethod
    def title_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("title cannot be empty")
        return v.strip()

    @field_validator("steps")
    @classmethod
    def steps_not_empty(cls, v: list) -> list:
        cleaned = [s for s in v if s and str(s).strip()]
        if not cleaned:
            raise ValueError("steps cannot be empty")
        return cleaned

    @field_validator("expected_results")
    @classmethod
    def results_not_empty(cls, v: list) -> list:
        cleaned = [r for r in v if r and str(r).strip()]
        if not cleaned:
            raise ValueError("expected_results cannot be empty")
        return cleaned

    @field_validator("preconditions")
    @classmethod
    def preconditions_not_none(cls, v: list) -> list:
        return [p for p in (v or []) if p and str(p).strip()]


class GenerateRequest(BaseModel):
    requirements: list[str]
    project_id: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None


class ProviderKeyRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None
    endpoint: Optional[str] = None


class TextRequest(BaseModel):
    text: str


class ExportRequest(BaseModel):
    test_cases: list[TestCase]
    project_name: str = "automotive_project"


class JobStatus(BaseModel):
    job_id: str
    status: str
    current: int = 0
    total: int = 0
    test_cases: list[dict] = []
    rag_enabled: bool = False
    error: Optional[str] = None
