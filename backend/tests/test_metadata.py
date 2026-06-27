"""Deterministic metadata extraction (requirement_analyzer)."""

from services import requirement_analyzer as analyzer


def test_extract_requirement_id_prefixes():
    assert analyzer.extract_requirement_id("REQ_007: do x") == "REQ_007"
    assert analyzer.extract_requirement_id("FR-12 something") == "FR-12"
    assert analyzer.extract_requirement_id("no id here") == "REQ_UNKNOWN"


def test_extract_metadata_values_and_units():
    meta = analyzer.extract_metadata(
        "REQ_007: brake within 150 ms, voltage up to 400 V using CAN_Signal"
    )
    assert meta["requirement_id"] == "REQ_007"
    assert "150ms" in meta["numeric_tokens"]
    assert "400v" in meta["numeric_tokens"]
    raws = {v["raw"] for v in meta["values"]}
    assert "150ms" in raws and "400V" in raws


def test_thresholds_carry_operators():
    meta = analyzer.extract_metadata("REQ_010: voltage shall be at least 12 V")
    ops = {t["operator"] for t in meta["thresholds"] if t["unit"]}
    assert ">=" in ops  # "at least" → >=


def test_timings_are_time_units_only():
    meta = analyzer.extract_metadata("REQ_011: respond within 50 ms at 400 V")
    timing_units = {t["unit"] for t in meta["timings"]}
    assert "ms" in timing_units
    assert "V" not in timing_units


def test_entities_extracted_and_id_excluded():
    meta = analyzer.extract_metadata("REQ_012: set Brake_Signal on CAN bus 0x18FF50E5")
    assert any("Brake_Signal" == e or e == "CAN" for e in meta["entities"])
    assert "0x18ff50e5" in meta["numeric_tokens"]
    assert "REQ_012" not in meta["entities"]


def test_numeric_tokens_normalise_spacing():
    # The unit regex is case-sensitive, but spacing between value and unit is not.
    assert analyzer.numeric_tokens("150 ms") == analyzer.numeric_tokens("150ms") == {"150ms"}


def test_format_metadata_block_mentions_id_and_facts():
    meta = analyzer.extract_metadata("REQ_013: brake within 150 ms")
    block = analyzer.format_metadata_block(meta)
    assert "REQUIREMENT FACTS" in block
    assert "REQ_013" in block


def test_parsed_overlay_is_authoritative():
    parsed = {
        "requirement_id": "REQ_099",
        "statement": "limit torque",
        "description": "",
        "test_focus": "",
        "asil": "D",
        "category": "safety",
        "entities": ["Torque_Cmd"],
        "units": [],
        "logical_operators": [],
        "timing_constraints": ["50 ms"],
    }
    meta = analyzer.extract_metadata("REQ_099: limit torque", parsed=parsed)
    assert meta["requirement_id"] == "REQ_099"
    assert meta["asil"] == "D"
    assert meta["asil_source"] == "requirement"
    assert meta["category"] == "safety"
    assert "Torque_Cmd" in meta["entities"]
    assert "50 ms" in meta["timing_constraints"]
