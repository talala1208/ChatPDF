"use client";

import { useState } from "react";
import type { VectorStore } from "@/lib/api";
import { removePdfFromVectorStore } from "@/lib/api";
import AddDataSourcePanel from "@/components/AddDataSourcePanel";
import { useAppGuide } from "@/lib/app-guide-context";
import { getStoreDebugFilePath } from "@/lib/chunk-debug-tree";

interface StoreDetailPanelProps {
  store: VectorStore;
  onBack: () => void;
  onStartChat: () => void;
  onAppended: () => void;
}

export default function StoreDetailPanel({
  store,
  onBack,
  onStartChat,
  onAppended,
}: StoreDetailPanelProps) {
  const { selectDebugFile } = useAppGuide();
  const [showAddSource, setShowAddSource] = useState(false);
  const [deletingPdfPath, setDeletingPdfPath] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const debugFilePath = getStoreDebugFilePath(store.id, store.pdf_files);
  const canRemovePdf = store.pdf_files.length > 1;

  async function handleRemovePdf(pdfPath: string) {
    const fileName = pdfPath.split("/").pop() ?? pdfPath;
    if (
      !window.confirm(
        `确定从向量库中删除「${fileName}」吗？\n将同步删除 FAISS 文本块、chunk_debug 与 MinerU 输出。`
      )
    ) {
      return;
    }

    setDeleteError(null);
    setDeletingPdfPath(pdfPath);
    try {
      await removePdfFromVectorStore(store.id, pdfPath);
      onAppended();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingPdfPath(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[800px]">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[#787774] transition-colors hover:text-[#111111]"
      >
        <span aria-hidden>←</span>
        返回已有向量库
      </button>
      <h2 className="text-2xl font-semibold tracking-tight text-[#111111]">
        {store.name}
      </h2>
      <p className="mt-2 font-mono text-xs text-[#787774]">{store.id}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onStartChat}
          className="rounded-md bg-[#111111] px-6 py-3 text-sm font-medium text-white"
        >
          使用该库问答
        </button>
        <button
          type="button"
          onClick={() => setShowAddSource((v) => !v)}
          className="rounded-md border border-[#111111] bg-white px-6 py-3 text-sm font-medium text-[#111111]"
        >
          {showAddSource ? "收起添加" : "添加数据源"}
        </button>
      </div>

      {showAddSource && (
        <AddDataSourcePanel
          store={store}
          onAppended={onAppended}
          onClose={() => setShowAddSource(false)}
        />
      )}

      <div className="relative mt-6 w-full min-w-0 rounded-lg border border-[#eaeaea] bg-white p-6 text-sm">
        <button
          type="button"
          onClick={() => selectDebugFile(debugFilePath)}
          title={debugFilePath}
          className="absolute right-6 top-6 rounded-md border border-[#eaeaea] px-3 py-1.5 text-xs text-[#3c4043] transition-colors hover:border-[#111111]"
        >
          Debug
        </button>
        <dl className="grid min-w-0 w-full gap-4">
        <div className="min-w-0 pr-24">
          <dt className="text-xs uppercase tracking-widest text-[#787774]">
            建库路由
          </dt>
          <dd className="mt-1 break-words">
            {store.route === "per_page" ? "按页切块 (per_page)" : "全书切块 (full_text)"}
          </dd>
        </div>
        <div className="min-w-0 pr-24">
          <dt className="text-xs uppercase tracking-widest text-[#787774]">
            文本块数量
          </dt>
          <dd className="mt-1">{store.chunk_count}</dd>
        </div>
        <div className="min-w-0 pr-24">
          <dt className="text-xs uppercase tracking-widest text-[#787774]">
            PDF 文件夹
          </dt>
          <dd className="mt-1 break-all font-mono text-xs">
            {store.pdf_folder_path}
          </dd>
        </div>
        <div className="min-w-0 w-full">
          <dt className="text-xs uppercase tracking-widest text-[#787774]">
            包含文件 ({store.pdf_files.length})
          </dt>
          <dd className="mt-2 max-h-48 overflow-y-auto overflow-x-hidden border border-[#eaeaea] p-3">
            {deleteError && (
              <p className="mb-2 rounded-md bg-[#fdebec] px-3 py-2 text-xs text-[#9f2f2d]">
                {deleteError}
              </p>
            )}
            <ul className="space-y-2 font-mono text-xs text-[#2f3437]">
              {store.pdf_files.map((f) => (
                <li
                  key={f}
                  className="flex min-w-0 items-start justify-between gap-3"
                >
                  <span className="min-w-0 flex-1 break-all">{f}</span>
                  <button
                    type="button"
                    onClick={() => handleRemovePdf(f)}
                    disabled={!canRemovePdf || deletingPdfPath !== null}
                    title={
                      canRemovePdf
                        ? "从向量库删除该文档"
                        : "至少保留一个 PDF"
                    }
                    className="shrink-0 whitespace-nowrap rounded-md border border-[#eaeaea] px-2 py-0.5 text-xs text-[#9f2f2d] transition-colors hover:border-[#9f2f2d] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {deletingPdfPath === f ? "删除中..." : "删除"}
                  </button>
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="min-w-0 pr-24">
          <dt className="text-xs uppercase tracking-widest text-[#787774]">
            创建时间
          </dt>
          <dd className="mt-1">{new Date(store.created_at).toLocaleString("zh-CN")}</dd>
        </div>
        {store.updated_at && (
          <div className="min-w-0 pr-24">
            <dt className="text-xs uppercase tracking-widest text-[#787774]">
              最近更新
            </dt>
            <dd className="mt-1">
              {new Date(store.updated_at).toLocaleString("zh-CN")}
            </dd>
          </div>
        )}
        </dl>
      </div>
    </div>
  );
}
