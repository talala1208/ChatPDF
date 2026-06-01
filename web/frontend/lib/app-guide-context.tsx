"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { GuidePanel } from "@/lib/docs-nav";

export type GuidePanelState = GuidePanel | null;

interface AppGuideContextValue {
  panel: GuidePanelState;
  debugFile: string | null;
  openPanel: (panel: GuidePanel) => void;
  closePanel: () => void;
  /** 仅记录默认 Debug 文件，不切换面板 */
  preloadDebugFile: (path: string) => void;
  selectDebugFile: (path: string) => void;
}

const AppGuideContext = createContext<AppGuideContextValue | null>(null);

export function AppGuideProvider({ children }: { children: ReactNode }) {
  const [panel, setPanel] = useState<GuidePanelState>(null);
  const [debugFile, setDebugFile] = useState<string | null>(null);

  const openPanel = useCallback((next: GuidePanel) => {
    setPanel(next);
  }, []);

  const closePanel = useCallback(() => {
    setPanel(null);
    setDebugFile(null);
  }, []);

  const preloadDebugFile = useCallback((path: string) => {
    setDebugFile(path);
  }, []);

  const selectDebugFile = useCallback((path: string) => {
    setDebugFile(path);
    setPanel("debug");
  }, []);

  const value = useMemo(
    () => ({
      panel,
      debugFile,
      openPanel,
      closePanel,
      preloadDebugFile,
      selectDebugFile,
    }),
    [panel, debugFile, openPanel, closePanel, preloadDebugFile, selectDebugFile]
  );

  return (
    <AppGuideContext.Provider value={value}>{children}</AppGuideContext.Provider>
  );
}

export function useAppGuide() {
  const context = useContext(AppGuideContext);
  if (!context) {
    throw new Error("useAppGuide 须在 AppGuideProvider 内使用");
  }
  return context;
}
