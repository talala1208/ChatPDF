/** 当前对外展示的版本号（与 APP_VERSION_HISTORY 首项保持一致） */
export const APP_VERSION = "v0.3.0";

export type AppVersionEntry = {
  version: string;
  /** 该版本一句话更新说明 */
  summary: string;
};

/** 版本历史：新 → 旧 */
export const APP_VERSION_HISTORY: AppVersionEntry[] = [
  {
    version: "v0.3.0",
    summary: "删库时同步清理 mineru_output、chunk_debug 与问答历史",
  },
  {
    version: "v0.2.0",
    summary: "Web 工作台：建库 SSE、混合检索、流式问答与 Debug 面板",
  },
  {
    version: "v0.1.0",
    summary: "MinerU 解析 PDF，FAISS 向量库与通义问答初版",
  },
];
