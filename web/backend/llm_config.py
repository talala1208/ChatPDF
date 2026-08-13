"""
LLM 模型名称与思考模式配置，统一从项目根目录 .env 读取。
"""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_PROJECT_ROOT / ".env")

_DEFAULT_ALLOWED_MODELS = (
    "qwen3.7-flash-2026-07-15,"
    "qwen3.7-max-2026-05-17,"
    "glm-5.2,"
    "qwen3.7-max-2026-05-20,"
    "qwen3.7-plus-2026-05-26"
)
_DASHSCOPE_COMPATIBLE_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"


def _env_str(name: str, default: str) -> str:
    return os.getenv(name, default).strip() or default


def _env_bool(name: str, default: bool) -> bool:
    return _env_str(name, str(default).lower()).lower() in ("1", "true", "yes")


def _env_model_list(name: str, default_csv: str) -> list[str]:
    return [item.strip() for item in _env_str(name, default_csv).split(",") if item.strip()]


DEFAULT_LLM_MODEL = _env_str("LLM_MODEL", "qwen3.7-plus-2026-05-26")
DEFAULT_RERANK_MODEL = _env_str("LLM_RERANK_MODEL", "qwen3.7-flash-2026-07-15")
DEFAULT_QUERY_REWRITE_MODEL = _env_str("LLM_REWRITE_MODEL", "qwen3.7-flash-2026-07-15")
ALLOWED_LLM_MODELS = _env_model_list("LLM_ALLOWED_MODELS", _DEFAULT_ALLOWED_MODELS)
LLM_ENABLE_THINKING = _env_bool("LLM_ENABLE_THINKING", False)


def create_chat_llm(
    *,
    model: str,
    api_key: str,
    temperature: float = 0,
) -> ChatOpenAI:
    """创建走百炼 OpenAI 兼容接口的 Chat 模型，思考模式由 LLM_ENABLE_THINKING 控制。"""
    return ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=_DASHSCOPE_COMPATIBLE_BASE_URL,
        temperature=temperature,
        extra_body={"enable_thinking": LLM_ENABLE_THINKING},
    )
