from __future__ import annotations

import tiktoken
from web.backend.text_splitter import build_documents_per_page


def test_per_page_route_uses_token_chunks_without_crossing_pages() -> None:
    pages = [
        (1, "第一页 " + "alpha " * 180),
        (2, "第二页 " + "beta " * 180),
    ]

    documents = build_documents_per_page(
        pages,
        "/tmp/example.pdf",
        chunk_size=100,
        chunk_overlap=20,
    )

    encoding = tiktoken.get_encoding("cl100k_base")
    assert {doc.metadata["page"] for doc in documents} == {1, 2}
    assert all(len(encoding.encode(doc.page_content)) <= 100 for doc in documents)
    assert all(
        not ("第一页" in doc.page_content and "第二页" in doc.page_content)
        for doc in documents
    )
    assert all(doc.metadata["build_route"] == "per_page" for doc in documents)
    assert [doc.metadata["chunk_index"] for doc in documents] == list(
        range(len(documents))
    )
