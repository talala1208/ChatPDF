"use client";

import { useCallback, useEffect, useState } from "react";
import BuildIndexPanel from "@/components/BuildIndexPanel";
import ChatPanel from "@/components/ChatPanel";
import HistoryDetailPanel from "@/components/HistoryDetailPanel";
import HomeLanding from "@/components/HomeLanding";
import DebugPanel from "@/components/DebugPanel";
import ProjectStructurePanel from "@/components/ProjectStructurePanel";
import Sidebar, { type MainView } from "@/components/Sidebar";
import StoreDetailPanel from "@/components/StoreDetailPanel";
import StoresOverviewPanel from "@/components/StoresOverviewPanel";
import UsageGuidePanel from "@/components/UsageGuidePanel";
import VersionLink from "@/components/VersionLink";
import { useAppGuide } from "@/lib/app-guide-context";
import {
  checkHealth,
  fetchChatHistory,
  fetchVectorStores,
  type ChatRecord,
  type VectorStore,
} from "@/lib/api";

/** 小螃蟹颜文字：双钳、圆眼、身壳 */
const AUTHOR_KAOMOJI = `    /\\   /\\
   /  \\ /  \\
   | (o.o) |
   \\___|___/`;

const AUTHOR_GITHUB_URL = "https://github.com/talala1208";

