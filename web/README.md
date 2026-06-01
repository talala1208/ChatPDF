# ChatPDF Web — Agent 快速上下文

> **新 Agent 会话请先读本文件**，再按需打开具体源码。目标：少扫目录、少重复问用户。

**当前版本：v0.4.0**（UI 展示与更新记录见 `frontend/lib/app-versions.ts`，根目录 `README.md` 同步对外版本号）

## 项目是什么

基于 **MinerU 解析 PDF → DashScope Embedding → FAISS 向量库 + BM25 混合检索 → 通义/DeepSeek LLM 问答** 的 ChatPDF 工作台。用户通过 Web UI 建库、追加 PDF、流式问答、查看切块调试文件。

## 目录结构

```
web/
├── backend/          # FastAPI + RAG 核心
│   ├── api.py              # HTTP 路由
│   ├── rag_service.py      # 建库/问答/历史（最重要）
│   ├── hybrid_retriever.py # FAISS + BM25 + RRF
│   ├── llm_reranker.py     # 可选 LLM 重排
│   ├── text_splitter.py    # per_page / full_text 切块
│   ├── mineru_pdf.py       # MinerU 云端解析
│   └── chunk_debug.py      # 切块 Markdown 调试输出
├── frontend/         # Next.js 15 App Router
│   ├── app/page.tsx        # 单页主路由（MainView + GuidePanel）
│   ├── components/         # UI 面板
│   └── lib/
│       ├── api.ts          # 后端 API 客户端
│       ├── app-guide-context.tsx  # 文档/Debug 面板全局状态
│       └── docs-nav.ts     # 文档侧栏常量
├── data/             # 运行时数据（git 通常忽略内容）
│   ├── vector_stores/      # FAISS 索引 + manifest + bm25.pkl
│   ├── chunk_debug/        # 建库切块 Markdown（Debug 面板读取）
│   ├── mineru_output/      # MinerU 原始解析结果
│   └── chat_history.json
```

## 启动

在项目根目录（非 `web/`）：

```bash
# 后端 — conda 环境 ai_env
/Users/tala/miniconda3/envs/ai_env/bin/python -m uvicorn web.backend.api:app --host 127.0.0.1 --port 8000 --reload

# 前端
cd web/frontend && npm run dev
```

- 前端：http://localhost:3000
- 后端：http://127.0.0.1:8000
- 健康检查：`GET /api/health`

## 环境变量

| 位置 | 用途 |
|------|------|
| 项目根 `.env` | Web 后端共用（复制自 `.env.example`） |

| 变量 | 用途 |
|------|------|
| `DASHSCOPE_API_KEY` | Embedding + LLM（必填） |
| `MINERU_API_KEY` | PDF 云端解析（必填） |
| `CHUNK_DEBUG_DIR` | 切块调试目录，默认 `web/data/chunk_debug` |
| `MINERU_OUTPUT_DIR` | MinerU 输出，默认 `web/data/mineru_output` |

见项目根 `.env.example`。

## 核心数据流

```
PDF 文件夹
  → MinerU 解析 (mineru_pdf.py)
  → 切块 (text_splitter: per_page | full_text)
  → DashScope Embedding → FAISS 索引
  → 同步 BM25 索引 (bm25.pkl)
  → 可选写入 chunk_debug/*.md

问答
  → hybrid_search_with_score (向量 Top-K + BM25 Top-K → RRF)
  → 可选 llm_rerank_documents
  → load_qa_chain + Tongyi 流式输出
  → 写入 chat_history.json
```

建库路由 `per_page`：按 PDF 页切块；`full_text`：全书切块并带 `start_index`。

## API 速查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/vector-stores` | 向量库列表 |
| POST | `/api/vector-stores/build` | 建库（SSE 流式进度） |
| POST | `/api/vector-stores/{id}/append/stream` | 追加 PDF（SSE 流式进度） |
| POST | `/api/vector-stores/{id}/append` | 追加 PDF（同步） |
| DELETE | `/api/vector-stores/{id}` | 删库 |
| GET | `/api/chat/options` | LLM 模型、Prompt 预设 |
| POST | `/api/chat/stream` | 流式问答 |
| GET | `/api/chat/history` | 问答历史 |
| GET | `/api/chunk-debug/tree` | Debug 文件树 |
| GET | `/api/chunk-debug/file?path=` | 读取 Debug Markdown |

