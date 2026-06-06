import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.types import JSON

from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class Project(Base):
    __tablename__ = "projects"

    id = Column(String(36), primary_key=True, default=_uuid)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_run_at = Column(DateTime, nullable=True)


class Run(Base):
    __tablename__ = "runs"

    id = Column(String(36), primary_key=True)  # same as job_id
    project_id = Column(String(36), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="running")
    provider = Column(String(50), nullable=True)
    model = Column(String(100), nullable=True)
    requirement_count = Column(Integer, default=0)
    test_case_count = Column(Integer, default=0)
    rag_enabled = Column(Boolean, default=False)
    prompt_version = Column(String(20), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)
    # Coverage intelligence — stored for future dashboards, not yet surfaced in UI
    functional_count = Column(Integer, default=0)
    boundary_count = Column(Integer, default=0)
    negative_count = Column(Integer, default=0)
    fault_injection_count = Column(Integer, default=0)
    timing_count = Column(Integer, default=0)
    recovery_count = Column(Integer, default=0)
    safety_count = Column(Integer, default=0)


class Requirement(Base):
    __tablename__ = "requirements"

    id = Column(String(36), primary_key=True, default=_uuid)
    run_id = Column(String(36), nullable=False, index=True)
    text = Column(Text, nullable=False)
    requirement_id = Column(String(50), nullable=True)
    position = Column(Integer, nullable=False)


class TestCaseDB(Base):
    __tablename__ = "test_cases"

    id = Column(String(36), primary_key=True, default=_uuid)
    run_id = Column(String(36), nullable=False, index=True)
    test_id = Column(String(50), nullable=True)
    requirement_id = Column(String(50), nullable=True)
    title = Column(String(500), nullable=False)
    asil = Column(String(5), nullable=True)
    test_type = Column(String(50), nullable=True)
    preconditions = Column(JSON, nullable=True)
    steps = Column(JSON, nullable=True)
    expected_results = Column(JSON, nullable=True)
    source_requirement_text = Column(Text, nullable=True)
    generation_timestamp = Column(String(50), nullable=True)
    model_version = Column(String(100), nullable=True)
    prompt_version = Column(String(20), nullable=True)
    retry_count = Column(Integer, default=0)
    validation_status = Column(String(50), nullable=True)
    rag_sources = Column(JSON, nullable=True)
    rag_top_score = Column(Float, default=0.0)


class ProviderKey(Base):
    __tablename__ = "provider_keys"

    id = Column(String(36), primary_key=True, default=_uuid)
    provider = Column(String(50), nullable=False, unique=True, index=True)
    api_key = Column(Text, nullable=True)
    endpoint = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
