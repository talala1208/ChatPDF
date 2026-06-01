"use client";

import { useState } from "react";
import type { VectorStore } from "@/lib/api";
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
  const debugFilePath = getStoreDebugFilePath(store.id, store.pdf_files);
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

      <div className="relative mt-8 w-full min-w-0 rounded-lg border border-[#eaeaea] bg-white p-6 text-sm">
        <button
          type="button"
          onClick={() => selectDebugFile(debugFilePath)}
          title={debugFilePath}
          className="absolute right-6 top-6 rounded-md border border-[#eaeaea] px-3 py-1.5 text-xs text-[#3c4043] transition-colors hover:border-[#111111]"
        >
          Debug
        </button>
        <dl className="grid gap-4 pr-24">
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-widest text-[#787774]">
            建库路由
          </dt>
          <dd className="mt-1 break-words">
            {store.route === "per_page" ? "按页切块 (per_page)" : "全书切块 (full_text)"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-widest text-[#787774]">
            文本块数量
          </dt>
          <dd className="mt-1">{store.chunk_count}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-widest text-[#787774]">
            PDF 文件夹
          </dt>
          <dd className="mt-1 break-all font-mono text-xs">
            {store.pdf_folder_path}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-widest text-[#787774]">
            包含文件 ({store.pdf_files.length})
          </dt>
          <dd className="mt-2 max-h-48 overflow-y-auto overflow-x-hidden">
            <ul className="space-y-1 font-mono text-xs text-[#2f3437]">
              {store.pdf_files.map((f) => (
                <li key={f} className="break-all">
                  {f}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs uppercase tracking-widest text-[#787774]">
            创建时间
          </dt>
          <dd className="mt-1">{new Date(store.created_at).toLocaleString("zh-CN")}</dd>
        </div>
        {store.updated_at && (
          <div className="min-w-0">
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

      <div className="mt-8 flex flex-wrap gap-3">
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
    </div>
  );
}
