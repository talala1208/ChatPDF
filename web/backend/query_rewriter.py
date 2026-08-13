"""
PDF 文档问答场景的 Query 改写。

单次 LLM 调用完成类型识别与检索查询优化，供混合检索与低置信度二次检索使用。
"""

from __future__ import annotations

import json
import re
from typing import List, Optional, TypedDict

from langchain_community.llms import Tongyi

from web.backend.llm_config import DEFAULT_QUERY_REWRITE_MODEL
from web.backend.prompt_config import load_query_rewrite_prompt
from web.backend.token_usage import TokenUsage, token_usage_from_llm_result

_QUERY_REWRITE_PROMPT = load_query_rewrite_prompt()
_MAX_HISTORY_CHARS = 2000
_MAX_STORE_CONTEXT_CHARS = 800


class QueryRewriteResult(TypedDict):
    original_query: str
    needs_rewrite: bool
    query_type: str
    retrieval_query: str
    sub_queries: List[str]
    confidence: float
    reason: str


def _strip_json_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _parse_rewrite_response(text: str, original_query: str) -> QueryRewriteResult:
    """解析 LLM JSON；失败时回退为原问题。"""
    fallback: QueryRewriteResult = {
        "original_query": original_query,
        "needs_rewrite": False,
        "query_type": "standalone",
        "retrieval_query": original_query,
        "sub_queries": [],
        "confidence": 0.5,
        "reason": "改写结果解析失败，使用原问题",
    }
    try:
        payload = json.loads(_strip_json_fence(text))
    except json.JSONDecodeError:
        return fallback

    retrieval_query = str(payload.get("retrieval_query", "")).strip() or original_query
    sub_queries_raw = payload.get("sub_queries", [])
    sub_queries: List[str] = []
    if isinstance(sub_queries_raw, list):
        for item in sub_queries_raw[:3]:
            if isinstance(item, str) and item.strip():
                sub_queries.append(item.strip())

    confidence_raw = payload.get("confidence", 0.5)
    try:
        confidence = max(0.0, min(float(confidence_raw), 1.0))
    except (TypeError, ValueError):
        confidence = 0.5

    return {
        "original_query": original_query,
        "needs_rewrite": bool(payload.get("needs_rewrite", False)),
        "query_type": str(payload.get("query_type", "standalone")),
        "retrieval_query": retrieval_query,
        "sub_queries": sub_queries,
        "confidence": confidence,
        "reason": str(payload.get("reason", "")),
    }


def format_store_context(
    store_name: str,
    pdf_files: List[str],
    *,
    max_chars: int = _MAX_STORE_CONTEXT_CHARS,
) -> str:
    """将向量库元信息格式化为改写 Prompt 上下文。"""
    lines = [f"向量库名称：{store_name}"]
    if pdf_files:
        lines.append("已入库 PDF：")
        for path in pdf_files[:20]:
            name = path.rsplit("/", 1)[-1]
            lines.append(f"- {name}")
        if len(pdf_files) > 20:
            lines.append(f"- …共 {len(pdf_files)} 个文件")
    text = "\n".join(lines)
    if len(text) > max_chars:
        return text[: max_chars - 3] + "..."
    return text


def format_conversation_history(
    turns: List[dict],
    *,
    max_chars: int = _MAX_HISTORY_CHARS,
) -> str:
    """将近期问答格式化为对话历史文本。"""
    if not turns:
        return "（无）"

    lines: List[str] = []
    for turn in turns:
        question = str(turn.get("question", "")).strip()
        answer = str(turn.get("answer", "")).strip()
        if question:
            lines.append(f"用户：{question}")
        if answer:
            if len(answer) > 300:
                answer = answer[:297] + "..."
            lines.append(f"助手：{answer}")

    text = "\n".join(lines)
    if len(text) > max_chars:
        return text[-max_chars:]
    return text


def rewrite_query_for_retrieval(
    question: str,
    *,
    store_context: str,
    conversation_history: str = "",
    model_name: str = DEFAULT_QUERY_REWRITE_MODEL,
    api_key: str,
) -> tuple[QueryRewriteResult, Optional[TokenUsage]]:
    """
    分析并改写用户问题，返回适合 PDF 混合检索的查询。
    """
    query = question.strip()
    if not query:
        raise ValueError("问题不能为空")

    prompt = _QUERY_REWRITE_PROMPT.format(
        store_context=store_context or "（未知）",
        conversation_history=conversation_history or "（无）",
        question=query,
    )

    llm = Tongyi(
        model_name=model_name,
        dashscope_api_key=api_key,
        model_kwargs={"temperature": 0},
    )
    llm_result = llm.generate([prompt])
    response_text = llm_result.generations[0][0].text
    usage = token_usage_from_llm_result(llm_result)

    return _parse_rewrite_response(response_text, query), usage


def collect_secondary_queries(result: QueryRewriteResult) -> List[str]:
    """
    收集二次检索备选查询：子问题分解项，或在首轮已用改写句时回退原问题。
    不包含已在首轮使用的 retrieval_query，避免重复检索。
    """
    candidates: List[str] = []
    primary = result["retrieval_query"].strip()
    original = result["original_query"].strip()

    for sub in result.get("sub_queries", []):
        sub = sub.strip()
        if sub and sub not in candidates and sub != primary:
            candidates.append(sub)

    if primary != original and original not in candidates:
        candidates.append(original)

    return candidates[:3]
