"use client";

import { useState } from "react";
import type { RunStep, VectorStore } from "@/lib/api";
import { appendVectorStoreStream } from "@/lib/api";

interface AddDataSourcePanelProps {
  store: VectorStore;
  onAppended: () => void;
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)} s`;
  }
  return `${ms.toFixed(0)} ms`;
}

export default function AddDataSourcePanel({
  store,
  onAppended,
  onClose,
}: AddDataSourcePanelProps) {
  const [folderPath, setFolderPath] = useState(store.pdf_folder_path);
  const [loading, setLoading] = useState(false);
  const [runSteps, setRunSteps] = useState<RunStep[]>([]);
  const [totalDurationMs, setTotalDurationMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const chunkSize = store.chunk_size ?? 300;
  const chunkOverlap = store.chunk_overlap ?? 50;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setRunSteps([]);
    setTotalDurationMs(null);
    setLoading(true);
    try {
      const updated = await appendVectorStoreStream(
        store.id,
        { pdf_folder_path: folderPath.trim() },
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
      const addedPdfCount =
        updated.pdf_files.length - store.pdf_files.length;
      const addedChunkCount = updated.chunk_count - store.chunk_count;
      setSuccess(
        `增量入库成功：新增 ${addedPdfCount} 个 PDF、${addedChunkCount} 个文本块`
      );
      onAppended();
    } catch (err) {
      setError(err instanceof Error ? err.message : "增量入库失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="rounded-lg border border-[#eaeaea] bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium text-[#111111]">添加数据源</h3>
            <p className="mt-2 text-sm text-[#787774]">
              扫描文件夹中尚未入库的 PDF，按当前库的切块策略增量写入 FAISS。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="shrink-0 text-sm text-[#787774] hover:text-[#111111] disabled:opacity-50"
          >
            关闭
          </button>
        </div>

        <dl className="mt-4 grid gap-2 text-xs text-[#787774] sm:grid-cols-2">
          <div>
            <dt className="uppercase tracking-widest">建库路由</dt>
            <dd className="mt-1 text-[#2f3437]">
              {store.route === "per_page" ? "按页切块" : "全书切块"}
            </dd>
          </div>
          <div>
            <dt className="uppercase tracking-widest">切块参数</dt>
            <dd className="mt-1 text-[#2f3437]">
              size {chunkSize} / overlap {chunkOverlap}
            </dd>
          </div>
        </dl>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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
              递归扫描 .pdf，仅处理未出现在当前库文件列表中的文件；可与原建库路径相同以拾取新增文档。
            </p>
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
            className="rounded-md border border-[#111111] bg-white px-6 py-3 text-sm font-medium text-[#111111] disabled:opacity-50"
          >
            {loading ? "入库中..." : "开始增量入库"}
          </button>
        </form>
      </div>

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
                <span className="min-w-0 break-all">
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
