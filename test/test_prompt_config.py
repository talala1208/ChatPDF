from __future__ import annotations

from pathlib import Path

import pytest
from web.backend.prompt_config import (
    load_qa_prompt_config,
    load_rerank_prompt,
)
from web.backend.rag_service import PROMPT_PRESET_LABELS, _build_qa_prompt


def test_prompt_yml_keeps_existing_presets_and_placeholders() -> None:
    config = load_qa_prompt_config()

    assert list(config) == ["default", "strict", "concise", "detailed"]
    assert "{context}" in config["default"]["template"]
    assert "{question}" in config["default"]["template"]
    assert config["strict"]["label"] == "严格依据文档"
    assert "{context}" in str(config["concise"]["template"])
    assert "{question}" in str(config["detailed"]["template"])

    rerank_prompt = load_rerank_prompt()
    rendered = rerank_prompt.format(query="问题", documents="片段")
    assert "用户问题：问题" in rendered
    assert "文档列表：\n片段" in rendered
    assert '{"index": 0, "score": 8}' in rendered


def test_prompt_yml_missing_required_placeholder_fails(tmp_path: Path) -> None:
    path = tmp_path / "rerank.yml"
    path.write_text("template: '只有 {query}'\n", encoding="utf-8")

    with pytest.raises(ValueError, match="缺少 query 或 documents"):
        load_rerank_prompt(path)


def test_qa_backend_uses_prompt_yml() -> None:
    prompt = _build_qa_prompt("strict")

    assert PROMPT_PRESET_LABELS["strict"] == "严格依据文档"
    assert "上下文内容" in prompt.format(context="上下文内容", question="问题")
