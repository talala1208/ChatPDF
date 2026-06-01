/** 侧栏 ChatPDF 标题下方、首页副标题等统一文案 */
export const APP_TAGLINE = "基于「文档」的智能检索平台";

export const API_LINKS = [
  { name: "MinerU", hint: "PDF 解析", href: "https://mineru.net" },
  {
    name: "DashScope",
    hint: "Embedding / LLM",
    href: "https://dashscope.console.aliyun.com/",
  },
  {
    name: "百炼文档",
    hint: "API 说明",
    href: "https://help.aliyun.com/zh/model-studio/",
  },
] as const;

export type GuidePanel = "usage" | "structure" | "debug";
