"""
LLM 模型名称配置，统一从项目根目录 .env 读取。
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_PROJECT_ROOT / ".env")

_DEFAULT_ALLOWED_MODELS = "deepseek-v3,qwen-turbo,qwen-plus,qwen-max"


def _env_str(name: str, default: str) -> str:
    return os.getenv(name, default).strip() or default


def _env_model_list(name: str, default_csv: str) -> list[str]:
    return [item.strip() for item in _env_str(name, default_csv).split(",") if item.strip()]


DEFAULT_LLM_MODEL = _env_str("LLM_MODEL", "deepseek-v3")
DEFAULT_RERANK_MODEL = _env_str("LLM_RERANK_MODEL", "qwen-turbo")
DEFAULT_QUERY_REWRITE_MODEL = _env_str("LLM_REWRITE_MODEL", "qwen-turbo")
ALLOWED_LLM_MODELS = _env_model_list("LLM_ALLOWED_MODELS", _DEFAULT_ALLOWED_MODELS)
