"""
建库 chunks 调试 Markdown 导出与清理。
"""

from __future__ import annotations

import os
import re
import shutil
from pathlib import Path
from typing import List

from langchain_core.documents import Document

from web.backend.mineru_pdf import mineru_output_root
from web.backend.text_splitter import BuildRoute

_WEB_DATA_DIR = Path(__file__).resolve().parents[1] / "data"
_DEFAULT_CHUNK_DEBUG_DIR = _WEB_DATA_DIR / "chunk_debug"


def chunk_debug_dir() -> Path:
    """建库 chunk 调试 Markdown 根目录。"""
    base = os.getenv("CHUNK_DEBUG_DIR", str(_DEFAULT_CHUNK_DEBUG_DIR)).strip()
    path = Path(base).expanduser()
    path.mkdir(parents=True, exist_ok=True)
    return path


def _md_code_fence(content: str, lang: str = "text") -> str:
    """生成 Markdown 代码块，避免正文中的 ``` 破坏围栏。"""
    fence = "```"
    while fence in content:
        fence = "`" * (len(fence) + 1)
    return f"{fence}{lang}\n{content}\n{fence}"


def _chunk_has_table(content: str) -> bool:
    return "<table" in content.lower()


def _format_chunks_markdown(
    *,
    title: str,
    pdf_path: str | None,
    route: BuildRoute,
    chunk_size: int,
    chunk_overlap: int,
    documents: List[Document],
    chunk_index_offset: int = 0,
) -> str:
    """将 Document 列表格式化为便于人工检查的 Markdown。"""
    lines = [
        f"# {title}",
        "",
        "| 项 | 值 |",
        "| --- | --- |",
    ]
    if pdf_path:
        lines.append(f"| PDF | `{pdf_path}` |")
    lines.extend(
        [
            f"| 路由 | `{route}` |",
            f"| chunk_size | {chunk_size} |",
            f"| chunk_overlap | {chunk_overlap} |",
            f"| 块数 | {len(documents)} |",
            "",
            "---",
            "",
        ]
    )
    for local_index, doc in enumerate(documents):
        global_index = chunk_index_offset + local_index
        meta = doc.metadata
        page = meta.get("page", "未知")
        build_route = meta.get("build_route", route)
        content = doc.page_content
        has_table = _chunk_has_table(content)
        lines.extend(
            [
                f"## Chunk {global_index}",
                "",
                f"- **页码**: {page}",
                f"- **路由**: {build_route}",
                f"- **字符数**: {len(content)}",
                f"- **含 HTML 表格**: {'是' if has_table else '否'}",
                "",
                _md_code_fence(content),
                "",
                "---",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def save_pdf_chunks_debug_md(
    mineru_output_dir: str,
    pdf_path: str,
    documents: List[Document],
    *,
    route: BuildRoute,
    chunk_size: int,
    chunk_overlap: int,
) -> Path:
    """保存单个 PDF 的建库 chunks 到 MinerU debug 目录。"""
    out_dir = Path(mineru_output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "build_chunks.md"
    body = _format_chunks_markdown(
        title="建库 Chunks（MinerU Debug）",
        pdf_path=pdf_path,
        route=route,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        documents=documents,
    )
    out_path.write_text(body, encoding="utf-8")
    return out_path


def _pdf_debug_md_basename(pdf_path: str) -> str:
    """由 PDF 文件名生成 debug Markdown 的安全文件名（不含扩展名）。"""
    stem = Path(pdf_path).stem
    safe = re.sub(r"[^\w\u4e00-\u9fff-]+", "_", stem).strip("_") or "document"
    return safe[:80]


def _pdf_store_debug_md_paths(store_id: str, pdf_path: str) -> List[Path]:
    """列出 chunk_debug/{store_id}/ 下某 PDF 对应的 debug Markdown 路径。"""
    out_dir = chunk_debug_dir() / store_id
    if not out_dir.is_dir():
        return []

    base = _pdf_debug_md_basename(pdf_path)
    paths: List[Path] = []
    primary = out_dir / f"{base}.md"
    if primary.is_file():
        paths.append(primary)
    for item in out_dir.glob(f"{base}_*.md"):
        if item.is_file():
            paths.append(item)
    return paths


def delete_pdf_store_chunks_debug_files(store_id: str, pdf_path: str) -> None:
    """删除某 PDF 在 chunk_debug/{store_id}/ 下的 debug 文件（含历史后缀副本）。"""
    for path in _pdf_store_debug_md_paths(store_id, pdf_path):
        path.unlink(missing_ok=True)


def delete_orphan_mineru_output_for_pdf(pdf_path: str, manifest: dict) -> None:
    """删除 mineru_output 下该 PDF 未写入 manifest 的孤立目录（如上次入库失败残留）。"""
    root = mineru_output_root().resolve()
    stem = Path(pdf_path).stem
    if not stem or not root.is_dir():
        return

    recorded = {
        Path(raw).expanduser().resolve()
        for raw in manifest.get("mineru_output_dirs", [])
        if raw
    }
    prefix = f"{stem}_"
    for item in root.iterdir():
        if not item.is_dir() or not item.name.startswith(prefix):
            continue
        resolved = item.resolve()
        if resolved in recorded:
            continue
        if _path_under_root(resolved, root):
            shutil.rmtree(resolved)


def collect_mineru_output_dirs_for_pdf(manifest: dict, pdf_path: str) -> List[str]:
    """查找某 PDF 在 manifest 或 mineru_output 根目录下对应的 MinerU 输出目录。"""
    target = str(Path(pdf_path).expanduser().resolve())
    pdf_files = manifest.get("pdf_files", [])
    mineru_dirs = manifest.get("mineru_output_dirs", [])
    found: List[str] = []

    for index, raw in enumerate(pdf_files):
        if str(Path(raw).expanduser().resolve()) != target:
            continue
        if index < len(mineru_dirs) and mineru_dirs[index]:
            found.append(str(Path(mineru_dirs[index]).expanduser().resolve()))
        break

    if found:
        return found

    stem = Path(pdf_path).stem
    root = mineru_output_root().resolve()
    if not stem or not root.is_dir():
        return found

    prefix = f"{stem}_"
    for item in root.iterdir():
        if not item.is_dir() or not item.name.startswith(prefix):
            continue
        resolved = item.resolve()
        if _path_under_root(resolved, root):
            found.append(str(resolved))
    return found


def delete_mineru_output_for_pdf(manifest: dict, pdf_path: str) -> None:
    """删除某 PDF 关联的 MinerU 输出目录。"""
    delete_mineru_output_dirs(collect_mineru_output_dirs_for_pdf(manifest, pdf_path))


def cleanup_failed_append_artifacts(
    store_id: str,
    pdf_paths: List[str],
    mineru_output_dirs: List[str],
) -> None:
    """增量入库失败时清理本次 MinerU 输出与 chunk_debug 文件。"""
    delete_mineru_output_dirs(mineru_output_dirs)
    for pdf_path in pdf_paths:
        delete_pdf_store_chunks_debug_files(store_id, pdf_path)


def save_pdf_store_chunks_debug_md(
    store_id: str,
    pdf_path: str,
    documents: List[Document],
    *,
    route: BuildRoute,
    chunk_size: int,
    chunk_overlap: int,
) -> Path:
    """建库或增量追加时，为单个 PDF 在 chunk_debug/{store_id}/ 下保存一份 Markdown。"""
    out_dir = chunk_debug_dir() / store_id
    out_dir.mkdir(parents=True, exist_ok=True)
    delete_pdf_store_chunks_debug_files(store_id, pdf_path)
    base = _pdf_debug_md_basename(pdf_path)
    out_path = out_dir / f"{base}.md"
    body = _format_chunks_markdown(
        title=f"Chunks · {Path(pdf_path).name}",
        pdf_path=pdf_path,
        route=route,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        documents=documents,
    )
    out_path.write_text(body, encoding="utf-8")
    return out_path


def _path_under_root(path: Path, root: Path) -> bool:
    """校验路径在 root 之下，避免误删 manifest 中的异常路径。"""
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _collect_mineru_output_dirs(manifest: dict) -> List[Path]:
    """汇总 manifest 记录的 MinerU 目录；旧库无记录时按 PDF 文件名 stem 匹配。"""
    root = mineru_output_root().resolve()
    seen: set[Path] = set()
    dirs: List[Path] = []

    def _add(candidate: Path) -> None:
        resolved = candidate.expanduser().resolve()
        if not resolved.is_dir():
            return
        if not _path_under_root(resolved, root):
            return
        if resolved in seen:
            return
        seen.add(resolved)
        dirs.append(resolved)

    for raw in manifest.get("mineru_output_dirs", []):
        if raw:
            _add(Path(raw))

    if dirs:
        return dirs

    for pdf in manifest.get("pdf_files", []):
        stem = Path(pdf).stem
        if not stem or not root.is_dir():
            continue
        for item in root.iterdir():
            if item.is_dir() and item.name.startswith(f"{stem}_"):
                _add(item)
    return dirs


def delete_store_chunk_debug_dir(store_id: str) -> None:
    """删除 chunk_debug 下某向量库的子目录。"""
    if not store_id:
        return
    debug_root = chunk_debug_dir().resolve()
    debug_dir = (debug_root / store_id).resolve()
    if debug_dir.is_dir() and _path_under_root(debug_dir, debug_root):
        shutil.rmtree(debug_dir)


def delete_mineru_output_dirs(paths: List[str]) -> None:
    """删除本次建库记录的 MinerU 输出目录（路径须在 mineru_output 根目录下）。"""
    root = mineru_output_root().resolve()
    seen: set[Path] = set()
    for raw in paths:
        if not raw:
            continue
        candidate = Path(raw).expanduser().resolve()
        if not candidate.is_dir() or not _path_under_root(candidate, root):
            continue
        if candidate in seen:
            continue
        seen.add(candidate)
        shutil.rmtree(candidate)


def cleanup_incomplete_build_artifacts(
    store_id: str,
    mineru_output_dirs: List[str],
) -> None:
    """建库未成功时清理 chunk_debug 与 MinerU 输出（向量库目录由 rag_service 删除）。"""
    delete_store_chunk_debug_dir(store_id)
    delete_mineru_output_dirs(mineru_output_dirs)


def delete_store_debug_artifacts(manifest: dict) -> None:
    """删除向量库关联的 chunk_debug 目录与 mineru_output 任务目录。"""
    store_id = manifest.get("id", "")
    delete_store_chunk_debug_dir(store_id)

    dirs = _collect_mineru_output_dirs(manifest)
    delete_mineru_output_dirs([str(path) for path in dirs])


def _should_skip_debug_entry(item: Path, *, at_root: bool) -> bool:
    """忽略隐藏文件；根目录只展示子文件夹。"""
    if item.name.startswith("."):
        return True
    if at_root and not item.is_dir():
        return True
    return False


def _build_debug_tree(base: Path, current: Path) -> List[dict]:
    """递归构建 chunk_debug 目录树（仅子文件夹及其内部文件）。"""
    nodes: List[dict] = []
    if not current.is_dir():
        return nodes

    at_root = current == base
    entries = sorted(
        (
            item
            for item in current.iterdir()
            if not _should_skip_debug_entry(item, at_root=at_root)
        ),
        key=lambda item: (not item.is_dir(), item.name.lower()),
    )
    for item in entries:
        rel_path = item.relative_to(base).as_posix()
        if item.is_dir():
            children = _build_debug_tree(base, item)
            if not children:
                continue
            nodes.append(
                {
                    "name": item.name,
                    "path": rel_path,
                    "type": "dir",
                    "children": children,
                }
            )
        elif item.is_file():
            nodes.append(
                {
                    "name": item.name,
                    "path": rel_path,
                    "type": "file",
                    "size": item.stat().st_size,
                }
            )
    return nodes


def list_chunk_debug_tree() -> dict:
    """返回 chunk_debug 根目录及树形结构。"""
    root = chunk_debug_dir()
    return {
        "root": str(root),
        "tree": _build_debug_tree(root, root),
    }


def _resolve_debug_file(relative_path: str) -> Path:
    """解析相对路径并校验仍在 chunk_debug 根目录内。"""
    root = chunk_debug_dir().resolve()
    target = (root / relative_path).resolve()
    if target != root and root not in target.parents:
        raise ValueError("非法路径")
    return target


def read_chunk_debug_file(relative_path: str) -> dict:
    """读取 chunk_debug 下的文本文件内容。"""
    relative_path = relative_path.strip().lstrip("/")
    if not relative_path:
        raise ValueError("路径不能为空")

    target = _resolve_debug_file(relative_path)
    if not target.is_file():
        raise ValueError("文件不存在")
    if target.name.startswith("."):
        raise ValueError("不支持读取隐藏文件")

    return {
        "path": relative_path,
        "content": target.read_text(encoding="utf-8"),
        "size": target.stat().st_size,
    }
