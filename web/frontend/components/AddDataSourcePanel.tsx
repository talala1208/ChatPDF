"use client";

import { useState } from "react";
import type { VectorStore } from "@/lib/api";
import { appendVectorStore } from "@/lib/api";

interface AddDataSourcePanelProps {
  store: VectorStore;
  onAppended: () => void;
  onClose: () => void;
}

export default function AddDataSourcePanel({
  store,
  onAppended,
  onClose,
}: AddDataSourcePanelProps) {
  const [folderPath, setFolderPath] = useState(store.pdf_folder_path);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const chunkSize = store.chunk_size ?? 300;
  const chunkOverlap = store.chunk_overlap ?? 50;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      const updated = await appendVectorStore(store.id, {
        pdf_folder_path: folderPath.trim(),
      });
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
    <div className="mt-6 rounded-lg border border-[#eaeaea] bg-white p-6">
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
          className="shrink-0 text-sm text-[#787774] hover:text-[#111111]"
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
            className="w-full rounded-md border border-[#eaeaea] bg-white px-4 py-3 font-mono text-sm outline-none focus:border-[#111111]"
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
          {loading ? "入库中，请稍候..." : "开始增量入库"}
        </button>
      </form>
    </div>
  );
}
