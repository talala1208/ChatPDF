"use client";

import CopyButton from "@/components/CopyButton";

const BACKEND_START_BASH =
  "python -m uvicorn web.backend.api:app --host 127.0.0.1 --port 8000 --reload";

const FRONTEND_START_BASH = "cd web/frontend && npm run dev";

function BashCodeBlock({ code }: { code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#eaeaea] bg-white">
      <div className="flex items-center justify-between border-b border-[#eaeaea] bg-[#f8f9fa] px-3 py-1.5">
        <span className="font-mono text-xs text-[#787774]">bash</span>
        <CopyButton text={code} />
      </div>
      <pre className="m-0 overflow-x-auto p-4">
        <code className="block whitespace-pre font-mono text-xs leading-relaxed text-[#111111]">
          {code}
        </code>
      </pre>
    </div>
  );
}

interface UsageGuidePanelProps {
  embedded?: boolean;
  onClose?: () => void;
}

export default function UsageGuidePanel({
  embedded = false,
  onClose,
}: UsageGuidePanelProps) {
  return (
    <div className={embedded ? "" : "relative min-h-screen bg-[#f7f6f3] px-6 py-16"}>
      {!embedded && onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 rounded-md border border-[#eaeaea] bg-white px-4 py-2 text-sm text-[#3c4043] transition-colors hover:border-[#111111]"
        >
          返回首页
        </button>
      )}

      <article className="mx-auto w-full max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[#111111]">
          使用说明
        </h1>
        <p className="mt-3 text-sm italic leading-relaxed text-[#787774]">
          本版本暂不支持多模态和 PDF 以外的格式，请期待后续更新。
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[#787774]">
          ChatPDF 基于 MinerU 解析 PDF，FAISS 向量库 + BM25 混合检索，支持可选
          LLM 重排与多预设问答风格。
        </p>

        <section className="mt-10 space-y-8 text-sm leading-relaxed text-[#2f3437]">
          <div>
            <h2 className="text-base font-medium text-[#111111]">1. 环境配置</h2>
            <p className="mt-2 text-[#787774]">
              在项目根目录复制 <code className="text-[#111111]">.env.example</code> 为{" "}
              <code className="text-[#111111]">.env</code>，至少配置：
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[#3c4043]">
              <li>
                <code>DASHSCOPE_API_KEY</code>：Embedding 与 LLM（通义 / DeepSeek）
              </li>
              <li>
                <code>MINERU_API_KEY</code>：MinerU 云端 PDF 解析
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-medium text-[#111111]">2. 启动服务</h2>
            <p className="mt-2 text-[#787774]">
              后端与前端启动后，访问前端地址打开网页：
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[#3c4043]">
              <li>后端：http://127.0.0.1:8000</li>
              <li>前端：http://localhost:3000</li>
            </ul>
            <p className="mt-2 text-[#787774]">
              后端与前端需各开一个终端，分别执行以下命令。
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-[#3c4043]">
                  后端（项目根目录 ChatPDF）
                </p>
                <BashCodeBlock code={BACKEND_START_BASH} />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-[#3c4043]">前端</p>
                <BashCodeBlock code={FRONTEND_START_BASH} />
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-base font-medium text-[#111111]">3. 建库</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[#3c4043]">
              <li>
                <strong>按页切块 (per_page)</strong>：逐物理页处理，普通文本在单页内按{" "}
                <code>cl100k_base</code> token 切分，chunk 不跨页且页码与 PDF 一致。
              </li>
              <li>
                <strong>全书切块 (full_text)</strong>：全书连续切块，语义更连贯；跨页
                chunk 页码按字符映射众数计算。
              </li>
              <li>
                建库时会同步生成 BM25 索引；MinerU 解析结果与 chunks 调试 Markdown
                会写入 data 目录。
              </li>
            </ul>
          </div>

          <div>
            <h2 className="text-base font-medium text-[#111111]">4. 问答</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-[#3c4043]">
              <li>
                检索默认使用 <strong>向量 + BM25</strong> 混合（RRF 融合）。
              </li>
              <li>
                可开启 <strong>LLM Rerank</strong>，用独立模型对候选 chunk 重排后再生成回答。
              </li>
              <li>
                下方预设按钮切换 Prompt 风格（默认 / 严格 / 简洁 / 分步详述）；模板由项目根目录{" "}
                <code>prompt/qa.yml</code> 管理。
              </li>
              <li>修改切块或检索逻辑后需重新建库才能生效。</li>
            </ul>
          </div>
        </section>
      </article>
    </div>
  );
}
