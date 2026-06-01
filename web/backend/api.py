"""
ChatPDF FastAPI 服务

在项目根目录启动:
  uvicorn web.backend.api:app --reload --host 0.0.0.0 --port 8000
"""

import json
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, model_validator

from web.backend.chunk_debug import list_chunk_debug_tree, read_chunk_debug_file
from web.backend.rag_service import (
    append_vector_store,
    build_vector_store,
    delete_chat_history,
    delete_vector_store,
    get_chat_options,
    iter_ask_question,
    iter_append_vector_store,
    iter_build_vector_store,
    list_chat_history,
    list_vector_stores,
    remove_pdf_from_vector_store,
)

app = FastAPI(title="ChatPDF FAISS API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class BuildIndexRequest(BaseModel):
    name: str = Field(..., min_length=1, description="向量库显示名称")
    pdf_folder_path: str = Field(..., min_length=1, description="本地 PDF 文件夹路径")
    route: Literal["per_page", "full_text"] = "full_text"
    chunk_size: int = Field(default=300, ge=100, le=8000)
    chunk_overlap: int = Field(default=50, ge=0, le=2000)

    @model_validator(mode="after")
    def validate_chunk_overlap(self):
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("chunk_overlap 必须小于 chunk_size")
        return self


class AppendDataSourceRequest(BaseModel):
    pdf_folder_path: str = Field(..., min_length=1, description="本地 PDF 文件夹路径")


class RemovePdfRequest(BaseModel):
    pdf_path: str = Field(..., min_length=1, description="待删除 PDF 的绝对路径")


class AskRequest(BaseModel):
    vector_store_id: str
    question: str = Field(..., min_length=1)
    k: int = Field(default=4, ge=1, le=20)
    model: str = Field(default="deepseek-v3", description="LLM 模型名称")
    temperature: float = Field(default=0.1, ge=0.0, le=1.0)
    prompt_preset: Literal["default", "strict", "concise", "detailed"] = "default"
    llm_rerank: bool = Field(default=False, description="是否启用 LLM 重排")
    rerank_model: str = Field(default="qwen-turbo", description="LLM 重排模型名称")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/vector-stores")
def get_vector_stores():
    return {"stores": list_vector_stores()}


@app.post("/api/vector-stores/build/stream")
def build_vector_store_stream_endpoint(body: BuildIndexRequest):
    def event_generator():
        for event in iter_build_vector_store(
            name=body.name,
            pdf_folder_path=body.pdf_folder_path,
            route=body.route,
            chunk_size=body.chunk_size,
            chunk_overlap=body.chunk_overlap,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/vector-stores/build")
def build_vector_store_endpoint(body: BuildIndexRequest):
    try:
        manifest = build_vector_store(
            name=body.name,
            pdf_folder_path=body.pdf_folder_path,
            route=body.route,
            chunk_size=body.chunk_size,
            chunk_overlap=body.chunk_overlap,
        )
        return {"ok": True, "store": manifest}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/vector-stores/{store_id}/append/stream")
def append_vector_store_stream_endpoint(
    store_id: str, body: AppendDataSourceRequest
):
    def event_generator():
        for event in iter_append_vector_store(
            store_id=store_id,
            pdf_folder_path=body.pdf_folder_path,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/vector-stores/{store_id}/append")
def append_vector_store_endpoint(store_id: str, body: AppendDataSourceRequest):
    try:
        manifest = append_vector_store(
            store_id=store_id,
            pdf_folder_path=body.pdf_folder_path,
        )
        return {"ok": True, "store": manifest}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.delete("/api/vector-stores/{store_id}/pdfs")
def remove_pdf_from_store_endpoint(store_id: str, body: RemovePdfRequest):
    try:
        manifest = remove_pdf_from_vector_store(store_id, body.pdf_path)
        return {"ok": True, "store": manifest}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.delete("/api/vector-stores/{store_id}")
def delete_vector_store_endpoint(store_id: str):
    try:
        delete_vector_store(store_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/chat/options")
def chat_options():
    return get_chat_options()


@app.get("/api/chat/history")
def get_chat_history():
    return {"history": list_chat_history()}


@app.delete("/api/chat/history/{record_id}")
def delete_chat_record(record_id: str):
    try:
        delete_chat_history(record_id)
        return {"ok": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/chunk-debug/tree")
def chunk_debug_tree():
    return list_chunk_debug_tree()


@app.get("/api/chunk-debug/file")
def chunk_debug_file(path: str):
    try:
        return read_chunk_debug_file(path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.post("/api/chat/stream")
def chat_stream_endpoint(body: AskRequest):
    def event_generator():
        for event in iter_ask_question(
            vector_store_id=body.vector_store_id,
            question=body.question,
            k=body.k,
            model_name=body.model,
            temperature=body.temperature,
            prompt_preset=body.prompt_preset,
            llm_rerank=body.llm_rerank,
            rerank_model=body.rerank_model,
        ):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
