"use client";

import { useState } from "react";
import DocsTreeSection from "@/components/DocsTreeSection";
import type { ChatRecord, VectorStore } from "@/lib/api";
import { deleteChatHistory, deleteVectorStore } from "@/lib/api";
import { APP_TAGLINE, type GuidePanel } from "@/lib/docs-nav";

export type MainView =
  | { type: "home" }
  | { type: "stores" }
  | { type: "build" }
  | { type: "store"; storeId: string }
  | { type: "chat"; storeId: string }
  | { type: "history"; recordId: string };

interface SidebarProps {
  stores: VectorStore[];
  history: ChatRecord[];
  mainView: MainView;
  onNavigate: (view: MainView) => void;
  onRefresh: () => void;
  collapsed?: boolean;
  showDocsTree?: boolean;
  guidePanel?: GuidePanel | null;
  onSelectGuide?: (panel: GuidePanel) => void;
  onCloseGuide?: () => void;
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "bg-[#111111] text-white"
          : "text-[#2f3437] hover:bg-[#f0efec]"
      }`}
    >
      {children}
    </button>
  );
}

export default function Sidebar({
  stores,
  history,
  mainView,
  onNavigate,
  onRefresh,
  collapsed = false,
  showDocsTree = false,
  guidePanel = null,
  onSelectGuide,
  onCloseGuide,
}: SidebarProps) {
  const [deletingStore, setDeletingStore] = useState(false);
  const [deletingHistory, setDeletingHistory] = useState(false);

  const selectedStoreId =
    mainView.type === "store" || mainView.type === "chat"
      ? mainView.storeId
      : mainView.type === "history"
        ? (history.find((item) => item.id === mainView.recordId)
            ?.vector_store_id ?? null)
        : null;

  const selectedStore = selectedStoreId
    ? stores.find((store) => store.id === selectedStoreId)
    : undefined;

  const filteredHistory = selectedStoreId
    ? history.filter((item) => item.vector_store_id === selectedStoreId)
    : [];

  const selectedHistoryId =
    mainView.type === "history" ? mainView.recordId : null;

  const selectedHistory = selectedHistoryId
    ? history.find((item) => item.id === selectedHistoryId)
    : undefined;

  async function handleDeleteSelected() {
    if (!selectedStoreId || !selectedStore) {
      return;
    }

    const confirmed = window.confirm(
      `确定删除向量库「${selectedStore.name}」吗？此操作不可恢复。`
    );
    if (!confirmed) {
      return;
    }

    setDeletingStore(true);
    try {
      await deleteVectorStore(selectedStoreId);
      onNavigate({ type: "stores" });
      await onRefresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingStore(false);
    }
  }

  async function handleDeleteHistory() {
    if (!selectedHistoryId || !selectedHistory) {
      return;
    }

    const confirmed = window.confirm(
      `确定删除这条问答记录吗？\n「${selectedHistory.question}」`
    );
    if (!confirmed) {
      return;
    }

    setDeletingHistory(true);
    try {
      await deleteChatHistory(selectedHistoryId);
      if (selectedStoreId) {
        onNavigate({ type: "store", storeId: selectedStoreId });
      } else {
        onNavigate({ type: "stores" });
      }
      await onRefresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingHistory(false);
    }
  }

  if (collapsed) {
    return null;
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-[#eaeaea] bg-white">
      <div className="border-b border-[#eaeaea] px-4 py-5">
        <button
          type="button"
          onClick={() => {
            onCloseGuide?.();
            onNavigate({ type: "home" });
          }}
          className="text-left"
        >
          <h1 className="text-lg font-semibold tracking-tight text-[#111111]">
            ChatPDF
          </h1>
          <p className="mt-1 text-xs text-[#787774]">{APP_TAGLINE}</p>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        {showDocsTree && guidePanel && onSelectGuide ? (
          <DocsTreeSection
            activePanel={guidePanel}
            onSelectPanel={onSelectGuide}
          />
        ) : (
          <>
        <section>
          <button
            type="button"
            onClick={() => onNavigate({ type: "build" })}
            className={`flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-sm transition-colors ${
              mainView.type === "build"
                ? "border-[#111111] bg-[#111111] text-white"
                : "border-[#dadce0] bg-[#f8f9fa] text-[#2f3437] hover:border-[#111111] hover:bg-white"
            }`}
          >
            <span
              className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-base leading-none ${
                mainView.type === "build"
                  ? "bg-white/15 text-white"
                  : "bg-white text-[#111111]"
              }`}
              aria-hidden
            >
              +
            </span>
            <span className="font-medium">新建向量库</span>
          </button>

          <div className="my-4 border-t border-[#eaeaea]" />

          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[#787774]">
              已有向量库
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={!selectedStoreId || deletingStore}
                className="text-xs text-[#9f2f2d] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deletingStore ? "删除中..." : "删除"}
              </button>
              <button
                type="button"
                onClick={onRefresh}
                className="text-xs text-[#1f6c9f] hover:underline"
              >
                刷新
              </button>
            </div>
          </div>

          <ul className="space-y-1">
            {stores.length === 0 && (
              <li className="px-3 py-2 text-xs text-[#787774]">暂无已建库</li>
            )}
            {stores.map((store) => (
              <li key={store.id}>
                <NavButton
                  active={
                    (mainView.type === "store" ||
                      mainView.type === "chat") &&
                    mainView.storeId === store.id
                  }
                  onClick={() =>
                    onNavigate({ type: "store", storeId: store.id })
                  }
                >
                  <span className="block truncate font-medium">{store.name}</span>
                  <span className="block truncate text-xs opacity-80">
                    {store.route === "per_page" ? "按页切块" : "全书切块"}
                  </span>
                </NavButton>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-medium uppercase tracking-widest text-[#787774]">
              问答历史
            </span>
            <button
              type="button"
              onClick={handleDeleteHistory}
              disabled={!selectedHistoryId || deletingHistory}
              className="text-xs text-[#9f2f2d] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deletingHistory ? "删除中..." : "删除"}
            </button>
          </div>
          <ul className="space-y-1">
            {!selectedStoreId && (
              <li className="px-3 py-2 text-xs text-[#787774]">请先选择向量库</li>
            )}
            {selectedStoreId && filteredHistory.length === 0 && (
              <li className="px-3 py-2 text-xs text-[#787774]">暂无问答记录</li>
            )}
            {filteredHistory.map((item) => (
              <li key={item.id}>
                <NavButton
                  active={
                    mainView.type === "history" &&
                    mainView.recordId === item.id
                  }
                  onClick={() =>
                    onNavigate({ type: "history", recordId: item.id })
                  }
                >
                  <span className="block truncate">{item.question}</span>
                  <span className="block truncate text-xs opacity-80">
                    {item.vector_store_name}
                    {item.token_usage
                      ? ` · Token ${item.token_usage.total_tokens}`
                      : ""}
                  </span>
                </NavButton>
              </li>
            ))}
          </ul>
        </section>
          </>
        )}
      </div>
    </aside>
  );
}
