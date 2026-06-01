# Chunk Debug 说明

用于保存建库过程中生成的切块调试文件（Markdown 格式），方便在 Web 端 Debug 面板中查看和排查问题。

- 默认路径为 `web/data/chunk_debug`，可通过项目根目录 `.env` 中的 `CHUNK_DEBUG_DIR` 修改。
- 文档右上角支持 **源码** 与 **Markdown 预览** 切换。

---

## 目录结构概览

```
web/data/
├── vector_stores/          # 向量库运行时数据（FAISS、manifest、BM25）
│   └── {store_id}/         # 每个向量库一个文件夹
├── chunk_debug/            # 本说明所在目录
│   ├── 00-说明/          # 固定说明文档（不参与建库）
│   │   └── README.md
│   └── {store_id}/         # 与向量库一一对应
│       └── {pdf名}.md      # 每个 PDF 一份切块调试文件
└── mineru_output/        # MinerU 解析原始结果
    └── {pdf任务目录}/
        └── build_chunks.md
```

---

## 向量库的创建与更新

| 操作 | Debug 文件变化 |
|--------|--------|
| 新建向量库 | 在 `{store_id}/` 下为每个 PDF 生成 `{文件名}.md` |
| 向已有库追加 PDF | 为每个新增 PDF 再生成一份 `{文件名}.md`（同名则加随机后缀） |

- 每次**新建向量库**或**对现有库追加「文档」增量更新**时，会在 `chunk_debug/` 下创建/更新子目录 **`{store_id}/`**。
- `store_id` 与 `web/data/vector_stores/{store_id}/` 中的向量库 ID **相同**（格式通常为：`名称_slug_随机8位`，例如 `doc3_19da49cf`）。
- **删除向量库**时，会同步删除 `chunk_debug/{store_id}/`、manifest 中记录的各 `mineru_output` 任务目录，以及该库相关的问答历史（见 `chunk_debug.delete_store_debug_artifacts` 与 `rag_service.delete_vector_store`）。
- **建库失败**（未写入 `manifest.json`）时，会自动删除本次产生的 `vector_stores/{store_id}/`、`chunk_debug/{store_id}/` 及已记录的 MinerU 输出目录，避免残留。

---

## {pdf名}.md 包含什么

每个 `{pdf名}.md` 对应该 PDF 一次入库时的切块结果。内容通常包含：

| 内容 | 说明 |
|--------|--------|
| 向量库信息 | 向量库 ID、参与建库的 PDF 路径 |
| 建库参数 | 路由模式（`per_page` / `full_text`）、`chunk_size`、`chunk_overlap`、总块数 |
| Chunk 信息 | 页码、路由方式、字符数、是否包含 HTML 表格 |
| Chunk 正文 | 实际送入 Embedding 的文本内容 |

用于检查：切块是否过长/过碎、页码是否合理、表格是否被正确保留、Chunk 内容是否符合预期等。

### 与 mineru_output 的区别

建库时，每个「文档」还会在 MinerU 输出目录生成一个 `build_chunks.md`（路径记录在向量库 `manifest.json` 的 `mineru_output_dirs` 中）。

| 文件位置 | 粒度 | 用途 |
|----------|----------|----------|
| `chunk_debug/{store_id}/{pdf名}.md` | 单个 PDF | 该 PDF 的切块结果，Debug 面板按文件浏览 |
| `mineru_output/.../build_chunks.md` | 单个 PDF | 用于核对 MinerU 解析结果与单文件切块结果 |

---

## 相关代码

| 文件 | 作用 |
|--------|--------|
| `web/backend/chunk_debug.py` | 写入、删除、读取调试文件 |
| `web/backend/rag_service.py` | 在建库、追加和删库时调用调试逻辑 |
| `web/frontend/components/DebugPanel.tsx` | 文件内容预览 |
| `web/frontend/components/DocsTreeSection.tsx` | Debug 文件树展示 |

后端接口：

- `GET /api/chunk-debug/tree` — 返回本目录树
- `GET /api/chunk-debug/file?path=` — 读取相对路径下的文本（如 `00-说明/README.md`）
