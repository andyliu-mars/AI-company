#!/usr/bin/env python3
"""Context Tracker - UserPromptSubmit Hook.

Reads the last assistant message's usage.input_tokens from CC transcript jsonl,
calculates context usage ratio. >=80% triggers warning, >=90% triggers critical.
Data source: Anthropic API exact usage, not estimates.
No intermediate files, no statusline dependency, project isolation built-in
(transcript_path.parent = project directory).

Usage: python -m aiteam.hooks.context_tracker
"""
import json
import sys
from pathlib import Path

DEFAULT_CONTEXT_SIZE = 200_000


def _detect_context_size(model: str) -> int:
    """Infer context window size from model identifier."""
    if not model:
        return DEFAULT_CONTEXT_SIZE
    model_lower = model.lower()
    if "1m" in model_lower or "[1m]" in model_lower:
        return 1_000_000
    return DEFAULT_CONTEXT_SIZE


def _read_last_usage(transcript: Path) -> tuple[int, str] | None:
    """Scan transcript jsonl in reverse for the last assistant message usage.

    Returns (total_tokens, model_name) or None.
    total_tokens = input_tokens + cache_read + cache_creation (all count as context usage)
    """
    try:
        lines = transcript.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None

    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        m = entry.get("message") or entry
        if m.get("role") != "assistant":
            continue
        usage = m.get("usage") or {}
        input_tokens = usage.get("input_tokens")
        if input_tokens is None:
            continue
        total = (
            int(input_tokens)
            + int(usage.get("cache_read_input_tokens", 0))
            + int(usage.get("cache_creation_input_tokens", 0))
        )
        model = m.get("model", "") or entry.get("model", "")
        return total, model

    return None


def main():
    # Windows UTF-8 fix
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")  # type: ignore[union-attr]

    try:
        raw = sys.stdin.read()
        if not raw.strip():
            return
        payload = json.loads(raw)
    except Exception:
        return  # silent failure

    transcript_path_str = payload.get("transcript_path", "")
    if not transcript_path_str:
        return
    transcript = Path(transcript_path_str)
    if not transcript.exists():
        return

    result = _read_last_usage(transcript)
    if result is None:
        return
    used_tokens, model = result

    ctx_size = _detect_context_size(model)
    pct = round((used_tokens / ctx_size) * 100, 1)

    if pct >= 90:
        print(
            f"[CONTEXT CRITICAL] 上下文使用率: {pct}% ({used_tokens}/{ctx_size}). "
            "立即停止当前工作，保存所有记忆和进度到 memory 文件，"
            "然后提醒用户执行 /compact。不要开始任何新任务。"
        )
    elif pct >= 80:
        print(
            f"[CONTEXT WARNING] 上下文使用率: {pct}% ({used_tokens}/{ctx_size}). "
            "请尽快完成当前节点任务，然后保存记忆和进度到 memory 文件，"
            "并提醒用户执行 /compact。"
        )


if __name__ == "__main__":
    main()
