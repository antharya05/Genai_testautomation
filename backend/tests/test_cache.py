"""Generation cache (SHA-256 keyed on requirement text + prompt version)."""

from services import cache


def test_set_get_roundtrip():
    cache.set("req text", "v1", [{"test_id": "TC_001"}])
    assert cache.get("req text", "v1") == [{"test_id": "TC_001"}]


def test_miss_returns_none():
    assert cache.get("never stored", "v1") is None


def test_version_is_part_of_key():
    cache.set("same text", "v1", [{"a": 1}])
    assert cache.get("same text", "v2") is None


def test_whitespace_normalised_in_key():
    cache.set("  trimmed  ", "v1", [{"x": 1}])
    assert cache.get("trimmed", "v1") == [{"x": 1}]


def test_clear_and_size():
    cache.set("a", "v1", [{}])
    cache.set("b", "v1", [{}])
    assert cache.size() == 2
    cache.clear()
    assert cache.size() == 0
