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
