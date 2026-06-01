"""
LLM 检索重排：对混合检索候选 chunk 用 LLM 打相关度分，再与检索分加权融合。
"""

from __future__ import annotations

import json
import re
from typing import List, Optional, Tuple

from langchain_community.llms import Tongyi
from langchain_core.documents import Document

from web.backend.token_usage import TokenUsage, token_usage_from_llm_result

# 单条 chunk 送入重排 Prompt 的最大字符数
_MAX_RERANK_DOC_CHARS = 600
# LLM 分数在最终排序中的权重（与 hybrid 检索分加权）
DEFAULT_LLM_RERANK_WEIGHT = 0.7

_RERANK_PROMPT = """你是检索重排助手。根据用户问题，为每条文档片段评估相关程度（0-10 整数，10 最相关）。

用户问题：{query}

文档列表：
{documents}

只返回 JSON 数组，每项格式 {{"index": 0, "score": 8}}，index 为文档序号（从 0 开始）。不要输出其他内容。"""


def _format_doc_for_rerank(index: int, doc: Document) -> str:
    text = doc.page_content.strip()
    if len(text) > _MAX_RERANK_DOC_CHARS:
        text = text[:_MAX_RERANK_DOC_CHARS] + "..."
    page = doc.metadata.get("page", "?")
    return f"[{index}] 页码 {page}\n{text}"


def _parse_rerank_scores(text: str, count: int) -> List[float]:
    """解析 LLM 返回的相关度分数，归一化到 0~1。"""
    match = re.search(r"\[[\s\S]*\]", text)
    if not match:
        raise ValueError("重排结果中未找到 JSON 数组")

    items = json.loads(match.group())
    scores = [0.0] * count
    for item in items:
        index = int(item["index"])
        if 0 <= index < count:
            scores[index] = max(0.0, min(float(item["score"]) / 10.0, 1.0))
    return scores


def llm_rerank_documents(
    query: str,
    docs_with_scores: List[Tuple[Document, float]],
    *,
    model_name: str,
    api_key: str,
    top_k: int,
    llm_weight: float = DEFAULT_LLM_RERANK_WEIGHT,
) -> Tuple[List[Tuple[Document, float]], Optional[TokenUsage]]:
    """
    用 LLM 对候选文档重排，返回 top_k 条及融合后的分数。
    解析失败时回退为原 hybrid 检索顺序。
    """
    if top_k <= 0:
        return [], None
    if len(docs_with_scores) <= 1:
        return docs_with_scores[:top_k], None

    documents_block = "\n\n".join(
        _format_doc_for_rerank(index, doc)
        for index, (doc, _) in enumerate(docs_with_scores)
    )
    prompt = _RERANK_PROMPT.format(query=query.strip(), documents=documents_block)

    llm = Tongyi(
        model_name=model_name,
        dashscope_api_key=api_key,
        model_kwargs={"temperature": 0},
    )
    llm_result = llm.generate([prompt])
    response_text = llm_result.generations[0][0].text
    usage = token_usage_from_llm_result(llm_result)

    try:
        llm_scores = _parse_rerank_scores(response_text, len(docs_with_scores))
    except (ValueError, json.JSONDecodeError, KeyError, TypeError):
        return docs_with_scores[:top_k], usage

    retrieval_weight = 1.0 - llm_weight
    ranked: List[Tuple[Document, float]] = []
    for index, (doc, retrieval_score) in enumerate(docs_with_scores):
        combined = retrieval_weight * float(retrieval_score) + llm_weight * llm_scores[
            index
        ]
        ranked.append((doc, combined))

    ranked.sort(key=lambda item: item[1], reverse=True)
    return ranked[:top_k], usage
