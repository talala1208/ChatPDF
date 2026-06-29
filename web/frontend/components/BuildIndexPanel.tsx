"use client";

import { useState } from "react";
import type { BuildRoute, RunStep } from "@/lib/api";
import { buildVectorStoreStream } from "@/lib/api";

interface BuildIndexPanelProps {
  onBuilt: () => void;
}

const ROUTES: {
  id: BuildRoute;
  title: string;
  descLines: string[];
}[] = [
  {
    id: "per_page",
    title: "按页切块 (per_page)",
    descLines: [
      "逐物理页处理，普通文本在单页内按 token 切分且不跨页。",
      "页码与 PDF 一致，适合合同、手册等按页组织的文档。"
    ],
  },
  {
    id: "full_text",
    title: "全书切块 (full_text)",
    descLines: [
      "全书连续切块，页码按字符众数计算。",
      "适合内容按页划分不明确的文档。（例如：报告、书籍等）"
    ],
  },
];

function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  return `${ms.toFixed(0)} ms`;
}

export default function BuildIndexPanel({ onBuilt }: BuildIndexPanelProps) {
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [route, setRoute] = useState<BuildRoute>("full_text");
  const [chunkSize, setChunkSize] = useState(300);
  const [chunkOverlap, setChunkOverlap] = useState(50);
  const [loading, setLoading] = useState(false);
  const [runSteps, setRunSteps] = useState<RunStep[]>([]);
  const [totalDurationMs, setTotalDurationMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const chunkSizeLabel =
    route === "per_page" ? "每个普通文本块的最大 token 数" : "每个普通文本块的最大字符数";
  const chunkOverlapLabel =
    route === "per_page" ? "相邻块重叠 token 数" : "相邻块重叠字符数";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setRunSteps([]);
    setTotalDurationMs(null);

    if (chunkOverlap >= chunkSize) {
      setError("Chunk Overlap 必须小于 Chunk Size");
      return;
    }

    setLoading(true);
    try {
      const store = await buildVectorStoreStream(
        {
          name: name.trim(),
          pdf_folder_path: folderPath.trim(),
          route,
          chunk_size: chunkSize,
          chunk_overlap: chunkOverlap,
        },
        (event) => {
          if (event.type === "step") {
            setRunSteps((prev) => [
              ...prev,
              {
                label: event.label,
                detail: event.detail,
                duration_ms: event.duration_ms,
              },
            ]);
          }
          if (event.type === "done") {
            setTotalDurationMs(event.total_duration_ms);
          }
        }
      );
      setSuccess(
        `建库成功：${store.name}（${store.chunk_count} 个文本块，${store.pdf_files.length} 个 PDF）`
      );
      setName("");
      setFolderPath("");
      onBuilt();
    } catch (err) {
      setError(err instanceof Error ? err.message : "建库失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h2 className="text-2xl font-semibold tracking-tight text-[#111111]">
        新建向量库
      </h2>
      <p className="mt-2 text-sm text-[#787774]">
        选择本机待建库的文件夹路径，将递归扫描其中所有 .pdf 文件并建库。
      </p>
      <p className="mt-2 text-sm text-[#787774]">
        支持后续增量添加文件到本地建库文件夹内，自动忽略已入库的 PDF。
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium">向量库名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：客户经理考核办法"
            required
            disabled={loading}
            className="w-full rounded-md border border-[#eaeaea] bg-white px-4 py-3 text-sm outline-none focus:border-[#111111] disabled:opacity-50"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium">
            PDF 文件夹路径（本机）
          </label>
          <input
            type="text"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
            placeholder="/Users/you/Documents/pdfs"
            required
            disabled={loading}
            className="w-full rounded-md border border-[#eaeaea] bg-white px-4 py-3 font-mono text-sm outline-none focus:border-[#111111] disabled:opacity-50"
          />
          <p className="mt-2 text-xs text-[#787774]">
            支持文件夹内多个 PDF，含子目录。
          </p>
        </div>

        <div>
          <span className="mb-3 block text-sm font-medium">切块参数</span>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-3">
                <label
                  htmlFor="chunk-size"
                  className="shrink-0 text-sm text-[#787774]"
                >
                  Chunk Size
                </label>
                <input
                  id="chunk-size"
                  type="number"
                  min={100}
                  max={8000}
                  step={100}
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                  required
                  disabled={loading}
                  className="w-full rounded-md border border-[#eaeaea] bg-white px-3 py-2 text-sm outline-none focus:border-[#111111] disabled:opacity-50"
                />
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#787774]">
                {chunkSizeLabel}，默认 300。
                <br />
                表格优先整表保留，超出 Embedding 长度时按行切分。
              </p>            </div>
            <div>
              <div className="flex items-center gap-3">
                <label
                  htmlFor="chunk-overlap"
                  className="shrink-0 text-sm text-[#787774]"
                >
                  Chunk Overlap
                </label>
                <input
                  id="chunk-overlap"
                  type="number"
                  min={0}
                  max={2000}
                  step={50}
                  value={chunkOverlap}
                  onChange={(e) => setChunkOverlap(Number(e.target.value))}
                  required
                  disabled={loading}
                  className="w-full rounded-md border border-[#eaeaea] bg-white px-3 py-2 text-sm outline-none focus:border-[#111111] disabled:opacity-50"
                />
              </div>
              <p className="mt-2 text-xs text-[#787774]">
                {chunkOverlapLabel}，须小于 Chunk Size，默认 50。
              </p>
            </div>
          </div>
        </div>

        <div>
          <span className="mb-3 block text-sm font-medium">建库路由</span>
          <div className="grid gap-3 sm:grid-cols-2">
            {ROUTES.map((r) => (
              <label
                key={r.id}
                className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                  route === r.id
                    ? "border-[#111111] bg-white"
                    : "border-[#eaeaea] bg-transparent hover:border-[#ccc]"
                } ${loading ? "pointer-events-none opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="route"
                  value={r.id}
                  checked={route === r.id}
                  onChange={() => setRoute(r.id)}
                  disabled={loading}
                  className="sr-only"
                />
                <span className="block text-sm font-medium text-[#111111]">
                  {r.title}
                </span>
                <span className="mt-2 block text-xs leading-relaxed text-[#787774]">
                  {r.descLines[0]}
                  <br />
                  {r.descLines[1]}
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-md bg-[#fdebec] px-4 py-3 text-sm text-[#9f2f2d]">
            {error}
          </p>
        )}
        {success && (
          <p className="rounded-md bg-[#edf3ec] px-4 py-3 text-sm text-[#346538]">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-[#111111] px-6 py-3 text-sm font-medium text-white transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? "建库中..." : "开始建库"}
        </button>
      </form>

      {(loading || runSteps.length > 0) && (
        <section className="mt-6">
          <h3 className="text-xs font-medium uppercase tracking-widest text-[#787774]">
            运行记录
          </h3>
          <ul className="mt-3 space-y-2">
            {runSteps.map((step, index) => (
              <li
                key={`${step.label}-${index}`}
                className="flex items-start justify-between gap-4 text-xs text-[#2f3437]"
              >
                <span>
                  {index + 1}. {step.label}
                  {step.detail ? (
                    <span className="text-[#787774]">（{step.detail}）</span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums text-[#787774]">
                  {formatDuration(step.duration_ms)}
                </span>
              </li>
            ))}
            {loading && (
              <li className="text-xs text-[#787774]">执行中...</li>
            )}
          </ul>
          {totalDurationMs !== null && !loading && (
            <p className="mt-3 text-xs font-medium text-[#111111]">
              总运行时间：{formatDuration(totalDurationMs)}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
