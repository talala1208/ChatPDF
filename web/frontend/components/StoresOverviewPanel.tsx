"use client";

import type { VectorStore } from "@/lib/api";

interface StoresOverviewPanelProps {
  stores: VectorStore[];
  loading: boolean;
  onSelectStore: (storeId: string) => void;
  onCreateNew: () => void;
}

export default function StoresOverviewPanel({
  stores,
  loading,
  onSelectStore,
  onCreateNew,
}: StoresOverviewPanelProps) {
  if (loading) {
    return <p className="text-sm text-[#787774]">加载中...</p>;
  }

  if (stores.length === 0) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight text-[#111111]">
          已有向量库
        </h2>
        <p className="mt-3 text-sm text-[#787774]">暂无已建库，先创建一个向量库吧</p>
        <button
          type="button"
          onClick={onCreateNew}
          className="mt-6 rounded-md bg-[#111111] px-5 py-3 text-sm font-medium text-white"
        >
          新建向量库
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[#111111]">
          已有向量库
        </h2>
        <div className="mt-2 space-y-1 text-sm text-[#787774]">
          <p>共 {stores.length} 个向量库，点击进入详情或问答</p>
          <p>( 向量库详情页可增量添加数据源 )</p>
        </div>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {stores.map((store) => (
          <li key={store.id}>
            <button
              type="button"
              onClick={() => onSelectStore(store.id)}
              className="w-full rounded-lg border border-[#eaeaea] bg-white p-5 text-left transition-colors hover:border-[#111111]"
            >
              <span className="block truncate font-medium text-[#111111]">
                {store.name}
              </span>
              <span className="mt-2 block text-xs text-[#787774]">
                {store.route === "per_page" ? "按页切块" : "全书切块"} ·{" "}
                {store.chunk_count} 块 · {store.pdf_files.length} 个 PDF
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
