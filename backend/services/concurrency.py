"""Provider-aware adaptive concurrency + retry backoff for generation.

Two production-grade primitives the batch generator builds on:

1. :class:`AdaptiveLimiter` — an AIMD (additive-increase / multiplicative-decrease)
   concurrency gate. It starts at a provider-specific level, **halves** in-flight
   capacity the moment a rate-limit (429) is observed, and **slowly grows** back
   toward the provider ceiling after a streak of clean successes. This replaces the
   old fixed ``asyncio.Semaphore(5)`` that burst every request at once and tripped
   free-tier per-minute limits.

2. :func:`backoff_delay` — exponential backoff with **full jitter** and
   **Retry-After** support, so retries spread out across the provider's throttle
   window instead of hammering inside a sub-second loop.

Limits are intentionally conservative for free tiers (Groq) and more generous for
paid/abundant providers (Anthropic/OpenAI). They are *ceilings and seeds*, not
guarantees — the limiter adapts down under pressure regardless of the ceiling.
"""

from __future__ import annotations

import asyncio
import random

# Per-provider concurrency envelope: (initial, min, max). ``initial`` seeds the
# limiter, ``min`` is the floor it will never drop below (so progress is always
# possible), ``max`` is the ceiling it will grow toward on sustained success.
PROVIDER_LIMITS: dict[str, dict[str, int]] = {
    # Free tier — tight per-minute token budgets; start small, never burst.
    "groq": {"initial": 2, "min": 1, "max": 4},
    "gemini": {"initial": 3, "min": 1, "max": 6},
    "ollama": {"initial": 1, "min": 1, "max": 2},  # local / single-GPU
    # Paid / abundant — comfortably parallel.
    "anthropic": {"initial": 5, "min": 1, "max": 8},
    "openai": {"initial": 4, "min": 1, "max": 8},
}

_DEFAULT_LIMITS = {"initial": 3, "min": 1, "max": 5}

# Number of consecutive successes before the limiter grants one more concurrency
# slot (additive increase). Higher = more cautious ramp-up.
_INCREASE_AFTER = 4

# Backoff tuning.
_BACKOFF_BASE = 0.5   # seconds — first-attempt exponential base
_BACKOFF_CAP = 30.0   # seconds — never wait longer than this


def limits_for(provider_id: str | None) -> dict[str, int]:
    """Return the concurrency envelope for a provider id (case-insensitive)."""
    return PROVIDER_LIMITS.get((provider_id or "").lower(), _DEFAULT_LIMITS)


def backoff_delay(
    attempt: int,
    *,
    retry_after: float | None = None,
    base: float = _BACKOFF_BASE,
    cap: float = _BACKOFF_CAP,
) -> float:
    """Compute the delay (seconds) before retry ``attempt`` (0-indexed).

    * When the provider supplied ``Retry-After``, honour it (capped), plus a small
      jitter so concurrent tasks don't all wake at the same instant.
    * Otherwise use exponential backoff with **full jitter**:
      ``random_between(0, min(cap, base * 2**attempt))``. Full jitter is the
      AWS-recommended strategy — it maximises spread and avoids retry stampedes.
    """
    if retry_after is not None and retry_after > 0:
        return min(retry_after, cap) + random.uniform(0, 0.3)
    window = min(cap, base * (2 ** attempt))
    return random.uniform(0, window)


class AdaptiveLimiter:
    """AIMD concurrency gate with rate-limit-aware feedback.

    Usage::

        limiter = AdaptiveLimiter.for_provider("groq")
        async with limiter.slot():
            ...                 # one provider call
            await limiter.on_success()      # clean call
            # or
            await limiter.on_rate_limit()   # saw a 429

    ``acquire``/``release`` are guarded by an ``asyncio.Condition`` so the live
    limit can change while tasks are waiting; raising the limit wakes blocked
    waiters immediately.
    """

    def __init__(self, initial: int, min_limit: int, max_limit: int,
                 increase_after: int = _INCREASE_AFTER) -> None:
        self._limit = max(1, initial)
        self._min = max(1, min_limit)
        self._max = max(self._min, max_limit)
        self._increase_after = increase_after
        self._in_flight = 0
        self._success_streak = 0
        self._cond = asyncio.Condition()

    @classmethod
    def for_provider(cls, provider_id: str | None) -> "AdaptiveLimiter":
        lim = limits_for(provider_id)
        return cls(lim["initial"], lim["min"], lim["max"])

    @property
    def limit(self) -> int:
        return self._limit

    @property
    def in_flight(self) -> int:
        return self._in_flight

    async def acquire(self) -> None:
        async with self._cond:
            while self._in_flight >= self._limit:
                await self._cond.wait()
            self._in_flight += 1

    async def release(self) -> None:
        async with self._cond:
            self._in_flight -= 1
            self._cond.notify_all()

    async def on_success(self) -> None:
        """Record a clean call; grow the limit after a streak (additive increase)."""
        async with self._cond:
            self._success_streak += 1
            if self._limit < self._max and self._success_streak >= self._increase_after:
                self._limit += 1
                self._success_streak = 0
                self._cond.notify_all()

    async def on_rate_limit(self) -> None:
        """Record a 429; halve the limit immediately (multiplicative decrease)."""
        async with self._cond:
            self._success_streak = 0
            new_limit = max(self._min, self._limit // 2)
            self._limit = new_limit

    def slot(self) -> "_Slot":
        return _Slot(self)


class _Slot:
    """Async context manager that holds one concurrency slot for its lifetime."""

    def __init__(self, limiter: AdaptiveLimiter) -> None:
        self._limiter = limiter

    async def __aenter__(self) -> AdaptiveLimiter:
        await self._limiter.acquire()
        return self._limiter

    async def __aexit__(self, *exc) -> None:
        await self._limiter.release()
