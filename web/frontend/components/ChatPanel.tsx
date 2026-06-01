"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ChatRecord,
  PromptPreset,
  RunStep,
  TokenUsage,
  VectorStore,
} from "@/lib/api";
import { askQuestionStream, fetchChatOptions, formatTokenUsage } from "@/lib/api";
import CopyButton from "@/components/CopyButton";
import SourceList from "@/components/SourceList";

interface ChatPanelProps {
  store: VectorStore;
  onAsked: () => void;
}

const FALLBACK_MODELS = ["deepseek-v3", "qwen-turbo", "qwen-plus", "qwen-max"];
const FALLBACK_PRESETS: { id: PromptPreset; label: string }[] = [
  { id: "default", label: "默认" },
  { id: "strict", label: "严格依据文档" },
  { id: "concise", label: "简洁回答" },
  { id: "detailed", label: "分步详述" },
];

type OpenPanel = "topK" | "temperature" | "modelMenu" | "rerankModelMenu" | null;

function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  return `${ms.toFixed(0)} ms`;
}

export default function ChatPanel({ store, onAsked }: ChatPanelProps) {
  const [question, setQuestion] = useState("");
  const [topK, setTopK] = useState(4);
  const [model, setModel] = useState("deepseek-v3");
  const [temperature, setTemperature] = useState(0.1);
  const [llmRerank, setLlmRerank] = useState(false);
  const [rerankModel, setRerankModel] = useState("qwen-turbo");
  const [promptPreset, setPromptPreset] = useState<PromptPreset>("default");
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS);
  const [presets, setPresets] =
    useState<{ id: PromptPreset; label: string }[]>(FALLBACK_PRESETS);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [loading, setLoading] = useState(false);
  const [runSteps, setRunSteps] = useState<RunStep[]>([]);
  const [totalDurationMs, setTotalDurationMs] = useState<number | null>(null);
  const [totalTokenUsage, setTotalTokenUsage] = useState<TokenUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ChatRecord | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChatOptions()
      .then((options) => {
        setModels(options.llm_models);
        setPresets(options.prompt_presets);
        setModel(options.default_llm_model);
        if (options.default_rerank_model) {
          setRerankModel(options.default_rerank_model);
        }
        if (options.default_temperature != null) {
          setTemperature(options.default_temperature);
        }
      })
      .catch(() => {
        // 后端未升级时使用本地默认值
      });
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      ) {
        setOpenPanel(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function togglePanel(panel: OpenPanel) {
    setOpenPanel((current) => (current === panel ? null : panel));
  }

  function selectModel(nextModel: string) {
    setModel(nextModel);
    setOpenPanel(null);
  }

  function selectRerankModel(nextModel: string) {
    setRerankModel(nextModel);
    setOpenPanel(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setRunSteps([]);
    setTotalDurationMs(null);
    setTotalTokenUsage(null);
    setResult(null);
    setLoading(true);
    try {
      const record = await askQuestionStream(
        {
          vector_store_id: store.id,
          question: question.trim(),
          k: topK,
          model,
          temperature,
          prompt_preset: promptPreset,
          llm_rerank: llmRerank,
          rerank_model: rerankModel,
        },
        (event) => {
          if (event.type === "step") {
            setRunSteps((prev) => [
              ...prev,
              {
                label: event.label,
                detail: event.detail,
                duration_ms: event.duration_ms,
                token_usage: event.token_usage,
              },
            ]);
          }
          if (event.type === "done") {
            setTotalDurationMs(event.total_duration_ms);
            setTotalTokenUsage(
              event.token_usage ?? event.record.token_usage ?? null
            );
          }
        }
      );
      setResult(record);
      onAsked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "问答失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-[#111111]">
          问答：{store.name}
        </h2>
        <p className="mt-2 text-sm text-[#787774]">
          路由 {store.route === "per_page" ? "按页切块" : "全书切块"} ·{" "}
          {store.chunk_count} 块 · {store.pdf_files.length} 个 PDF
          {result?.token_usage ? (
            <>
              {" "}
              · Token {formatTokenUsage(result.token_usage)}
            </>
          ) : null}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div ref={settingsRef}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[#eaeaea] pb-3 text-sm text-[#3c4043]">
            <button
              type="button"
              disabled={loading}
              onClick={() => togglePanel("topK")}
              className={`transition-colors hover:text-[#111111] disabled:opacity-50 ${
                openPanel === "topK" ? "font-medium text-[#111111]" : ""
              }`}
            >
              Top-K：{topK}
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => togglePanel("temperature")}
              className={`transition-colors hover:text-[#111111] disabled:opacity-50 ${
                openPanel === "temperature" ? "font-medium text-[#111111]" : ""
              }`}
            >
              Temperature：{temperature.toFixed(1)}
            </button>

            <div className="relative">
              <button
                type="button"
                disabled={loading}
                onClick={() => togglePanel("modelMenu")}
                className={`inline-flex items-center gap-1 transition-colors hover:text-[#111111] disabled:opacity-50 ${
                  openPanel === "modelMenu" ? "font-medium text-[#111111]" : ""
                }`}
              >
                Model：{model}
                <span className="text-[10px] leading-none text-[#787774]">
                  ▼
                </span>
              </button>

              {openPanel === "modelMenu" && (
                <div className="absolute left-0 top-full z-20 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-[#eaeaea] bg-white py-2 shadow-lg">
                  {models.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => selectModel(item)}
                      className={`block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#f8f9fa] ${
                        model === item
                          ? "font-medium text-[#111111]"
                          : "text-[#3c4043]"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="inline-flex cursor-pointer items-center gap-2">
              <span>LLM Rerank</span>
              <button
                type="button"
                role="switch"
                aria-checked={llmRerank}
                aria-label="LLM Rerank"
                disabled={loading}
                onClick={() => {
                  setLlmRerank((value) => !value);
                  setOpenPanel((panel) =>
                    panel === "rerankModelMenu" ? null : panel
                  );
                }}
                className={`inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-50 ${
                  llmRerank ? "bg-[#111111]" : "bg-[#dadce0]"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    llmRerank ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            {llmRerank && (
              <div className="relative">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => togglePanel("rerankModelMenu")}
                  className={`inline-flex items-center gap-1 transition-colors hover:text-[#111111] disabled:opacity-50 ${
                    openPanel === "rerankModelMenu"
                      ? "font-medium text-[#111111]"
                      : ""
                  }`}
                >
                  Rerank Model：{rerankModel}
                  <span className="text-[10px] leading-none text-[#787774]">
                    ▼
                  </span>
                </button>

                {openPanel === "rerankModelMenu" && (
                  <div className="absolute left-0 top-full z-20 mt-2 min-w-[180px] overflow-hidden rounded-xl border border-[#eaeaea] bg-white py-2 shadow-lg">
                    {models.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => selectRerankModel(item)}
                        className={`block w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-[#f8f9fa] ${
                          rerankModel === item
                            ? "font-medium text-[#111111]"
                            : "text-[#3c4043]"
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {openPanel === "topK" && (
            <div className="border-b border-[#eaeaea] px-1 py-4">
              <input
                id="top-k"
                type="range"
                min={3}
                max={20}
                step={1}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                disabled={loading}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#eaeaea] accent-[#111111] disabled:opacity-50"
              />
              <div className="mt-2 flex justify-between text-xs text-[#787774]">
                <span>3</span>
                <span>20</span>
              </div>
            </div>
          )}

          {openPanel === "temperature" && (
            <div className="border-b border-[#eaeaea] px-1 py-4">
              <input
                id="temperature"
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                disabled={loading}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#eaeaea] accent-[#111111] disabled:opacity-50"
              />
              <div className="mt-2 flex justify-between text-xs text-[#787774]">
                <span>0</span>
                <span>1</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-[#eaeaea] bg-white px-4 py-3 focus-within:border-[#111111]">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="输入你的问题..."
              required
              className="min-w-0 flex-1 border-0 bg-transparent text-sm leading-normal outline-none"
            />
            {question && (
              <button
                type="button"
                onClick={() => setQuestion("")}
                aria-label="清空输入"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[#787774] transition-colors hover:bg-[#f0efec] hover:text-[#111111]"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="shrink-0 rounded-md bg-[#111111] px-5 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "思考中..." : "提问"}
          </button>
        </div>

        <div
          className="flex flex-wrap items-center justify-center gap-3"
          role="radiogroup"
          aria-label="Prompt 预设"
        >
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="radio"
              aria-checked={promptPreset === preset.id}
              disabled={loading}
              onClick={() => setPromptPreset(preset.id)}
              className={`rounded border px-4 py-2 text-sm text-[#3c4043] transition-shadow disabled:opacity-50 ${
                promptPreset === preset.id
                  ? "border-[#dadce0] bg-[#e8eaed] shadow-sm"
                  : "border-transparent bg-[#f8f9fa] hover:border-[#dadce0] hover:shadow-sm"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <p className="mt-4 rounded-md bg-[#fdebec] px-4 py-3 text-sm text-[#9f2f2d]">
          {error}
        </p>
      )}

      {(loading || runSteps.length > 0) && (
        <section className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-widest text-[#787774]">
            运行记录
          </h3>
          <ul className="mt-3 space-y-2">
            {runSteps.map((step, index) => (
              <li
                key={`${step.label}-${index}`}
                className="flex items-start justify-between gap-4 text-sm text-[#2f3437]"
              >
                <span>
                  {index + 1}. {step.label}
                  {step.detail ? (
                    <span className="text-[#787774]">（{step.detail}）</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right tabular-nums text-[#787774]">
                  {step.token_usage ? (
                    <span className="block text-xs">
                      {formatTokenUsage(step.token_usage)}
                    </span>
                  ) : null}
                  <span className="block">{formatDuration(step.duration_ms)}</span>
                </span>
              </li>
            ))}
            {loading && (
              <li className="text-sm text-[#787774]">执行中...</li>
            )}
          </ul>
          {totalDurationMs !== null && !loading && (
            <div className="mt-3 space-y-1 text-sm font-medium text-[#111111]">
              <p>总运行时间：{formatDuration(totalDurationMs)}</p>
              {totalTokenUsage ? (
                <p className="font-normal text-[#787774]">
                  Token 合计：{formatTokenUsage(totalTokenUsage)}
                </p>
              ) : null}
            </div>
          )}
        </section>
      )}

      {result && (
        <div className="mt-8 space-y-6">
          <section className="rounded-lg border border-[#eaeaea] bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium uppercase tracking-widest text-[#787774]">
                问题
              </h3>
              <CopyButton text={result.question} />
            </div>
            <p className="mt-2 text-base leading-relaxed">{result.question}</p>
          </section>
          <section className="rounded-lg border border-[#eaeaea] bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-medium uppercase tracking-widest text-[#787774]">
                回答
              </h3>
              <CopyButton text={result.answer} />
            </div>
            <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">
              {result.answer}
            </p>
          </section>
          {result.sources.length > 0 && (
            <section className="rounded-lg border border-[#eaeaea] bg-[#f7f6f3] p-6">
              <h3 className="text-xs font-medium uppercase tracking-widest text-[#787774]">
                来源
              </h3>
              <SourceList sources={result.sources} />
            </section>
          )}
        </div>
      )}
    </div>
  );
}
