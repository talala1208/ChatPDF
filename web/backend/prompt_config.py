"""从项目内 YAML 文件加载并校验 Prompt 配置。"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Literal, TypedDict

import yaml

PROJECT_ROOT = Path(__file__).resolve().parents[2]
QA_PROMPT_PATH = PROJECT_ROOT / "prompt" / "qa.yml"
RERANK_PROMPT_PATH = PROJECT_ROOT / "prompt" / "rerank.yml"

PromptPreset = Literal["default", "strict", "concise", "detailed"]


class PromptPresetConfig(TypedDict):
    label: str
    template: str


_PROMPT_PRESET_IDS: tuple[PromptPreset, ...] = (
    "default",
    "strict",
    "concise",
    "detailed",
)


def _load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        data = yaml.safe_load(file)
    if not isinstance(data, dict):
        raise ValueError(f"Prompt 配置必须是对象: {path}")
    return data


def load_qa_prompt_config(
    path: Path = QA_PROMPT_PATH,
) -> dict[PromptPreset, PromptPresetConfig]:
    """加载四种问答预设，并校验标签、模板和占位符。"""
    presets = _load_yaml(path).get("presets")
    if not isinstance(presets, dict) or set(presets) != set(_PROMPT_PRESET_IDS):
        raise ValueError("问答 Prompt 必须包含 default、strict、concise、detailed")

    result: dict[PromptPreset, PromptPresetConfig] = {}
    for preset_id in _PROMPT_PRESET_IDS:
        item = presets[preset_id]
        if not isinstance(item, dict):
            raise ValueError(f"Prompt 预设格式无效: {preset_id}")
        label = item.get("label")
        template = item.get("template")
        if not isinstance(label, str) or not label.strip():
            raise ValueError(f"Prompt 预设标签无效: {preset_id}")
        if not isinstance(template, str) or not template.strip():
            raise ValueError(f"Prompt 预设模板无效: {preset_id}")
        if "{context}" not in template or "{question}" not in template:
            raise ValueError(f"Prompt 预设缺少 context 或 question: {preset_id}")
        result[preset_id] = {"label": label, "template": template}
    return result


def load_rerank_prompt(path: Path = RERANK_PROMPT_PATH) -> str:
    """加载检索重排模板，并校验必需占位符。"""
    template = _load_yaml(path).get("template")
    if not isinstance(template, str) or not template.strip():
        raise ValueError("重排 Prompt 模板不能为空")
    if "{query}" not in template or "{documents}" not in template:
        raise ValueError("重排 Prompt 缺少 query 或 documents")
    return template
