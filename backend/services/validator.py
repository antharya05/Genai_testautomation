import logging
from sys import modules

logger = logging.getLogger(__name__)

VALID_ASIL = {"QM", "A", "B", "C", "D"}
VALID_TEST_TYPES = {
    "functional", "boundary", "negative",
    "fault_injection", "timing", "safety", "recovery", "stress"
}


def repair(raw: dict, fallback_req_id: str = "REQ_UNKNOWN", tc_index: int = 1) -> dict:
    if not raw.get("test_id"):
        raw["test_id"] = f"TC_{tc_index:03d}"
    if not raw.get("requirement_id"):
        raw["requirement_id"] = fallback_req_id
    if raw.get("asil") not in VALID_ASIL:
        raw["asil"] = "QM"
    if raw.get("test_type") not in VALID_TEST_TYPES:
        raw["test_type"] = "functional"

    bp = str(raw.get("boundary_position", "")).strip().lower()
    raw["boundary_position"] = bp if bp in {"below", "at", "above"} else ""

    for field in ("preconditions", "steps", "expected_results"):
        val = raw.get(field)
        if isinstance(val, str):
            raw[field] = [val]
        elif not isinstance(val, list):
            raw[field] = []
        raw[field] = [str(s).strip() for s in raw[field] if str(s).strip()]

    if not raw["steps"]:
        raw["steps"] = ["Execute the test procedure as defined in the requirement specification."]
    if not raw["expected_results"]:
        raw["expected_results"] = ["System behaves in accordance with the requirement specification."]
    if not raw.get("title", "").strip():
        raw["title"] = f"Test case for {raw['requirement_id']}"

    return raw


def validate_batch(
    raw_list: list[dict],
    req_id: str = "REQ_UNKNOWN",
    offset: int = 0,
) -> tuple[list, list[str]]:
    # Import here to avoid circular at module load
    from models import TestCase

    valid: list[TestCase] = []
    warnings: list[str] = []

    for i, raw in enumerate(raw_list):
        try:
            repaired = repair(raw, fallback_req_id=req_id, tc_index=offset + i + 1)
            tc = TestCase(**repaired)
            valid.append(tc)
        except Exception as exc:
            msg = f"Dropped test case #{i}: {exc}"
            warnings.append(msg)
            logger.warning(msg)

    return valid, warnings


def validate_coverage(cases: list, meta: dict) -> dict:
    """
    Post-generation coverage validation for one requirement's test cases.

    Checks (non-destructive — produces warnings, never drops cases):
      1. Requirement ID preservation — every case carries the extracted id.
      2. Boundary coverage — when the requirement has numeric thresholds, the
         below/at/above positions should all be present.
      3. Test-type diversity — more than one test type generated.
      4. Hallucinated values — numeric/CAN-id tokens in the generated text that
         do not appear in the requirement. Flagged cases get
         validation_status="warning" and per-case coverage_warnings.

    Returns a report dict suitable for logging / surfacing to the UI.
    Mutates each affected TestCase in place.
    """
    from services import requirement_analyzer as analyzer

    report = {
        "requirement_id": meta.get("requirement_id", "REQ_UNKNOWN"),
        "requirement_id_preserved": True,
        "boundary_coverage": None,
        "test_types": [],
        "hallucinated_values": [],
        "warnings": [],
    }

    if not cases:
        report["warnings"].append("No valid test cases generated for requirement")
        return report

    # 1. Requirement ID preservation
    rid = meta.get("requirement_id", "REQ_UNKNOWN")
    if rid and rid != "REQ_UNKNOWN":
        mismatched = [c for c in cases if c.requirement_id != rid]
        if mismatched:
            report["requirement_id_preserved"] = False
            report["warnings"].append(
                f"{len(mismatched)} test case(s) not tagged with requirement id {rid}"
            )

    # 2. Boundary coverage — only meaningful when numeric thresholds exist
    thresholded = [t for t in meta.get("thresholds", []) if t.get("unit")]
    if thresholded:
        positions = {c.boundary_position for c in cases if c.boundary_position}
        missing = [p for p in ("below", "at", "above") if p not in positions]
        report["boundary_coverage"] = {
            "present": sorted(positions),
            "missing": missing,
        }
        if missing:
            report["warnings"].append(
                f"Incomplete boundary coverage — missing: {', '.join(missing)}"
            )

    # 3. Test-type diversity
    report["test_types"] = sorted({c.test_type for c in cases})
    if len(report["test_types"]) < 2:
        report["warnings"].append("Low test-type diversity (only one test type generated)")

    # 4. Hallucinated numeric / CAN-id values
    allowed = meta.get("numeric_tokens") or set()
    for c in cases:
        text = " ".join(c.steps + c.expected_results + c.preconditions)
        extras = sorted(analyzer.numeric_tokens(text) - allowed)
        if extras:
            c.validation_status = "warning"
            c.coverage_warnings = [f"Value not stated in requirement: {e}" for e in extras]
            report["hallucinated_values"].extend(extras)

    report["hallucinated_values"] = sorted(set(report["hallucinated_values"]))
    if report["hallucinated_values"]:
        report["warnings"].append(
            f"Possible invented values: {', '.join(report['hallucinated_values'])}"
        )

    return report
