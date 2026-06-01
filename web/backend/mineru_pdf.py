"""
MinerU PDF 解析：通过 MinerU 云端 API 将 PDF 转为结构化文本（含 HTML 表格）。
分页优先使用 content_list.json 的 page_idx；若无则依次尝试 v2、layout.json、Markdown。
需配置环境变量 MINERU_API_KEY（OpenXLab MinerU Token）。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import List, Tuple

import requests

_MINERU_API_BASE = "https://mineru.net/api/v4"

# 跳过页眉页脚等辅助块，减少噪声
_SKIP_BLOCK_TYPES = frozenset(
    {"header", "footer", "page_number", "page_footnote", "aside_text"}
)


def _api_key() -> str:
    key = os.getenv("MINERU_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "未配置 MINERU_API_KEY。请在 .env 中设置 OpenXLab MinerU API Token。"
        )
    return key


def _api_base() -> str:
    return os.getenv("MINERU_API_BASE", _MINERU_API_BASE).rstrip("/")


def _headers() -> dict[str, str]:
    return {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {_api_key()}",
    }


def _env_str(name: str, default: str) -> str:
    return os.getenv(name, default).strip() or default


def _env_bool(name: str, default: bool) -> bool:
    return _env_str(name, str(default).lower()).lower() in ("1", "true", "yes")


def _check_api_response(resp: requests.Response) -> dict:
    resp.raise_for_status()
    body = resp.json()
    if body.get("code") != 0:
        msg = body.get("msg") or body.get("message") or str(body)
        raise RuntimeError(f"MinerU API 错误: {msg}")
    return body.get("data") or {}


# 批量任务进行中的状态（需继续轮询）
_BATCH_ACTIVE_STATES = frozenset(
    {"waiting-file", "pending", "running", "converting"}
)
_MAX_DATA_ID_LEN = 128
_WEB_DIR = Path(__file__).resolve().parents[1]
_DEFAULT_MINERU_OUTPUT_DIR = _WEB_DIR / "data" / "mineru_output"


def mineru_output_root() -> Path:
    """MinerU 解析结果根目录（与 MINERU_OUTPUT_DIR 一致）。"""
    base = Path(_env_str("MINERU_OUTPUT_DIR", str(_DEFAULT_MINERU_OUTPUT_DIR))).expanduser()
    base.mkdir(parents=True, exist_ok=True)
    return base


def _mineru_output_dir(pdf_path: Path, batch_id: str) -> Path:
    """MinerU 原始结果保存目录（zip + 解压内容，便于 debug）。"""
    out = mineru_output_root() / f"{pdf_path.stem}_{batch_id[:8]}"
    out.mkdir(parents=True, exist_ok=True)
    return out


def _mineru_data_id(pdf_path: Path) -> str:
    """MinerU files.data_id 最长 128 字符（按 UTF-8 字节计）。"""
    stem = pdf_path.stem.strip() or pdf_path.name
    if len(stem) <= _MAX_DATA_ID_LEN and len(stem.encode("utf-8")) <= _MAX_DATA_ID_LEN:
        return stem
    return hashlib.sha256(str(pdf_path.resolve()).encode()).hexdigest()[:32]


def _extract_upload_urls(data: dict) -> List[str]:
    urls: List[str] = []
    raw = data.get("file_urls") or data.get("files") or []
    for item in raw:
        if isinstance(item, str):
            urls.append(item)
        elif isinstance(item, dict):
            upload_url = item.get("url") or item.get("upload_url")
            if upload_url:
                urls.append(str(upload_url))
    return urls


def _upload_local_pdf(pdf_path: Path) -> str:
    """申请预签名上传地址并上传本地 PDF，返回 batch_id。"""
    url = f"{_api_base()}/file-urls/batch"
    payload = {
        "files": [{"name": pdf_path.name, "data_id": _mineru_data_id(pdf_path)}],
        "model_version": _env_str("MINERU_MODEL_VERSION", "pipeline"),
        "is_ocr": _env_bool("MINERU_IS_OCR", True),
        "enable_formula": _env_bool("MINERU_ENABLE_FORMULA", False),
        "enable_table": _env_bool("MINERU_ENABLE_TABLE", True),
        "language": _env_str("MINERU_LANG", "ch"),
    }
    data = _check_api_response(
        requests.post(url, headers=_headers(), json=payload, timeout=60)
    )
    batch_id = data.get("batch_id")
    if not batch_id:
        raise RuntimeError("MinerU 未返回 batch_id")

    upload_urls = _extract_upload_urls(data)
    if not upload_urls:
        raise RuntimeError("MinerU 未返回上传 URL")

    with open(pdf_path, "rb") as f:
        # 预签名 PUT 不能带 Content-Type，否则 OSS 会返回 403
        put_resp = requests.put(upload_urls[0], data=f, timeout=300)
    if put_resp.status_code not in (200, 201, 204):
        detail = (put_resp.text or "").strip()
        raise RuntimeError(
            f"MinerU 文件上传失败 (HTTP {put_resp.status_code}): {detail or '无输出'}"
        )
    return str(batch_id)


def _wait_batch_done(batch_id: str) -> str:
    """轮询批量任务直到完成，返回结果 zip 下载地址。"""
    url = f"{_api_base()}/extract-results/batch/{batch_id}"
    poll_interval = int(_env_str("MINERU_POLL_INTERVAL", "5"))
    timeout_sec = int(_env_str("MINERU_TIMEOUT", "600"))
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        data = _check_api_response(requests.get(url, headers=_headers(), timeout=60))
        results = data.get("extract_result") or []
        if not results:
            time.sleep(poll_interval)
            continue

        item = results[0]
        state = item.get("state")
        err_msg = (item.get("err_msg") or "").strip()
        if state in _BATCH_ACTIVE_STATES:
            time.sleep(poll_interval)
            continue
        if err_msg or state == "failed":
            raise RuntimeError(f"MinerU 解析失败: {err_msg or state}")
        if state == "done":
            zip_url = item.get("full_zip_url")
            if not zip_url:
                raise RuntimeError("MinerU 任务完成但未返回 full_zip_url")
            return str(zip_url)
        raise RuntimeError(f"MinerU 未知任务状态: {state}")

    raise TimeoutError(f"MinerU 解析超时 ({timeout_sec}s)")


def _download_headers() -> dict[str, str]:
    return {
        "User-Agent": "ChatPDF-Faiss/1.0",
        "Referer": "https://mineru.net/",
    }


def _download_and_extract_zip(
    zip_url: str, output_dir: Path, *, zip_path: Path | None = None
) -> Path:
    """下载 MinerU 结果 zip 并解压到 output_dir，返回 zip 文件路径。

    cdn-mineru.openxlab.org.cn 经本地 HTTP/SOCKS 代理时常出现 SSL EOF，
    因此下载阶段禁用环境代理、直连 CDN。
    """
    if zip_path is None:
        zip_path = output_dir / "mineru_result.zip"
    max_retries = int(_env_str("MINERU_DOWNLOAD_RETRIES", "5"))
    last_err: Exception | None = None

    session = requests.Session()
    session.trust_env = False

    for attempt in range(max_retries):
        try:
            if zip_path.exists():
                zip_path.unlink()
            resp = session.get(
                zip_url,
                timeout=(30, 600),
                headers=_download_headers(),
                proxies={"http": None, "https": None},
            )
            resp.raise_for_status()
            zip_path.write_bytes(resp.content)
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(output_dir)
            return zip_path
        except (
            requests.exceptions.SSLError,
            requests.exceptions.ConnectionError,
            requests.exceptions.ChunkedEncodingError,
        ) as e:
            last_err = e
            if attempt < max_retries - 1:
                time.sleep(min(2**attempt, 16))
                continue
            raise RuntimeError(
                f"MinerU 结果下载失败（已重试 {max_retries} 次）: {e}"
            ) from e
        except requests.HTTPError as e:
            status = e.response.status_code if e.response is not None else "unknown"
            raise RuntimeError(f"MinerU 结果下载失败 (HTTP {status})") from e

    if last_err is not None:
        raise RuntimeError(f"MinerU 结果下载失败: {last_err}")


def _find_markdown(output_dir: Path, pdf_stem: str) -> Path:
    candidates = sorted(output_dir.rglob(f"{pdf_stem}.md"))
    if not candidates:
        candidates = sorted(output_dir.rglob("*.md"))
    if not candidates:
        raise FileNotFoundError(f"MinerU 输出中未找到 Markdown: {output_dir}")
    return candidates[0]


def _find_content_list_v1(output_dir: Path) -> Path | None:
    """查找 *_content_list.json（排除 v2）。"""
    candidates = [
        p
        for p in sorted(output_dir.rglob("*_content_list.json"))
        if not p.name.endswith("_content_list_v2.json")
    ]
    return candidates[0] if candidates else None


def _find_content_list_v2(output_dir: Path) -> Path | None:
    candidates = sorted(output_dir.rglob("*_content_list_v2.json"))
    return candidates[0] if candidates else None


def _find_layout_json(output_dir: Path) -> Path | None:
    direct = output_dir / "layout.json"
    if direct.is_file():
        return direct
    candidates = sorted(output_dir.rglob("layout.json"))
    return candidates[0] if candidates else None


def _join_caption_lines(values: list) -> str:
    lines = [str(item).strip() for item in values if str(item).strip()]
    return "\n".join(lines)


def _block_to_text_v1(block: dict) -> str:
    """从 content_list v1 单块提取文本（保留 HTML 表格）。"""
    block_type = block.get("type", "")
    if block_type in _SKIP_BLOCK_TYPES:
        return ""

    if block_type == "text":
        return (block.get("text") or "").strip()

    if block_type == "table":
        parts: List[str] = []
        caption = _join_caption_lines(block.get("table_caption") or [])
        if caption:
            parts.append(caption)
        body = (block.get("table_body") or "").strip()
        if body:
            parts.append(body)
        footnote = _join_caption_lines(block.get("table_footnote") or [])
        if footnote:
            parts.append(footnote)
        return "\n".join(parts)

    if block_type == "chart":
        parts: List[str] = []
        content = (block.get("content") or "").strip()
        if content:
            parts.append(content)
        caption = _join_caption_lines(block.get("chart_caption") or [])
        if caption:
            parts.append(caption)
        footnote = _join_caption_lines(block.get("chart_footnote") or [])
        if footnote:
            parts.append(footnote)
        return "\n".join(parts)

    return (block.get("text") or block.get("content") or "").strip()


def _pages_from_content_list_v1(blocks: list) -> List[Tuple[int, str]]:
    """按 page_idx（0 起）聚合 content_list v1 块，页码输出为 1 起。"""
    page_parts: dict[int, List[str]] = defaultdict(list)
    for block in blocks:
        if not isinstance(block, dict):
            continue
        page_idx = block.get("page_idx")
        if page_idx is None:
            continue
        text = _block_to_text_v1(block)
        if text:
            page_parts[int(page_idx)].append(text)

    pages: List[Tuple[int, str]] = []
    for page_idx in sorted(page_parts):
        page_text = "\n\n".join(page_parts[page_idx]).strip()
        if page_text:
            pages.append((page_idx + 1, page_text))
    return pages


def _content_items_to_text(items: list) -> str:
    parts: List[str] = []
    for item in items:
        if isinstance(item, dict) and item.get("type") == "text":
            content = (item.get("content") or "").strip()
            if content:
                parts.append(content)
    return "\n".join(parts)


def _block_to_text_v2(block: dict) -> str:
    """从 content_list v2 单块提取文本。"""
    block_type = block.get("type", "")
    if block_type in _SKIP_BLOCK_TYPES:
        return ""

    content = block.get("content") or {}
    if block_type == "table":
        parts: List[str] = []
        caption = _content_items_to_text(content.get("table_caption") or [])
        if caption:
            parts.append(caption)
        html = (content.get("html") or "").strip()
        if html:
            parts.append(html)
        footnote = _content_items_to_text(content.get("table_footnote") or [])
        if footnote:
            parts.append(footnote)
        return "\n".join(parts)

    for key in ("title_content", "paragraph_content"):
        text = _content_items_to_text(content.get(key) or [])
        if text:
            return text

    if block_type == "chart":
        parts: List[str] = []
        chart_text = (content.get("content") or content.get("text") or "").strip()
        if chart_text:
            parts.append(chart_text)
        caption = _content_items_to_text(content.get("chart_caption") or [])
        if caption:
            parts.append(caption)
        footnote = _content_items_to_text(content.get("chart_footnote") or [])
        if footnote:
            parts.append(footnote)
        return "\n".join(parts)

    return ""


def _pages_from_content_list_v2(pages_blocks: list) -> List[Tuple[int, str]]:
    """content_list v2 外层数组下标即 page_idx（0 起）。"""
    pages: List[Tuple[int, str]] = []
    for page_idx, blocks in enumerate(pages_blocks):
        if not isinstance(blocks, list):
            continue
        parts: List[str] = []
        for block in blocks:
            if not isinstance(block, dict):
                continue
            text = _block_to_text_v2(block)
            if text:
                parts.append(text)
        page_text = "\n\n".join(parts).strip()
        if page_text:
            pages.append((page_idx + 1, page_text))
    return pages


def _spans_to_text(spans: list) -> str:
    parts: List[str] = []
    for span in spans:
        if isinstance(span, dict):
            content = (span.get("content") or "").strip()
            if content:
                parts.append(content)
    return "".join(parts)


def _layout_block_to_text(block: dict) -> str:
    block_type = block.get("type", "")
    if block_type in _SKIP_BLOCK_TYPES:
        return ""
    lines = block.get("lines")
    if isinstance(lines, list):
        parts: List[str] = []
        for line in lines:
            if isinstance(line, dict):
                text = _spans_to_text(line.get("spans") or [])
                if text:
                    parts.append(text)
        return "".join(parts)
    return ""


def _pages_from_layout_json(layout_path: Path) -> List[Tuple[int, str]]:
    """从 layout.json 的 pdf_info[].page_idx + preproc_blocks 提取分页文本。"""
    data = json.loads(layout_path.read_text(encoding="utf-8"))
    pdf_info = data.get("pdf_info") or []
    pages: List[Tuple[int, str]] = []
    for page in pdf_info:
        if not isinstance(page, dict):
            continue
        page_idx = page.get("page_idx")
        if page_idx is None:
            continue
        parts: List[str] = []
        for block in page.get("preproc_blocks") or []:
            if isinstance(block, dict):
                text = _layout_block_to_text(block)
                if text:
                    parts.append(text)
        page_text = "\n\n".join(parts).strip()
        if page_text:
            pages.append((int(page_idx) + 1, page_text))
    return pages


def _pages_from_markdown(md_text: str) -> List[Tuple[int, str]]:
    """从 MinerU Markdown 提取分页文本（保留 HTML 表格等原始结构）。"""
    md_text = md_text.strip()
    if not md_text:
        return []

    # MinerU 部分版本会在 md 中插入分页注释
    page_marker = re.compile(r"<!--\s*page\s*(\d+)\s*-->", re.IGNORECASE)
    matches = list(page_marker.finditer(md_text))
    if matches:
        pages: List[Tuple[int, str]] = []
        for index, match in enumerate(matches):
            page_num = int(match.group(1))
            start = match.end()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(md_text)
            content = md_text[start:end].strip()
            if content:
                pages.append((page_num, content))
        if pages:
            return pages

    return [(1, md_text)]


def _pages_from_mineru_output(output_dir: Path, pdf_stem: str) -> List[Tuple[int, str]]:
    """按 content_list → layout → Markdown 优先级提取带真实页码的分页文本。"""
    content_list_v1 = _find_content_list_v1(output_dir)
    if content_list_v1 is not None:
        blocks = json.loads(content_list_v1.read_text(encoding="utf-8"))
        if isinstance(blocks, list):
            pages = _pages_from_content_list_v1(blocks)
            if pages:
                return pages

    content_list_v2 = _find_content_list_v2(output_dir)
    if content_list_v2 is not None:
        pages_blocks = json.loads(content_list_v2.read_text(encoding="utf-8"))
        if isinstance(pages_blocks, list):
            pages = _pages_from_content_list_v2(pages_blocks)
            if pages:
                return pages

    layout_path = _find_layout_json(output_dir)
    if layout_path is not None:
        pages = _pages_from_layout_json(layout_path)
        if pages:
            return pages

    md_text = _find_markdown(output_dir, pdf_stem).read_text(encoding="utf-8")
    pages = _pages_from_markdown(md_text)
    if not pages:
        raise ValueError(f"MinerU 输出未提取到任何文本: {output_dir}")
    return pages


def _full_text_from_pages(pages: List[Tuple[int, str]]) -> Tuple[str, List[int]]:
    text = ""
    char_page_mapping: List[int] = []
    for page_num, page_text in pages:
        if not page_text:
            continue
        text += page_text
        char_page_mapping.extend([page_num] * len(page_text))
    return text, char_page_mapping


def parse_pdf_with_mineru(
    pdf_path: str,
) -> Tuple[List[Tuple[int, str]], str, List[int], str]:
    """
    解析单个 PDF。

    返回:
        pages: [(页码从 1 开始, 该页文本), ...]
        full_text: 全书拼接文本
        char_page_mapping: 每个字符对应页码
        output_dir: MinerU 原始 zip 与解压结果目录
    """
    source = Path(pdf_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"PDF 不存在: {source}")

    pdf_stem = source.stem
    batch_id = _upload_local_pdf(source)
    zip_url = _wait_batch_done(batch_id)
    output_dir = _mineru_output_dir(source, batch_id)
    zip_path = output_dir / f"{batch_id}.zip"
    _download_and_extract_zip(zip_url, output_dir, zip_path=zip_path)

    pages = _pages_from_mineru_output(output_dir, pdf_stem)
    return pages, *_full_text_from_pages(pages), str(output_dir)
