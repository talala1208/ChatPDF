"""
ChatPDF FAISS 建库与问答核心逻辑（供 FastAPI 共用）
"""

from __future__ import annotations

import json
import os
import re
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, List, Literal

from dotenv import load_dotenv
from langchain_classic.chains.question_answering import load_qa_chain
from langchain_community.embeddings import DashScopeEmbeddings
from langchain_community.llms import Tongyi
from langchain_community.vectorstores import FAISS
from langchain_core.documents import Document
from langchain_core.prompts import PromptTemplate

from web.backend.chunk_debug import (
    cleanup_incomplete_build_artifacts,
    delete_store_debug_artifacts,
    save_pdf_chunks_debug_md,
    save_pdf_store_chunks_debug_md,
)
from web.backend.hybrid_retriever import hybrid_search_with_score, rebuild_bm25_index
from web.backend.llm_reranker import llm_rerank_documents
from web.backend.token_usage import (
    TokenUsageCallbackHandler,
    merge_token_usages,
)
from web.backend.text_splitter import (
    BuildRoute,
    DEFAULT_CHUNK_OVERLAP,
    DEFAULT_CHUNK_SIZE,
    build_documents_for_pdf,
    validate_chunk_params,
)

# 路径: web/backend/rag_service.py -> parents[1]=web, parents[2]=项目根
WEB_ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]
WEB_DATA_DIR = WEB_ROOT / "data"
VECTOR_STORES_DIR = WEB_DATA_DIR / "vector_stores"
CHAT_HISTORY_PATH = WEB_DATA_DIR / "chat_history.json"

# 环境变量统一从项目根目录 .env 加载
load_dotenv(PROJECT_ROOT / ".env")

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY")

PromptPreset = Literal["default", "strict", "concise", "detailed"]

DEFAULT_TEMPERATURE = 0.1
# LLM 重排时混合检索候选池倍数（相对 Top-K）
_LLM_RERANK_CANDIDATE_MULTIPLIER = 4
_LLM_RERANK_CANDIDATE_MIN = 12

ALLOWED_LLM_MODELS = ["deepseek-v3", "qwen-turbo", "qwen-plus", "qwen-max"]
DEFAULT_LLM_MODEL = "deepseek-v3"
DEFAULT_RERANK_MODEL = "qwen-turbo"

PROMPT_PRESET_LABELS: dict[PromptPreset, str] = {
    "default": "默认",
    "strict": "严格依据文档",
    "concise": "简洁回答",
    "detailed": "分步详述",
}

_PROMPT_TEMPLATES: dict[PromptPreset, str | None] = {
    "default": None,
    "strict": """请严格根据以下上下文回答问题。若上下文中没有足够信息，请明确回答「根据提供的文档无法确定」，不要编造内容。

{context}

问题：{question}
回答：""",
    "concise": """根据以下上下文，用简洁的语言回答问题，控制在 3 句话以内。

{context}

问题：{question}
回答：""",
    "detailed": """根据以下上下文详细回答问题。请分点说明，并在适当时引用上下文中的关键表述。

{context}

问题：{question}
回答：""",
}


def _require_api_key() -> str:
    if not DASHSCOPE_API_KEY:
        raise ValueError("请设置环境变量 DASHSCOPE_API_KEY")
    return DASHSCOPE_API_KEY


def get_chat_options() -> dict:
    """返回问答页可选参数（供前端展示）。"""
    return {
        "llm_models": ALLOWED_LLM_MODELS,
        "default_llm_model": DEFAULT_LLM_MODEL,
        "default_rerank_model": DEFAULT_RERANK_MODEL,
        "default_temperature": DEFAULT_TEMPERATURE,
        "prompt_presets": [
            {"id": preset_id, "label": label}
            for preset_id, label in PROMPT_PRESET_LABELS.items()
        ],
    }


def _validate_llm_model(model_name: str) -> str:
    if model_name not in ALLOWED_LLM_MODELS:
        raise ValueError(f"不支持的模型: {model_name}")
    return model_name


def _validate_prompt_preset(prompt_preset: str) -> PromptPreset:
    if prompt_preset not in PROMPT_PRESET_LABELS:
        raise ValueError(f"不支持的 Prompt 预设: {prompt_preset}")
    return prompt_preset  # type: ignore[return-value]


