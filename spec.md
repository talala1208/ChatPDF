# ChatPDF 功能规格

## 问答检索流程

```
用户提问
  →（可选）Query 改写：结合向量库元信息与近期对话，生成检索查询
  → 混合检索（FAISS + BM25，RRF 融合）
  →（可选）低置信度二次检索：用改写查询/子查询再次检索并合并
  →（可选）LLM 重排
  → LLM 生成回答
```

## Query 改写

- **目的**：将口语化、指代模糊、多轮依赖的问题改写为适合 PDF 混合检索的独立查询。
- **输入**：原始问题、向量库名称与 PDF 列表、同一向量库最近 3 轮问答历史。
- **输出**（JSON）：`needs_rewrite`、`query_type`、`retrieval_query`、`sub_queries`（最多 3 条）、`confidence`、`reason`。
- **类型**：`standalone` | `context_dependent` | `ambiguous` | `comparative` | `multi_intent` | `rhetorical`。
- **默认**：开启；模型默认由环境变量 `LLM_REWRITE_MODEL` 控制（默认 `qwen-turbo`）；Prompt 见 `prompt/query_rewrite.yml`。
- **与参考案例差异**：面向已入库 PDF 检索，不做联网搜索判断；单次 LLM 调用完成分析与改写。

## 低置信度二次检索

- **触发条件**：开启 Query 改写与二次检索，且首次混合检索置信度 < `0.42`，且存在与原问题不同的改写查询或子查询。
- **置信度计算**：`0.6 × Top-1 分数 + 0.4 × Top-3 平均分`（分数为 RRF 归一化后的 similarity）。
- **行为**：对每个备选查询（子问题或原问题回退）执行混合检索，与原结果按文档去重合并，保留较高分数，再进入后续重排与生成。首轮已使用的 `retrieval_query` 不会重复检索。
- **默认**：开启（依赖 Query 改写）。

## API

`POST /api/chat/stream` 新增字段：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `query_rewrite` | bool | true | 是否 Query 改写 |
| `rewrite_model` | string | qwen-turbo | 改写模型 |
| `secondary_retrieval` | bool | true | 低置信度二次检索 |

问答历史记录可包含 `query_rewrite_meta` 字段，保存改写与二次检索详情。
