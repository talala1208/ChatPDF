const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

export type BuildRoute = "per_page" | "full_text";
export type PromptPreset = "default" | "strict" | "concise" | "detailed";

export const PROMPT_PRESET_LABELS: Record<PromptPreset, string> = {
  default: "默认",
  strict: "严格依据文档",
  concise: "简洁回答",
  detailed: "分步详述",
};

export interface ChatOptions {
  llm_models: string[];
  default_llm_model: string;
  default_rerank_model?: string;
  default_temperature?: number;
  prompt_presets: { id: PromptPreset; label: string }[];
}

export interface VectorStore {
  id: string;
  name: string;
  route: BuildRoute;
  pdf_folder_path: string;
  pdf_files: string[];
  chunk_count: number;
  chunk_size?: number;
  chunk_overlap?: number;
  created_at: string;
  updated_at?: string;
  path: string;
}

export interface ChatSource {
  page: number | string;
  build_route: string;
  source: string;
  content?: string;
  /** 与问题的向量相似度，0~1，越大越相关（由 FAISS L2 距离映射） */
  similarity?: number;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

export interface TokenBreakdownStep extends TokenUsage {
  label: string;
  model?: string;
}

export interface ChatRecord {
  id: string;
  vector_store_id: string;
  vector_store_name: string;
  question: string;
  answer: string;
  sources: ChatSource[];
  k: number;
  model?: string;
  temperature?: number;
  prompt_preset?: PromptPreset;
  llm_rerank?: boolean;
  rerank_model?: string | null;
  token_usage?: TokenUsage;
  token_breakdown?: TokenBreakdownStep[];
  created_at: string;
}

export interface RunStep {
  label: string;
  detail?: string;
  duration_ms: number;
  token_usage?: TokenUsage;
}

export function formatTokenUsage(usage: TokenUsage): string {
  return `输入 ${usage.input_tokens} · 输出 ${usage.output_tokens} · 合计 ${usage.total_tokens}`;
}

export function getPromptPresetLabel(preset?: PromptPreset): string {
  if (!preset) {
    return PROMPT_PRESET_LABELS.default;
  }
  return PROMPT_PRESET_LABELS[preset] ?? preset;
}

export interface ChatSettingItem {
  label: string;
  value: string;
}

/** 历史问答中展示本次提问所选参数 */
export function getChatSettingItems(record: ChatRecord): ChatSettingItem[] {
  const items: ChatSettingItem[] = [{ label: "Top-K", value: String(record.k) }];

  if (record.model) {
    items.push({ label: "模型", value: record.model });
  }
  if (record.temperature != null) {
    items.push({ label: "Temperature", value: String(record.temperature) });
  }
  items.push({
    label: "Prompt 风格",
    value: getPromptPresetLabel(record.prompt_preset),
  });
  items.push({
    label: "LLM 重排",
    value: record.llm_rerank ? "开启" : "关闭",
  });
  if (record.llm_rerank && record.rerank_model) {
    items.push({ label: "Rerank 模型", value: record.rerank_model });
  }

  return items;
}

export type BuildStreamEvent =
  | { type: "step"; label: string; detail?: string; duration_ms: number }
  | { type: "done"; store: VectorStore; total_duration_ms: number }
  | { type: "error"; detail: string };

export type ChatStreamEvent =
  | {
      type: "step";
      label: string;
      detail?: string;
      duration_ms: number;
      token_usage?: TokenUsage;
    }
  | {
      type: "done";
      record: ChatRecord;
      total_duration_ms: number;
      token_usage?: TokenUsage;
    }
  | { type: "error"; detail: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail ?? data);
    throw new Error(detail || `请求失败 (${res.status})`);
  }

  return data as T;
}

export async function fetchVectorStores(): Promise<VectorStore[]> {
  const data = await request<{ stores: VectorStore[] }>("/api/vector-stores");
  return data.stores;
}

