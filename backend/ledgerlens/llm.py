"""
The only place an LLM is called. It may map schemas, explain a finding in plain
English, and draft prose. It may never compute, rank, or score anything — every
number it ever sees has already been decided by a rule.

Absent an API key the whole module degrades to None and callers fall back to
deterministic behaviour. Nothing here is on the critical path.
"""
from __future__ import annotations

import json
import logging
import os
import ssl
import urllib.error
import urllib.request
from functools import lru_cache
from pathlib import Path

log = logging.getLogger(__name__)

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_DEFAULT_MODEL = "openai/gpt-oss-120b"


@lru_cache(maxsize=1)
def _ssl_context() -> ssl.SSLContext:
    """Python installed from python.org on macOS ships without a wired-up CA
    bundle, so urllib fails to verify TLS. Use certifi's explicitly rather than
    the far worse alternative of disabling verification."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


def _load_env() -> None:
    """Read backend/.env without adding a dependency."""
    if os.getenv("GROQ_API_KEY"):
        return
    for candidate in (Path(__file__).resolve().parents[1] / ".env",
                      Path.cwd() / ".env"):
        if not candidate.exists():
            continue
        for line in candidate.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())
        return


def available() -> bool:
    _load_env()
    return bool(os.getenv("GROQ_API_KEY"))


def complete(
    system: str,
    user: str,
    *,
    max_tokens: int = 1200,
    temperature: float = 0.0,
    json_mode: bool = False,
    timeout: int = 30,
) -> str | None:
    """Returns the model's text, or None if unavailable or failing. Callers
    must always have a deterministic path for None."""
    _load_env()
    key = os.getenv("GROQ_API_KEY")
    if not key:
        return None
    body: dict = {
        "model": os.getenv("GROQ_MODEL", _DEFAULT_MODEL),
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "temperature": temperature,
        # low effort: these are bounded, mechanical tasks, not reasoning problems
        "reasoning_effort": "low",
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    req = urllib.request.Request(
        GROQ_URL,
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            # urllib's default UA is rejected at the edge with a 403
            "User-Agent": "ledgerlens/1.0 (+procurement-forensics)",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as resp:
            payload = json.loads(resp.read())
        return payload["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        log.warning("groq HTTP %s, falling back to deterministic path: %s",
                    exc.code, detail)
        return None
    except (urllib.error.URLError, KeyError, TimeoutError, json.JSONDecodeError) as exc:
        log.warning("groq call failed, falling back to deterministic path: %s", exc)
        return None


def complete_json(system: str, user: str, **kw) -> dict | None:
    raw = complete(system, user, json_mode=True, **kw)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start : end + 1])
            except json.JSONDecodeError:
                pass
        log.warning("groq returned unparseable JSON")
        return None
