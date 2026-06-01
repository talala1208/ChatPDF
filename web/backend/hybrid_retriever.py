"""
BM25 + 向量混合检索（RRF 融合）。

整体流程：
1. 建库时与 FAISS 同步写入 bm25.pkl
2. 问答时分别取向量 Top-K 与 BM25 Top-K
3. 用 RRF 融合两路排序，必要时将短表题块升级为同页整表块
4. 返回 Top-K Document 及归一化后的混合分数（供前端展示 similarity）
"""

from __future__ import annotations

import pickle
import re
from pathlib import Path
from typing import Dict, List, Tuple

from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from rank_bm25 import BM25Okapi

# ---------------------------------------------------------------------------
# 常量：BM25 持久化文件名、RRF 平滑参数、向量/BM25 候选池倍数
# ---------------------------------------------------------------------------
_BM25_FILENAME = "bm25.pkl"
_DEFAULT_RRF_K = 60
_DEFAULT_FETCH_MULTIPLIER = 4


# ---------------------------------------------------------------------------
# BM25 分词：去 HTML 标签，中文按单字，英文/数字保留整词
# ---------------------------------------------------------------------------
def _tokenize(text: str) -> List[str]:
    """中英文 BM25 分词：去 HTML 标签，中文按字，英文/数字保留词段。"""
    cleaned = re.sub(r"<[^>]+>", " ", text.lower())
    tokens: List[str] = []
    for part in re.findall(r"[\u4e00-\u9fff]+|[a-zA-Z]+|\d+", cleaned):
        if re.fullmatch(r"[\u4e00-\u9fff]+", part):
            tokens.extend(list(part))
        else:
            tokens.append(part)
    return tokens


# ---------------------------------------------------------------------------
# BM25 索引持久化：与 FAISS 向量库目录并存 bm25.pkl
# ---------------------------------------------------------------------------
def _bm25_path(store_path: Path) -> Path:
    return store_path / _BM25_FILENAME


def _documents_from_faiss(knowledge_base: FAISS) -> Tuple[List[str], List[Document]]:
    """从 FAISS docstore 按 index 顺序取出 doc_id 与 Document 列表。"""
    doc_ids = list(knowledge_base.index_to_docstore_id.values())
    documents = [knowledge_base.docstore.search(doc_id) for doc_id in doc_ids]
    return doc_ids, documents


def build_bm25_index(documents: List[Document]) -> BM25Okapi:
    """对全部 chunk 分词后构建 BM25Okapi 索引（内存对象）。"""
    corpus = [_tokenize(doc.page_content) for doc in documents]
    return BM25Okapi(corpus)


def save_bm25_index(store_path: Path, doc_ids: List[str], bm25: BM25Okapi) -> Path:
    """将 doc_id 顺序与 BM25 对象序列化到向量库目录下的 bm25.pkl。"""
    store_path.mkdir(parents=True, exist_ok=True)
    out_path = _bm25_path(store_path)
    with open(out_path, "wb") as f:
        pickle.dump({"doc_ids": doc_ids, "bm25": bm25}, f)
    return out_path


def load_bm25_index(store_path: Path) -> Tuple[List[str], BM25Okapi] | None:
    """加载 bm25.pkl；文件不存在时返回 None。"""
    out_path = _bm25_path(store_path)
    if not out_path.is_file():
        return None
    with open(out_path, "rb") as f:
        payload = pickle.load(f)
    return payload["doc_ids"], payload["bm25"]


def rebuild_bm25_index(knowledge_base: FAISS, store_path: Path) -> Path:
    """从 FAISS docstore 重建并持久化 BM25 索引（建库/增量建库后调用）。"""
    doc_ids, documents = _documents_from_faiss(knowledge_base)
    bm25 = build_bm25_index(documents)
    return save_bm25_index(store_path, doc_ids, bm25)


