import os
import re
import json

from dotenv import load_dotenv

load_dotenv()

PROVIDER          = os.getenv("PROVIDER", "anthropic").lower()   # anthropic | groq
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GROQ_API_KEY      = os.getenv("GROQ_API_KEY", "")

SYSTEM_PROMPT = """You are an automotive software test engineer with deep expertise in ISO 26262, ASIL classification, and AUTOSAR architecture.

Given a software requirement, generate comprehensive test cases as a JSON array.

Each test case must have exactly these fields:
- id: string like "TC_001"
- requirement_id: the requirement ID from the text (e.g. "REQ_001") or "REQ_UNKNOWN"
- title: concise, descriptive test case title
- test_type: one of "functional", "boundary", "fault_injection", "regression"
- asil_level: one of "QM", "ASIL-A", "ASIL-B", "ASIL-C", "ASIL-D"
- preconditions: array of prerequisite strings
- steps: array of test step strings (be specific)
- expected_result: what should happen
- priority: "High", "Medium", or "Low"

Return ONLY a valid JSON array. No markdown, no explanation, no extra text."""


def generate_test_cases(requirements: list[str]) -> list[dict]:
    if PROVIDER == "groq":
        return _groq_generate(requirements)
    return _anthropic_generate(requirements)


def _parse_llm_response(content: str) -> list[dict]:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```\w*\n?", "", content)
        content = re.sub(r"\n?```$", "", content)
    return json.loads(content)


def _groq_generate(requirements: list[str]) -> list[dict]:
    from groq import Groq

    client    = Groq(api_key=GROQ_API_KEY)
    all_cases = []
    tc_offset = 1

    for req in requirements:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": f"Generate test cases for this requirement:\n\n{req}"}
            ],
            temperature=0.3,
            max_tokens=2048,
        )

        content = response.choices[0].message.content
        cases   = _parse_llm_response(content)

        if isinstance(cases, list):
            for tc in cases:
                tc["id"] = f"TC_{tc_offset:03d}"
                tc_offset += 1
            all_cases.extend(cases)

    return all_cases


def _anthropic_generate(requirements: list[str]) -> list[dict]:
    import anthropic

    client    = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    all_cases = []
    tc_offset = 1

    for req in requirements:
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=[{
                "role":    "user",
                "content": f"Generate test cases for this requirement:\n\n{req}"
            }]
        )

        content = message.content[0].text
        cases   = _parse_llm_response(content)

        if isinstance(cases, list):
            for tc in cases:
                tc["id"] = f"TC_{tc_offset:03d}"
                tc_offset += 1
            all_cases.extend(cases)

    return all_cases
