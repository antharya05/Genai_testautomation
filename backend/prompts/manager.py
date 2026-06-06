from .v1.generate_test_cases import SYSTEM_PROMPT as _PROMPT_V1_GENERATE

CURRENT_VERSION = "v1"

_REGISTRY: dict[str, dict[str, str]] = {
    "v1": {
        "generate": _PROMPT_V1_GENERATE,
    },
}


def get_prompt(name: str, version: str = CURRENT_VERSION) -> str:
    registry = _REGISTRY.get(version)
    if not registry:
        raise ValueError(f"Unknown prompt version: {version}")
    prompt = registry.get(name)
    if not prompt:
        raise ValueError(f"Unknown prompt name '{name}' in version {version}")
    return prompt


def get_current_version() -> str:
    return CURRENT_VERSION