def _load_or_rebuild_bm25(
    knowledge_base: FAISS, store_path: Path
) -> Tuple[List[str], BM25Okapi]:
    """
    优先加载磁盘 BM25；若缺失或与 FAISS 文档数不一致则自动重建。
    保证问答时 BM25 与当前向量库内容对齐。
    """
    loaded = load_bm25_index(store_path)
    if loaded is not None:
        doc_ids, bm25 = loaded
        if len(doc_ids) == len(knowledge_base.index_to_docstore_id):
            return doc_ids, bm25
    rebuild_bm25_index(knowledge_base, store_path)
    loaded = load_bm25_index(store_path)
    if loaded is None:
        raise RuntimeError("BM25 索引构建失败")
    return loaded


# ---------------------------------------------------------------------------
# 表格检索后处理：过滤/升级短表题 chunk
# ---------------------------------------------------------------------------
def _is_table_caption_only(doc: Document) -> bool:
    """判断是否为仅含表题或来源说明、不含 <table> 数据的短块。"""
    content = doc.page_content.strip()
    if len(content) >= 120:
        return False
    return "<table" not in content.lower()


def _upgrade_table_caption_chunks(
    knowledge_base: FAISS,
    selected_doc_ids: List[str],
    candidate_doc_ids: List[str],
    fused_scores: Dict[str, float],
) -> List[str]:
    """
    若 RRF 结果命中短表题块，替换为同页 fused 分最高的含 <table> 整表块。
    避免检索只返回「表 1：……」标题而缺少表格数据。
    """
    candidate_docs = {
        doc_id: knowledge_base.docstore.search(doc_id)
        for doc_id in candidate_doc_ids
    }
    # 按页码索引候选池中的整表 chunk
    table_by_page: Dict[object, List[str]] = {}
    for doc_id, doc in candidate_docs.items():
        if "<table" in doc.page_content.lower():
            page = doc.metadata.get("page")
            table_by_page.setdefault(page, []).append(doc_id)

    upgraded: List[str] = []
    for doc_id in selected_doc_ids:
        doc = knowledge_base.docstore.search(doc_id)
        if _is_table_caption_only(doc):
            page = doc.metadata.get("page")
            table_ids = table_by_page.get(page, [])
            if table_ids:
                best_table_id = max(
                    table_ids, key=lambda item: fused_scores.get(item, 0.0)
                )
                upgraded.append(best_table_id)
                continue
        upgraded.append(doc_id)

    # 升级后可能重复，按顺序去重
    deduped: List[str] = []
    seen: set[str] = set()
    for doc_id in upgraded:
        if doc_id not in seen:
            seen.add(doc_id)
            deduped.append(doc_id)
    return deduped


# ---------------------------------------------------------------------------
# RRF 融合：合并多路排序列表，不依赖原始分数尺度
# ---------------------------------------------------------------------------
def _reciprocal_rank_fusion(
    ranked_doc_ids: List[List[str]],
    *,
    rrf_k: int = _DEFAULT_RRF_K,
) -> Dict[str, float]:
    """
    Reciprocal Rank Fusion：score += 1 / (k + rank + 1)。
    向量路与 BM25 路排名越靠前，融合分越高。
    """
    scores: Dict[str, float] = {}
    for ranked in ranked_doc_ids:
        for rank, doc_id in enumerate(ranked):
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (rrf_k + rank + 1)
    return scores


def _doc_id_for_document(
    knowledge_base: FAISS, doc: Document, doc_ids: List[str]
) -> str | None:
    """通过 page_content + metadata 在 docstore 中反查 doc_id。"""
    for doc_id in doc_ids:
        stored = knowledge_base.docstore.search(doc_id)
        if (
            stored.page_content == doc.page_content
            and stored.metadata == doc.metadata
        ):
            return doc_id
    return None