## 前端架构（单页）

**两层导航：**

1. **`MainView`**（`Sidebar.tsx` / `page.tsx`）：`home | stores | build | store | chat | history`
2. **`GuidePanel`**（`app-guide-context.tsx`）：`usage | structure | debug | null`

- 首页 `home` 且无 `GuidePanel` → 仅 `HomeLanding`
- 打开文档/Debug → `showDocsTree=true`，侧栏切换为 `DocsTreeSection`（使用说明 / 项目结构 / Debug 文件树 / API 外链）
- 左下角浮动 `ApiLinksMenu` 也可打开上述文档面板

**关键组件：**

| 组件 | 职责 |
|------|------|
| `BuildIndexPanel` | 新建向量库（SSE 建库进度） |
| `AddDataSourcePanel` | 追加 PDF 数据源（SSE 流式进度） |
| `ChatPanel` | 问答（模型、temperature、prompt preset、LLM rerank） |
| `DocsTreeSection` | 文档侧栏树；Debug 文件高亮 |
| `DebugPanel` | 预览 chunk_debug Markdown |
| `UsageGuidePanel` / `ProjectStructurePanel` | 内嵌文档（`embedded` 模式） |

**选中态规则（文档侧栏）：** 同一时刻仅一项黑底高亮。Debug 文件仅在 `activePanel === "debug"` 时高亮（`selectedPath={activePanel === "debug" ? debugFile : null}`）。

## 后端关键逻辑

| 文件 | 要点 |
|------|------|
| `rag_service.py` | 向量库 CRUD、建库 SSE、`iter_ask_question`、Prompt 预设、历史持久化 |
| `hybrid_retriever.py` | BM25 分词、RRF 融合、表块升级 |
| `llm_reranker.py` | 候选池扩大后 LLM 打分，权重 `DEFAULT_LLM_RERANK_WEIGHT=0.7` |
| `chunk_debug.py` | 建库时按 PDF 写 `{pdf名}.md`，供 Debug 面板浏览 |

默认 LLM：`deepseek-v3`；重排模型：`qwen-turbo`。

## 编码约定（用户偏好）

- **注释用中文**，UTF-8，检查乱码
- **最小改动**：只改当前任务相关代码，不动已正确的功能
- **修改函数时保留原有逻辑**，在其上扩展
- macOS 环境；Python 用 conda `ai_env`
- **不写 fallback**；代码中不用 emoji
- 未要求时不写测试脚本、不额外写说明 md（本 README 除外）
- 未要求时不 git commit

## 近期进展（Agent 完成重要改动后请更新本节）

- **v0.4.0**：追加数据源 SSE 流式进度（`/append/stream`）、`AddDataSourcePanel` 展示 run steps；chunk debug 增强；`text_splitter` 支持超大 HTML 表格切块；删库/清理 orphan 输出
- 文档页「使用说明」「项目结构」与 Debug 共用左侧 `DocsTreeSection` 边栏（`page.tsx` 移除全屏 early return）
- 修复文档侧栏切换类别时 Debug 文件项黑底未消失：仅 `activePanel === "debug"` 时传递 `debugFile` 作为选中路径

## 常见任务入口

| 任务 | 先看 |
|------|------|
| 改问答/检索 | `rag_service.py` → `hybrid_retriever.py` → `llm_reranker.py` |
| 改建库/切块 | `rag_service.py` → `text_splitter.py` → `mineru_pdf.py` |
| 改 API | `api.py` + `rag_service.py` |
| 改前端 UI/导航 | `page.tsx` → `Sidebar.tsx` / `DocsTreeSection.tsx` |
| 改 Debug 输出 | `chunk_debug.py` + `DebugPanel.tsx` |
| 重启服务 | 杀 8000/3000 端口后按上文启动命令重启 |

## 不要浪费时间的地方

- `web/frontend/.next/`、`node_modules/` — 构建产物
- 除非任务涉及，不必全量读 `ProjectStructurePanel.tsx`（含大型 SVG 架构图）