def _build_qa_prompt(prompt_preset: PromptPreset) -> PromptTemplate | None:
    template = _PROMPT_TEMPLATES[prompt_preset]
    if template is None:
        return None
    return PromptTemplate(
        template=template,
        input_variables=["context", "question"],
    )


def _get_embeddings() -> DashScopeEmbeddings:
    return DashScopeEmbeddings(
        model="text-embedding-v1",
        dashscope_api_key=_require_api_key(),
    )


def collect_pdf_paths(folder_path: str) -> List[str]:
    """收集文件夹内所有 PDF（含子目录）。"""
    folder = Path(folder_path).expanduser().resolve()
    if not folder.is_dir():
        raise ValueError(f"路径不是文件夹: {folder}")

    pdfs = sorted({str(p.resolve()) for p in folder.rglob("*.pdf") if p.is_file()})
    if not pdfs:
        raise ValueError(f"文件夹内未找到 PDF 文件: {folder}")
    return pdfs


def _slugify(name: str) -> str:
    slug = re.sub(r"[^\w\u4e00-\u9fff-]+", "_", name.strip())
    slug = slug.strip("_") or "index"
    return slug[:64]


def _manifest_path(store_id: str) -> Path:
    return VECTOR_STORES_DIR / store_id / "manifest.json"


def _cleanup_incomplete_build(store_id: str, mineru_output_dirs: List[str]) -> None:
    """建库中途失败时删除未完成的向量库目录、chunk_debug 与 MinerU 输出。"""
    store_path = VECTOR_STORES_DIR / store_id
    if store_path.is_dir():
        shutil.rmtree(store_path)
    cleanup_incomplete_build_artifacts(store_id, mineru_output_dirs)


def list_vector_stores() -> List[dict]:
    VECTOR_STORES_DIR.mkdir(parents=True, exist_ok=True)
    stores = []
    for entry in sorted(VECTOR_STORES_DIR.iterdir()):
        if not entry.is_dir():
            continue
        manifest_file = entry / "manifest.json"
        if not manifest_file.exists():
            continue
        with open(manifest_file, encoding="utf-8") as f:
            manifest = json.load(f)
        stores.append(manifest)
    stores.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return stores


