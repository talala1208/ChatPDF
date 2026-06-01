"""
从 LangChain Tongyi / DashScope 响应中提取并汇总 token 用量。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult


TokenUsage = Dict[str, int]


def normalize_token_usage(raw: Any) -> Optional[TokenUsage]:
    """将 DashScope usage 字段规范为 input/output/total。"""
    if not raw or not isinstance(raw, dict):
        return None

    input_tokens = int(
        raw.get("input_tokens") or raw.get("prompt_tokens") or 0
    )
    output_tokens = int(
        raw.get("output_tokens") or raw.get("completion_tokens") or 0
    )
    total_tokens = int(raw.get("total_tokens") or input_tokens + output_tokens)

    if input_tokens <= 0 and output_tokens <= 0 and total_tokens <= 0:
        return None

    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
    }


def token_usage_from_llm_result(result: LLMResult) -> Optional[TokenUsage]:
    """从 LLMResult 读取单次调用的 token 用量。"""
    if not result or not result.generations:
        return None

    for row in result.generations:
        if not row:
            continue
        generation = row[0]
        info = getattr(generation, "generation_info", None) or {}
        if not isinstance(info, dict):
            continue
        usage = normalize_token_usage(info.get("token_usage"))
        if usage:
            return usage

    return None


def merge_token_usages(*usages: Optional[TokenUsage]) -> Optional[TokenUsage]:
    """合并多次 LLM 调用的 token 用量。"""
    input_total = 0
    output_total = 0
    has_value = False

    for usage in usages:
        if not usage:
            continue
        has_value = True
        input_total += int(usage.get("input_tokens", 0))
        output_total += int(usage.get("output_tokens", 0))

    if not has_value:
        return None

    return {
        "input_tokens": input_total,
        "output_tokens": output_total,
        "total_tokens": input_total + output_total,
    }


def format_token_usage(usage: TokenUsage) -> str:
    """格式化为运行记录 detail 文案。"""
    return (
        f"输入 {usage['input_tokens']} · "
        f"输出 {usage['output_tokens']} · "
        f"合计 {usage['total_tokens']}"
    )


class TokenUsageCallbackHandler(BaseCallbackHandler):
    """在 chain / llm 调用结束时收集 token 用量。"""

    def __init__(self) -> None:
        self.usages: List[TokenUsage] = []

    def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        usage = token_usage_from_llm_result(response)
        if usage:
            self.usages.append(usage)

    def merged_usage(self) -> Optional[TokenUsage]:
        return merge_token_usages(*self.usages)