# ---------------------------------------------------------------------------
# 混合检索入口：向量 + BM25 → RRF → 表题升级 → 归一化分数
# ---------------------------------------------------------------------------
def hybrid_search_with_score(
    knowledge_base: FAISS,
    store_path: Path,
    query: str,
    k: int = 4,
    *,
    rrf_k: int = _DEFAULT_RRF_K,
    fetch_k: int | None = None,
) -> List[Tuple[Document, float]]:
    """
    向量 Top-K + BM25 Top-K，RRF 融合后返回 k 个 Document 及归一化混合分。
    """
    if k <= 0:
        return []

    doc_ids, documents = _documents_from_faiss(knowledge_base)
    if not documents:
        return []

    # 候选池大小：默认 k 的 4 倍，两路检索都在此范围内竞争
    candidate_k = fetch_k or max(k * _DEFAULT_FETCH_MULTIPLIER, k)
    candidate_k = min(candidate_k, len(documents))

    _, bm25 = _load_or_rebuild_bm25(knowledge_base, store_path)

    # --- 向量路：FAISS 相似度检索，优先排除短表题块 ---
    vector_results = knowledge_base.similarity_search_with_score(query, k=candidate_k)
    vector_ranked: List[str] = []
    for doc, _ in vector_results:
        doc_id = _doc_id_for_document(knowledge_base, doc, doc_ids)
        if doc_id and doc_id not in vector_ranked:
            if not _is_table_caption_only(doc):
                vector_ranked.append(doc_id)
    # 若过滤后为空，放宽条件保留向量结果
    if not vector_ranked:
        for doc, _ in vector_results:
            doc_id = _doc_id_for_document(knowledge_base, doc, doc_ids)
            if doc_id and doc_id not in vector_ranked:
                vector_ranked.append(doc_id)

    # --- BM25 路：关键词匹配，取得分 > 0 且非短表题的前 candidate_k 条 ---
    query_tokens = _tokenize(query)
    bm25_scores = bm25.get_scores(query_tokens)
    bm25_ranked = [
        doc_ids[i]
        for i in sorted(
            range(len(bm25_scores)),
            key=lambda idx: bm25_scores[idx],
            reverse=True,
        )[: candidate_k * 2]
        if bm25_scores[i] > 0 and not _is_table_caption_only(documents[i])
    ][:candidate_k]

    # --- RRF 融合两路排名；无融合分时回退为向量路顺序分 ---
    fused = _reciprocal_rank_fusion([vector_ranked, bm25_ranked], rrf_k=rrf_k)
    if not fused and vector_ranked:
        fused = {doc_id: 1.0 / (idx + 1) for idx, doc_id in enumerate(vector_ranked)}

    # 候选 doc_id 并集，供表题升级时在更大池子里找同页整表
    candidate_doc_ids = list(
        dict.fromkeys(
            vector_ranked
            + bm25_ranked
            + [
                _doc_id_for_document(knowledge_base, doc, doc_ids)
                for doc, _ in vector_results
            ]
            + list(fused.keys())
        )
    )
    candidate_doc_ids = [doc_id for doc_id in candidate_doc_ids if doc_id]

    # 取融合分 Top-K，并将短表题块升级为整表块
    top_doc_ids = sorted(fused, key=fused.get, reverse=True)[:k]
    top_doc_ids = _upgrade_table_caption_chunks(
        knowledge_base, top_doc_ids, candidate_doc_ids, fused
    )[:k]

    # 将 RRF 原始分线性归一化到 [0, 1]，供前端 sources.similarity 展示
    max_score = max(fused.values()) if fused else 1.0
    min_score = min(fused.values()) if fused else 0.0
    score_span = max_score - min_score

    results: List[Tuple[Document, float]] = []
    for doc_id in top_doc_ids:
        doc = knowledge_base.docstore.search(doc_id)
        raw = fused.get(doc_id, 0.0)
        if score_span <= 0:
            normalized = 1.0
        else:
            normalized = (raw - min_score) / score_span if raw > 0 else 0.5
        results.append((doc, normalized))
    return results
