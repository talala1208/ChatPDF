"""
PDF 文本切块：表格整表保留；超长表格按行拆分并重复表头（适配 Embedding 长度上限）。
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import List, Literal, Tuple

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from web.backend.mineru_pdf import parse_pdf_with_mineru

BuildRoute = Literal["per_page", "full_text"]

DEFAULT_CHUNK_SIZE = 300
DEFAULT_CHUNK_OVERLAP = 50

# DashScope text-embedding-v1 单条输入字符上限
MAX_EMBEDDING_CHARS = 2048

# HTML 表格作为原子单元，切块时不切分 <table>...</table>（超长时另按行拆分）
_TABLE_HTML_PATTERN = re.compile(
    r"<table\b[^>]*>.*?</table>", re.IGNORECASE | re.DOTALL
)
_TR_PATTERN = re.compile(r"<tr\b[^>]*>.*?</tr>", re.IGNORECASE | re.DOTALL)
_THEAD_PATTERN = re.compile(r"<thead\b[^>]*>.*?</thead>", re.IGNORECASE | re.DOTALL)
# 表格前后短文本（表题、来源、脚注）与表格合并为一个 chunk
_TABLE_PREFIX_MAX_LEN = 150
_TABLE_SUFFIX_MAX_LEN = 120
_TABLE_CAPTION_PATTERN = re.compile(r"表\s*[\d一二三四五六七八九十]+")


def validate_chunk_params(chunk_size: int, chunk_overlap: int) -> None:
    if chunk_size < 100:
        raise ValueError("chunk_size 不能小于 100")
    if chunk_overlap < 0:
        raise ValueError("chunk_overlap 不能小于 0")
    if chunk_overlap >= chunk_size:
        raise ValueError("chunk_overlap 必须小于 chunk_size")


def _make_text_splitter(
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    add_start_index: bool = False,
) -> RecursiveCharacterTextSplitter:
    validate_chunk_params(chunk_size, chunk_overlap)
    return RecursiveCharacterTextSplitter(
        separators=["\n\n", "\n", ".", " ", ""],
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        add_start_index=add_start_index,
    )


def _is_table_prefix_plain(text: str) -> bool:
    """判断表格前的短文本是否应并入表格 chunk（表题/来源说明等）。"""
    stripped = text.strip()
    if not stripped or len(stripped) > _TABLE_PREFIX_MAX_LEN:
        return False
    if _TABLE_CAPTION_PATTERN.search(stripped):
        return True
    if "资料来源" in stripped:
        return True
    return len(stripped) <= 80 and "\n\n" not in stripped


def _is_table_suffix_plain(text: str) -> bool:
    """判断表格后的短文本是否应并入表格 chunk（脚注/来源等）。"""
    stripped = text.strip()
    if not stripped or len(stripped) > _TABLE_SUFFIX_MAX_LEN:
        return False
    if stripped.startswith("资料来源") or stripped.startswith("注："):
        return True
    return len(stripped) <= 60


def _split_inter_table_plain(text: str) -> Tuple[str, str]:
    """将两表之间的短文本拆成（前表脚注, 后表标题）。"""
    stripped = text.strip()
    if not stripped:
        return "", ""
    match = _TABLE_CAPTION_PATTERN.search(stripped)
    if not match:
        return stripped, ""
    footnote = stripped[: match.start()].strip()
    caption = stripped[match.start() :].strip()
    return footnote, caption


def _split_trailing_caption_plain(text: str) -> Tuple[str, str]:
    """将末尾短表题行拆出（如「中芯国际盈利预测与估值简表」）。"""
    stripped = text.strip()
    if not stripped or "\n\n" not in stripped:
        return stripped, ""
    parts = [part.strip() for part in stripped.split("\n\n") if part.strip()]
    if len(parts) < 2:
        return stripped, ""
    tail = parts[-1]
    if len(tail) <= 80 and not tail.endswith("。"):
        body = "\n\n".join(parts[:-1]).strip()
        return body, tail
    return stripped, ""


def _expand_inter_table_plain_segments(
    segments: List[Tuple[str, bool]],
) -> List[Tuple[str, bool]]:
    """拆分夹在两表之间的「来源说明 + 下一表表题」混合短文本。"""
    expanded: List[Tuple[str, bool]] = []
    for text, is_table in segments:
        if is_table:
            expanded.append((text, True))
            continue
        footnote, caption = _split_inter_table_plain(text)
        if caption:
            if footnote:
                expanded.append((footnote, False))
            expanded.append((caption, False))
            continue
        body, tail_caption = _split_trailing_caption_plain(footnote or text)
        if tail_caption:
            if body:
                expanded.append((body, False))
            expanded.append((tail_caption, False))
            continue
        if footnote:
            expanded.append((footnote, False))
        else:
            expanded.append((text, False))
    return expanded


def _merge_table_adjacent_segments(
    segments: List[Tuple[str, bool]],
) -> List[Tuple[str, bool]]:
    """将表前表题、表后脚注等短文本与相邻 <table> 合并为同一 chunk。"""
    merged: List[Tuple[str, bool]] = []
    index = 0
    while index < len(segments):
        text, is_table = segments[index]

        if (
            not is_table
            and index + 1 < len(segments)
            and segments[index + 1][1]
            and _is_table_prefix_plain(text)
        ):
            combined = text + segments[index + 1][0]
            next_index = index + 2
            if (
                next_index < len(segments)
                and not segments[next_index][1]
                and _is_table_suffix_plain(segments[next_index][0])
            ):
                combined += segments[next_index][0]
                next_index += 1
            merged.append((combined, True))
            index = next_index
            continue

        if is_table:
            combined = text
            next_index = index + 1
            if (
                next_index < len(segments)
                and not segments[next_index][1]
                and _is_table_suffix_plain(segments[next_index][0])
            ):
                combined += segments[next_index][0]
                next_index += 1
            merged.append((combined, True))
            index = next_index
            continue

        merged.append((text, is_table))
        index += 1

    return merged


def _extract_table_header_and_rows(table_html: str) -> Tuple[str, str, List[str], str] | None:
    """解析 table HTML 为 (open_tag, header_html, data_rows, close_tag)。"""
    match = re.match(
        r"(<table\b[^>]*>)(.*?)(</table>)",
        table_html.strip(),
        re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return None

    open_tag, inner, close_tag = match.groups()
    thead_match = _THEAD_PATTERN.search(inner)
    if thead_match:
        header_html = thead_match.group(0)
        body_inner = inner[thead_match.end() :]
        tbody_open = re.match(r"<tbody\b[^>]*>", body_inner, re.IGNORECASE)
        if tbody_open:
            body_inner = body_inner[tbody_open.end() :]
            if body_inner.lower().endswith("</tbody>"):
                body_inner = body_inner[: -len("</tbody>")]
        rows = _TR_PATTERN.findall(body_inner)
        return open_tag, header_html, rows, close_tag

    rows = _TR_PATTERN.findall(inner)
    if len(rows) < 2:
        return None
    return open_tag, rows[0], rows[1:], close_tag


def _split_table_html_by_rows(table_html: str, max_chars: int) -> List[str]:
    """将超长 table HTML 按数据行拆成多段，每段重复表头。"""
    if len(table_html) <= max_chars:
        return [table_html]

    parsed = _extract_table_header_and_rows(table_html)
    if parsed is None:
        return [table_html]

    open_tag, header_html, data_rows, close_tag = parsed
    if not data_rows:
        return [table_html]

    header_block = open_tag + header_html
    chunks: List[str] = []
    batch: List[str] = []

    def flush_batch() -> None:
        if batch:
            chunks.append(header_block + "".join(batch) + close_tag)
            batch.clear()

    for row in data_rows:
        candidate = header_block + "".join(batch + [row]) + close_tag
        if len(candidate) > max_chars and batch:
            flush_batch()
            batch.append(row)
            if len(header_block + row + close_tag) > max_chars:
                flush_batch()
            continue
        batch.append(row)

    flush_batch()
    return chunks if chunks else [table_html]


def _split_oversized_table_segment(
    segment: str, max_chars: int = MAX_EMBEDDING_CHARS
) -> List[str]:
    """拆分含 HTML 表格的超长片段；表前/表后短文本分别并入首段/末段。"""
    if len(segment) <= max_chars:
        return [segment]

    table_match = _TABLE_HTML_PATTERN.search(segment)
    if not table_match:
        return [segment]

    before = segment[: table_match.start()]
    after = segment[table_match.end() :]
    table_html = table_match.group(0)

    first_limit = max(max_chars - len(before), 200)
    table_chunks = _split_table_html_by_rows(table_html, first_limit)
    if len(table_chunks) <= 1 and len(table_html) > first_limit:
        table_chunks = _split_table_html_by_rows(table_html, max_chars)

    if len(table_chunks) <= 1:
        return [segment]

    result: List[str] = []
    for index, table_part in enumerate(table_chunks):
        part = table_part
        if index == 0:
            part = before + part
        if index == len(table_chunks) - 1:
            part = part + after
        result.append(part)
    return result


def _split_segments_preserving_tables(text: str) -> List[Tuple[str, bool]]:
    """将文本拆成 [(片段, 是否为完整 HTML 表格), ...]。"""
    segments: List[Tuple[str, bool]] = []
    last_end = 0
    for match in _TABLE_HTML_PATTERN.finditer(text):
        if match.start() > last_end:
            segments.append((text[last_end : match.start()], False))
        segments.append((match.group(0), True))
        last_end = match.end()
    if last_end < len(text):
        segments.append((text[last_end:], False))
    if not segments:
        segments.append((text, False))
    return segments


def _page_from_char_mapping(
    start_index: int, chunk_len: int, char_page_mapping: List[int]
) -> int:
    if start_index < 0 or chunk_len <= 0:
        return 1

    chunk_pages = char_page_mapping[start_index : start_index + chunk_len]
    if not chunk_pages:
        return 1

    page_counts = {}
    for page in chunk_pages:
        page_counts[page] = page_counts.get(page, 0) + 1
    return max(page_counts, key=page_counts.get)


def _split_content_to_documents(
    text: str,
    base_metadata: dict,
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
    char_page_mapping: List[int] | None = None,
    text_offset: int = 0,
) -> List[Document]:
    """切块：普通文本按 chunk_size 切；HTML 表格整表保留，超 Embedding 上限则按行拆分。"""
    documents: List[Document] = []
    plain_splitter = _make_text_splitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        add_start_index=char_page_mapping is not None,
    )

    for segment, is_table in _merge_table_adjacent_segments(
        _expand_inter_table_plain_segments(_split_segments_preserving_tables(text))
    ):
        if not segment.strip():
            continue

        segment_start = text_offset

        if is_table:
            table_parts = _split_oversized_table_segment(segment)
            for part_index, part in enumerate(table_parts):
                meta = dict(base_metadata)
                if len(table_parts) > 1:
                    meta["table_part"] = part_index + 1
                    meta["table_parts"] = len(table_parts)
                if char_page_mapping is not None:
                    meta["page"] = _page_from_char_mapping(
                        segment_start, len(segment), char_page_mapping
                    )
                    meta["start_index"] = segment_start
                documents.append(Document(page_content=part, metadata=meta))
        else:
            sub_docs = plain_splitter.create_documents(
                [segment], metadatas=[dict(base_metadata)]
            )
            for doc in sub_docs:
                if char_page_mapping is not None:
                    rel_start = doc.metadata.get("start_index", 0)
                    abs_start = segment_start + rel_start
                    doc.metadata["start_index"] = abs_start
                    doc.metadata["page"] = _page_from_char_mapping(
                        abs_start, len(doc.page_content), char_page_mapping
                    )
                documents.append(doc)

        text_offset += len(segment)

    return documents


def build_documents_per_page(
    pages: List[Tuple[int, str]],
    source: str,
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> List[Document]:
    page_documents = []
    for page_number, extracted_text in pages:
        if extracted_text.strip():
            page_documents.append(
                Document(
                    page_content=extracted_text,
                    metadata={
                        "page": page_number,
                        "source": source,
                        "build_route": "per_page",
                    },
                )
            )

    if not page_documents:
        raise ValueError(f"PDF 未提取到任何文本: {source}")

    documents: List[Document] = []
    for page_doc in page_documents:
        documents.extend(
            _split_content_to_documents(
                page_doc.page_content,
                dict(page_doc.metadata),
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )
        )

    for chunk_index, doc in enumerate(documents):
        doc.metadata["chunk_index"] = chunk_index
        doc.metadata.setdefault("build_route", "per_page")

    return documents


def build_documents_full_text(
    text: str,
    char_page_mapping: List[int],
    source: str,
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> List[Document]:
    base_metadata = {"source": source, "build_route": "full_text"}
    documents = _split_content_to_documents(
        text,
        base_metadata,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        char_page_mapping=char_page_mapping,
    )

    for chunk_index, doc in enumerate(documents):
        doc.metadata["chunk_index"] = chunk_index
        doc.metadata["build_route"] = "full_text"

    return documents


def build_documents_for_pdf(
    pdf_path: str,
    route: BuildRoute,
    *,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    chunk_overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> Tuple[List[Document], str]:
    source = str(Path(pdf_path).resolve())
    pages, text, char_page_mapping, mineru_output_dir = parse_pdf_with_mineru(source)

    if route == "per_page":
        return build_documents_per_page(
            pages,
            source,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        ), mineru_output_dir
    return build_documents_full_text(
        text,
        char_page_mapping,
        source,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    ), mineru_output_dir