function AboutLink() {
  return (
    <span className="group relative">
      <a
        href={AUTHOR_GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="作者 GitHub 主页"
        className="inline-flex rounded-md border border-[#eaeaea] bg-[#f0efec] px-3 py-1 text-xs text-[#3c4043] no-underline transition-colors hover:border-[#111111] hover:bg-white hover:text-[#111111]"
      >
        About
      </a>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-10 mt-1.5 flex flex-col items-center gap-1.5 rounded-md border border-[#eaeaea] bg-white px-3 py-2 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
      >
        <span className="w-full text-center text-xs text-[#3c4043]">
          作者 tart
        </span>
        <div className="flex w-full justify-center">
          <pre
            aria-hidden
            className="m-0 text-left font-mono text-[9px] leading-[1.15] text-[#9a7b4f]"
          >
            {AUTHOR_KAOMOJI}
          </pre>
        </div>
      </span>
    </span>
  );
}

function ApiStatusBadge({ apiOnline }: { apiOnline: boolean | null }) {
  if (apiOnline === false) {
    return (
      <span className="rounded-md bg-[#fdebec] px-3 py-1 text-xs text-[#9f2f2d]">
        后端未连接，请启动 uvicorn (端口 8000)
      </span>
    );
  }

  if (apiOnline === true) {
    return (
      <span className="rounded-md bg-[#edf3ec] px-3 py-1 text-xs text-[#346538]">
        API 已连接
      </span>
    );
  }

  return null;
}

export default function HomePage() {
  const { panel, openPanel, closePanel } = useAppGuide();
  const [stores, setStores] = useState<VectorStore[]>([]);
  const [history, setHistory] = useState<ChatRecord[]>([]);
  const [mainView, setMainView] = useState<MainView>({ type: "home" });
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const isGuideView = panel !== null;
  const showSidebar = mainView.type !== "home" || isGuideView;

  useEffect(() => {
    if (panel) {
      setMainView({ type: "home" });
    }
  }, [panel]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h, ok] = await Promise.all([
        fetchVectorStores(),
        fetchChatHistory(),
        checkHealth(),
      ]);
      setStores(s);
      setHistory(h);
      setApiOnline(ok);
    } catch {
      setApiOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleNavigate = useCallback(
    (view: MainView) => {
      if (panel && view.type !== "home") {
        closePanel();
      }
      setMainView(view);
    },
    [panel, closePanel]
  );

  const selectedStore =
    mainView.type === "store" || mainView.type === "chat"
      ? stores.find((s) => s.id === mainView.storeId)
      : undefined;

  const selectedHistory =
    mainView.type === "history"
      ? history.find((h) => h.id === mainView.recordId)
      : undefined;

  if (mainView.type === "home" && !isGuideView) {
    return (
      <div className="relative min-h-screen bg-[#f7f6f3]">
        <div className="absolute left-6 top-6">
          <VersionLink />
        </div>
        <div className="absolute right-6 top-6 flex items-center gap-3">
          <AboutLink />
          <ApiStatusBadge apiOnline={apiOnline} />
        </div>
        <HomeLanding
          onCreateNew={() => setMainView({ type: "build" })}
          onBrowseStores={() => setMainView({ type: "stores" })}
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        stores={stores}
        history={history}
        mainView={mainView}
        onNavigate={handleNavigate}
        onRefresh={refresh}
        collapsed={!showSidebar}
        showDocsTree={isGuideView}
        guidePanel={panel}
        onSelectGuide={openPanel}
        onCloseGuide={closePanel}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[#eaeaea] bg-white px-8 py-4">
          <span className="text-sm text-[#787774]">
            {isGuideView && panel === "usage" && "使用说明"}
            {isGuideView && panel === "structure" && "项目结构"}
            {isGuideView && panel === "debug" && "Debug"}
            {!isGuideView && mainView.type === "stores" && "已有向量库"}
            {!isGuideView && mainView.type === "build" && "新建向量库"}
            {!isGuideView && mainView.type === "store" && "向量库详情"}
            {!isGuideView && mainView.type === "chat" && "问答"}
            {!isGuideView && mainView.type === "history" && "历史问答"}
          </span>
          <div className="flex items-center gap-3">
            {isGuideView && (
              <button
                type="button"
                onClick={closePanel}
                className="rounded-md border border-[#eaeaea] px-3 py-1.5 text-xs text-[#3c4043] transition-colors hover:border-[#111111]"
              >
                返回首页
              </button>
            )}
            <AboutLink />
            <ApiStatusBadge apiOnline={apiOnline} />
          </div>
        </header>

        <div
          className={`min-h-0 flex-1 bg-[#f7f6f3] px-8 py-8 ${
            isGuideView && panel === "debug"
              ? "flex flex-col overflow-hidden"
              : "overflow-y-auto"
          }`}
        >
          {isGuideView && panel === "usage" && <UsageGuidePanel embedded />}
          {isGuideView && panel === "structure" && (
            <ProjectStructurePanel embedded />
          )}
          {isGuideView && panel === "debug" && <DebugPanel embedded />}

          {!isGuideView && loading && mainView.type !== "build" && (
            <p className="text-sm text-[#787774]">加载中...</p>
          )}

          {!isGuideView && mainView.type === "stores" && (
            <StoresOverviewPanel
              stores={stores}
              loading={loading}
              onSelectStore={(storeId) =>
                setMainView({ type: "store", storeId })
              }
              onCreateNew={() => setMainView({ type: "build" })}
            />
          )}

          {!isGuideView && mainView.type === "build" && (
            <BuildIndexPanel onBuilt={refresh} />
          )}

          {!isGuideView && mainView.type === "store" && selectedStore && (
            <StoreDetailPanel
              store={selectedStore}
              onBack={() => handleNavigate({ type: "stores" })}
              onStartChat={() =>
                setMainView({ type: "chat", storeId: selectedStore.id })
              }
              onAppended={refresh}
            />
          )}

          {!isGuideView && mainView.type === "store" && !selectedStore && !loading && (
            <p className="text-sm text-[#787774]">向量库不存在或已删除</p>
          )}

          {!isGuideView && mainView.type === "chat" && selectedStore && (
            <ChatPanel store={selectedStore} onAsked={refresh} />
          )}

          {!isGuideView && mainView.type === "chat" && !selectedStore && !loading && (
            <p className="text-sm text-[#787774]">请先选择向量库</p>
          )}

          {!isGuideView && mainView.type === "history" && selectedHistory && (
            <HistoryDetailPanel record={selectedHistory} />
          )}

          {!isGuideView && mainView.type === "history" && !selectedHistory && !loading && (
            <p className="text-sm text-[#787774]">记录不存在</p>
          )}
        </div>
      </main>
    </div>
  );
}
