"""Parser pipeline — deterministic extraction and the list[str] shim."""

from parsing import ParseResult, parse_requirements, parse_text

SAMPLE = (
    "REQ_001: The system shall apply the brake within 150 ms of obstacle detection.\n"
    "REQ_002: The battery voltage shall not exceed 400 V.\n"
    "REQ_003: When the door is open, the interior lamp shall switch on."
)


def test_parse_text_returns_parseresult():
    result = parse_text(SAMPLE)
    assert isinstance(result, ParseResult)
    assert len(result.requirements) >= 3
    assert isinstance(result.confidence, int)


def test_parse_text_extracts_requirement_ids():
    ids = [r.requirement_id for r in parse_text(SAMPLE).requirements]
    assert "REQ_001" in ids
    assert "REQ_002" in ids
    assert "REQ_003" in ids


def test_each_requirement_has_a_statement():
    for r in parse_text(SAMPLE).requirements:
        assert r.statement and r.statement.strip()


def test_parse_requirements_backward_compatible_shim():
    strings = parse_requirements(SAMPLE)
    assert isinstance(strings, list)
    assert all(isinstance(s, str) for s in strings)
    assert any("REQ_001" in s for s in strings)


def test_empty_input_yields_no_requirements():
    result = parse_text("")
    assert result.requirements == []


def test_as_strings_projection_matches_requirements():
    result = parse_text(SAMPLE)
    assert len(result.as_strings()) == len([r for r in result.requirements if r.as_text().strip()])