def build_vector_store(
    name: str,
    pdf_folder_path: str,
    route: BuildRoute,
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> dict:
    """从本地文件夹中的多个 PDF 建库并保存。"""
    manifest = None
    for event in iter_build_vector_store(
        name,
        pdf_folder_path,
        route,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    ):
        if event["type"] == "done":
            manifest = event["store"]
        elif event["type"] == "error":
            raise ValueError(event["detail"])
    if manifest is None:
        raise ValueError("建库未完成")
    return manifest


def iter_build_vector_store(
    name: str,
    pdf_folder_path: str,
    route: BuildRoute,
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> Iterator[dict]:
    """逐步执行建库并 yield 运行记录（供 SSE 流式接口使用）。"""
    total_start = time.perf_counter()
    step_start = total_start

    def emit_step(label: str, detail: str = "") -> dict:
        nonlocal step_start
        now = time.perf_counter()
        event = {
            "type": "step",
            "label": label,
            "detail": detail,
            "duration_ms": round((now - step_start) * 1000, 1),
        }
        step_start = now
        return event

    store_id: str | None = None
    mineru_output_dirs: List[str] = []
    build_succeeded = False

    try:
        _require_api_key()
        validate_chunk_params(chunk_size, chunk_overlap)

        yield emit_step("扫描 PDF 文件夹")
        pdf_paths = collect_pdf_paths(pdf_folder_path)
        yield emit_step("发现 PDF", f"{len(pdf_paths)} 个文件")

        store_id = f"{_slugify(name)}_{uuid.uuid4().hex[:8]}"
        save_path = VECTOR_STORES_DIR / store_id
        save_path.mkdir(parents=True, exist_ok=True)

        all_documents: List[Document] = []
        for index, pdf_path in enumerate(pdf_paths, start=1):
            pdf_name = Path(pdf_path).name
            yield emit_step(
                "MinerU 解析与切块",
                f"{index}/{len(pdf_paths)} · {pdf_name}",
            )
            docs, mineru_output_dir = build_documents_for_pdf(
                pdf_path,
                route,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )
            yield emit_step("MinerU 结果已保存", mineru_output_dir)
            chunks_md_path = save_pdf_chunks_debug_md(
                mineru_output_dir,
                pdf_path,
                docs,
                route=route,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )
            yield emit_step(
                "建库 Chunks 已保存",
                f"{chunks_md_path}（{len(docs)} 块）",
            )
            store_debug_path = save_pdf_store_chunks_debug_md(
                store_id,
                pdf_path,
                docs,
                route=route,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )
            yield emit_step(
                "向量库 Debug 已保存",
                f"{store_debug_path.name}（{len(docs)} 块）",
            )
            mineru_output_dirs.append(str(Path(mineru_output_dir).resolve()))
            all_documents.extend(docs)

        if not all_documents:
            raise ValueError("未能从 PDF 生成任何文本块")

        yield emit_step("向量化并写入 FAISS", f"{len(all_documents)} 块")

        embeddings = _get_embeddings()
        knowledge_base = FAISS.from_documents(all_documents, embeddings)
        knowledge_base.save_local(str(save_path))
        rebuild_bm25_index(knowledge_base, save_path)

        yield emit_step("保存向量库配置")
        manifest = {
            "id": store_id,
            "name": name.strip() or store_id,
            "route": route,
            "chunk_size": chunk_size,
            "chunk_overlap": chunk_overlap,
            "pdf_folder_path": str(Path(pdf_folder_path).expanduser().resolve()),
            "pdf_files": pdf_paths,
            "mineru_output_dirs": mineru_output_dirs,
            "chunk_count": len(all_documents),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "path": str(save_path),
        }
        with open(_manifest_path(store_id), "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)

        build_succeeded = True
        total_duration_ms = round((time.perf_counter() - total_start) * 1000, 1)
        yield {
            "type": "done",
            "store": manifest,
            "total_duration_ms": total_duration_ms,
        }
    except (ValueError, Exception) as e:
        yield {"type": "error", "detail": str(e)}
    finally:
        if store_id and not build_succeeded:
            _cleanup_incomplete_build(store_id, mineru_output_dirs)


def _load_manifest(store_id: str) -> dict:
    manifest_file = _manifest_path(store_id)
    if not manifest_file.exists():
        raise ValueError(f"向量库不存在: {store_id}")
    with open(manifest_file, encoding="utf-8") as f:
        return json.load(f)


def append_vector_store(store_id: str, pdf_folder_path: str) -> dict:
    """向已有向量库增量添加文件夹内尚未入库的 PDF。"""
    _require_api_key()
    manifest = _load_manifest(store_id)
    route: BuildRoute = manifest["route"]
    chunk_size = manifest.get("chunk_size", DEFAULT_CHUNK_SIZE)
    chunk_overlap = manifest.get("chunk_overlap", DEFAULT_CHUNK_OVERLAP)
    validate_chunk_params(chunk_size, chunk_overlap)

    pdf_paths = collect_pdf_paths(pdf_folder_path)
    existing = set(manifest.get("pdf_files", []))
    new_paths = [p for p in pdf_paths if p not in existing]
    if not new_paths:
        raise ValueError("该文件夹中未发现尚未入库的 PDF 文件")

    new_documents: List[Document] = []
    new_mineru_output_dirs: List[str] = []
    for pdf_path in new_paths:
        docs, mineru_output_dir = build_documents_for_pdf(
            pdf_path,
            route,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        save_pdf_chunks_debug_md(
            mineru_output_dir,
            pdf_path,
            docs,
            route=route,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        save_pdf_store_chunks_debug_md(
            store_id,
            pdf_path,
            docs,
            route=route,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
        new_mineru_output_dirs.append(str(Path(mineru_output_dir).resolve()))
        new_documents.extend(docs)

    if not new_documents:
        raise ValueError("未能从新增 PDF 生成任何文本块")

    save_path = VECTOR_STORES_DIR / store_id
    knowledge_base = load_knowledge_base(store_id)
    knowledge_base.add_documents(new_documents)
    knowledge_base.save_local(str(save_path))
    rebuild_bm25_index(knowledge_base, save_path)

    manifest["pdf_files"] = list(manifest.get("pdf_files", [])) + new_paths
    manifest["mineru_output_dirs"] = list(
        manifest.get("mineru_output_dirs", [])
    ) + new_mineru_output_dirs
    manifest["chunk_count"] = manifest.get("chunk_count", 0) + len(new_documents)
    manifest["updated_at"] = datetime.now(timezone.utc).isoformat()

    with open(_manifest_path(store_id), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    return manifest


def delete_vector_store(store_id: str) -> None:
    """删除向量库目录、chunk_debug、mineru_output 及该库问答历史。"""
    manifest_file = _manifest_path(store_id)
    if not manifest_file.exists():
        raise ValueError(f"向量库不存在: {store_id}")

    with open(manifest_file, encoding="utf-8") as f:
        manifest = json.load(f)

    delete_store_debug_artifacts(manifest)

    store_path = VECTOR_STORES_DIR / store_id
    if store_path.is_dir():
        shutil.rmtree(store_path)

    history = _load_chat_history()
    filtered = [item for item in history if item.get("vector_store_id") != store_id]
    if len(filtered) != len(history):
        _save_chat_history(filtered)


def load_knowledge_base(store_id: str) -> FAISS:
    store_path = VECTOR_STORES_DIR / store_id
    if not store_path.is_dir():
        raise ValueError(f"向量库不存在: {store_id}")

    embeddings = _get_embeddings()
    return FAISS.load_local(
        str(store_path),
        embeddings,
        allow_dangerous_deserialization=True,
    )


def _load_chat_history() -> List[dict]:
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not CHAT_HISTORY_PATH.exists():
        return []
    with open(CHAT_HISTORY_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save_chat_history(history: List[dict]) -> None:
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(CHAT_HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)


def list_chat_history() -> List[dict]:
    return sorted(
        _load_chat_history(),
        key=lambda x: x.get("created_at", ""),
        reverse=True,
    )


def delete_chat_history(record_id: str) -> None:
    """删除单条问答历史。"""
    history = _load_chat_history()
    filtered = [item for item in history if item.get("id") != record_id]
    if len(filtered) == len(history):
        raise ValueError(f"记录不存在: {record_id}")
    _save_chat_history(filtered)


def ask_question(
    vector_store_id: str,
    question: str,
    k: int = 4,
    model_name: str = DEFAULT_LLM_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
    prompt_preset: PromptPreset = "default",
    llm_rerank: bool = False,
    rerank_model: str = DEFAULT_RERANK_MODEL,
) -> dict:
    """对指定向量库提问并写入历史。"""
    record = None
    for event in iter_ask_question(
        vector_store_id=vector_store_id,
        question=question,
        k=k,
        model_name=model_name,
        temperature=temperature,
        prompt_preset=prompt_preset,
        llm_rerank=llm_rerank,
        rerank_model=rerank_model,
    ):
        if event["type"] == "done":
            record = event["record"]
        elif event["type"] == "error":
            raise ValueError(event["detail"])
    if record is None:
        raise ValueError("问答未完成")
    return record


def iter_ask_question(
    vector_store_id: str,
    question: str,
    k: int = 4,
    model_name: str = DEFAULT_LLM_MODEL,
    temperature: float = DEFAULT_TEMPERATURE,
    prompt_preset: PromptPreset = "default",
    llm_rerank: bool = False,
    rerank_model: str = DEFAULT_RERANK_MODEL,
) -> Iterator[dict]:
    """逐步执行问答并 yield 运行记录（供 SSE 流式接口使用）。"""
    total_start = time.perf_counter()
    step_start = total_start

    def emit_step(
        label: str,
        detail: str = "",
        *,
        token_usage: dict | None = None,
    ) -> dict:
        nonlocal step_start
        now = time.perf_counter()
        event = {
            "type": "step",
            "label": label,
            "detail": detail,
            "duration_ms": round((now - step_start) * 1000, 1),
        }
        if token_usage:
            event["token_usage"] = token_usage
        step_start = now
        return event

    try:
        _require_api_key()
        question = question.strip()
        if not question:
            raise ValueError("问题不能为空")

        model_name = _validate_llm_model(model_name)
        rerank_model = _validate_llm_model(rerank_model)
        prompt_preset = _validate_prompt_preset(prompt_preset)
        token_breakdown: list[dict] = []
        rerank_usage = None
        qa_usage = None

        yield emit_step("加载向量库")
        knowledge_base = load_knowledge_base(vector_store_id)
        store_path = VECTOR_STORES_DIR / vector_store_id

        retrieve_k = k
        if llm_rerank:
            retrieve_k = max(k * _LLM_RERANK_CANDIDATE_MULTIPLIER, _LLM_RERANK_CANDIDATE_MIN)
            retrieve_k = min(retrieve_k, 20)

        yield emit_step(
            "混合检索 (向量+BM25)",
            f"Top-K={k}" + (f"，候选 {retrieve_k}" if llm_rerank else ""),
        )
        docs_with_scores = hybrid_search_with_score(
            knowledge_base,
            store_path,
            question,
            k=retrieve_k,
        )

        if llm_rerank:
            docs_with_scores, rerank_usage = llm_rerank_documents(
                question,
                docs_with_scores,
                model_name=rerank_model,
                api_key=_require_api_key(),
                top_k=k,
            )
            if rerank_usage:
                token_breakdown.append(
                    {
                        "label": "LLM 重排",
                        "model": rerank_model,
                        **rerank_usage,
                    }
                )
            yield emit_step("LLM 重排", rerank_model, token_usage=rerank_usage)

        llm = Tongyi(
            model_name=model_name,
            dashscope_api_key=DASHSCOPE_API_KEY,
            model_kwargs={"temperature": temperature},
        )
        qa_prompt = _build_qa_prompt(prompt_preset)
        chain_kwargs = {"chain_type": "stuff"}
        if qa_prompt is not None:
            chain_kwargs["prompt"] = qa_prompt
        chain = load_qa_chain(llm, **chain_kwargs)
        docs = [doc for doc, _ in docs_with_scores]
        qa_handler = TokenUsageCallbackHandler()
        response = chain.invoke(
            {"input_documents": docs, "question": question},
            config={"callbacks": [qa_handler]},
        )
        answer = response["output_text"]
        qa_usage = qa_handler.merged_usage()
        if qa_usage:
            token_breakdown.append(
                {
                    "label": "调用 LLM 生成回答",
                    "model": model_name,
                    **qa_usage,
                }
            )
        yield emit_step(
            "调用 LLM 生成回答",
            model_name,
            token_usage=qa_usage,
        )

        yield emit_step("整理来源")
        sources = []
        for doc, score in docs_with_scores:
            sources.append(
                {
                    "page": doc.metadata.get("page", "未知"),
                    "build_route": doc.metadata.get("build_route", "未知"),
                    "source": doc.metadata.get("source", "未知"),
                    "content": doc.page_content,
                    "similarity": round(float(score), 4),
                }
            )

        store_name = _load_manifest(vector_store_id).get("name", vector_store_id)
        total_token_usage = merge_token_usages(rerank_usage, qa_usage)

        record = {
            "id": uuid.uuid4().hex,
            "vector_store_id": vector_store_id,
            "vector_store_name": store_name,
            "question": question,
            "answer": answer,
            "sources": sources,
            "k": k,
            "model": model_name,
            "temperature": temperature,
            "prompt_preset": prompt_preset,
            "llm_rerank": llm_rerank,
            "rerank_model": rerank_model if llm_rerank else None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        if total_token_usage:
            record["token_usage"] = total_token_usage
        if token_breakdown:
            record["token_breakdown"] = token_breakdown

        yield emit_step("保存问答历史")
        history = _load_chat_history()
        history.append(record)
        _save_chat_history(history)

        total_duration_ms = round((time.perf_counter() - total_start) * 1000, 1)
        done_event = {
            "type": "done",
            "record": record,
            "total_duration_ms": total_duration_ms,
        }
        if total_token_usage:
            done_event["token_usage"] = total_token_usage
        yield done_event
    except ValueError as e:
        yield {"type": "error", "detail": str(e)}
    except Exception as e:
        yield {"type": "error", "detail": str(e)}