export async function buildVectorStore(payload: {
  name: string;
  pdf_folder_path: string;
  route: BuildRoute;
  chunk_size?: number;
  chunk_overlap?: number;
}): Promise<VectorStore> {
  const data = await request<{ ok: boolean; store: VectorStore }>(
    "/api/vector-stores/build",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  return data.store;
}

export async function buildVectorStoreStream(
  payload: {
    name: string;
    pdf_folder_path: string;
    route: BuildRoute;
    chunk_size?: number;
    chunk_overlap?: number;
  },
  onEvent: (event: BuildStreamEvent) => void
): Promise<VectorStore> {
  const res = await fetch(`${API_BASE}/api/vector-stores/build/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail ?? data);
    throw new Error(detail || `请求失败 (${res.status})`);
  }

  if (!res.body) {
    throw new Error("流式响应不可用");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let store: VectorStore | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) {
        continue;
      }
      const event = JSON.parse(line.slice(6)) as BuildStreamEvent;
      onEvent(event);
      if (event.type === "done") {
        store = event.store;
      }
      if (event.type === "error") {
        throw new Error(event.detail);
      }
    }
  }

  if (!store) {
    throw new Error("建库未完成");
  }
  return store;
}

export async function appendVectorStore(
  storeId: string,
  payload: { pdf_folder_path: string }
): Promise<VectorStore> {
  const data = await request<{ ok: boolean; store: VectorStore }>(
    `/api/vector-stores/${encodeURIComponent(storeId)}/append`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
  return data.store;
}

export async function appendVectorStoreStream(
  storeId: string,
  payload: { pdf_folder_path: string },
  onEvent: (event: BuildStreamEvent) => void
): Promise<VectorStore> {
  const res = await fetch(
    `${API_BASE}/api/vector-stores/${encodeURIComponent(storeId)}/append/stream`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail ?? data);
    throw new Error(detail || `请求失败 (${res.status})`);
  }

  if (!res.body) {
    throw new Error("流式响应不可用");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let store: VectorStore | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) {
        continue;
      }
      const event = JSON.parse(line.slice(6)) as BuildStreamEvent;
      onEvent(event);
      if (event.type === "done") {
        store = event.store;
      }
      if (event.type === "error") {
        throw new Error(event.detail);
      }
    }
  }

  if (!store) {
    throw new Error("增量入库未完成");
  }
  return store;
}

export async function deleteVectorStore(storeId: string): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/vector-stores/${encodeURIComponent(storeId)}`,
    { method: "DELETE" }
  );
}

export async function removePdfFromVectorStore(
  storeId: string,
  pdfPath: string
): Promise<VectorStore> {
  const data = await request<{ ok: boolean; store: VectorStore }>(
    `/api/vector-stores/${encodeURIComponent(storeId)}/pdfs`,
    {
      method: "DELETE",
      body: JSON.stringify({ pdf_path: pdfPath }),
    }
  );
  return data.store;
}

export async function fetchChatOptions(): Promise<ChatOptions> {
  return request<ChatOptions>("/api/chat/options");
}

export async function fetchChatHistory(): Promise<ChatRecord[]> {
  const data = await request<{ history: ChatRecord[] }>("/api/chat/history");
  return data.history;
}

export async function deleteChatHistory(recordId: string): Promise<void> {
  await request<{ ok: boolean }>(
    `/api/chat/history/${encodeURIComponent(recordId)}`,
    { method: "DELETE" }
  );
}

export async function askQuestion(payload: {
  vector_store_id: string;
  question: string;
  k?: number;
  model?: string;
  temperature?: number;
  prompt_preset?: PromptPreset;
  llm_rerank?: boolean;
  rerank_model?: string;
}): Promise<ChatRecord> {
  const data = await request<{ ok: boolean; record: ChatRecord }>("/api/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.record;
}

export async function askQuestionStream(
  payload: {
    vector_store_id: string;
    question: string;
    k?: number;
    model?: string;
    temperature?: number;
    prompt_preset?: PromptPreset;
    llm_rerank?: boolean;
    rerank_model?: string;
  },
  onEvent: (event: ChatStreamEvent) => void
): Promise<ChatRecord> {
  const res = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : JSON.stringify(data.detail ?? data);
    throw new Error(detail || `请求失败 (${res.status})`);
  }

  if (!res.body) {
    throw new Error("流式响应不可用");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let record: ChatRecord | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) {
        continue;
      }
      const event = JSON.parse(line.slice(6)) as ChatStreamEvent;
      onEvent(event);
      if (event.type === "done") {
        record = event.record;
      }
      if (event.type === "error") {
        throw new Error(event.detail);
      }
    }
  }

  if (!record) {
    throw new Error("问答未完成");
  }
  return record;
}

export interface ChunkDebugNode {
  name: string;
  path: string;
  type: "dir" | "file";
  size?: number;
  children?: ChunkDebugNode[];
}

export interface ChunkDebugTreeResponse {
  root: string;
  tree: ChunkDebugNode[];
}

export interface ChunkDebugFileResponse {
  path: string;
  content: string;
  size: number;
}

export async function fetchChunkDebugTree(): Promise<ChunkDebugTreeResponse> {
  return request<ChunkDebugTreeResponse>("/api/chunk-debug/tree");
}

export async function fetchChunkDebugFile(
  path: string
): Promise<ChunkDebugFileResponse> {
  const query = new URLSearchParams({ path });
  return request<ChunkDebugFileResponse>(`/api/chunk-debug/file?${query}`);
}

export async function checkHealth(): Promise<boolean> {
  try {
    await request<{ status: string }>("/api/health");
    return true;
  } catch {
    return false;
  }
}
