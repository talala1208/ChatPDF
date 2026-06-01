"use client";

import { useEffect, useRef, useState } from "react";
import ApiLinkTitle from "@/components/ApiLinkTitle";
import { useAppGuide } from "@/lib/app-guide-context";
import { fetchChunkDebugTree, type ChunkDebugNode } from "@/lib/api";
import { API_LINKS, type GuidePanel } from "@/lib/docs-nav";
import {
  collectDebugDirPaths,
  collectFirstDebugFile,
} from "@/lib/chunk-debug-tree";

interface DocsTreeSectionProps {
  activePanel: GuidePanel;
  onSelectPanel: (panel: GuidePanel) => void;
}

function TreeButton({
  active,
  depth = 0,
  onClick,
  children,
}: {
  active?: boolean;
  depth?: number;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center rounded-md py-1.5 text-left text-sm transition-colors ${
        active
          ? "bg-[#111111] font-medium text-white"
          : "text-[#2f3437] hover:bg-[#f0efec]"
      }`}
      style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: "12px" }}
    >
      {children}
    </button>
  );
}

function TreeLink({
  depth,
  href,
  children,
}: {
  depth: number;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between rounded-md py-2 text-sm text-[#2f3437] transition-colors hover:bg-[#f0efec]"
      style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: "12px" }}
    >
      <span>{children}</span>
      <span aria-hidden className="text-xs text-[#787774]">
        ↗
      </span>
    </a>
  );
}

function DebugTreeNode({
  node,
  depth,
  selectedPath,
  expandedDirs,
  onToggleDir,
  onSelectFile,
}: {
  node: ChunkDebugNode;
  depth: number;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
}) {
  if (node.type === "dir") {
    const expanded = expandedDirs.has(node.path);
    return (
      <li>
        <button
          type="button"
          onClick={() => onToggleDir(node.path)}
          className="flex w-full items-center gap-1 rounded-md py-1.5 text-left text-sm text-[#2f3437] transition-colors hover:bg-[#f0efec]"
          style={{
            paddingLeft: `${12 + depth * 16}px`,
            paddingRight: "12px",
          }}
        >
          <span
            aria-hidden
            className="inline-block w-4 shrink-0 text-xs text-[#787774]"
          >
            {expanded ? "▼" : "▶"}
          </span>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children && node.children.length > 0 && (
          <ul className="mt-0.5 space-y-0.5">
            {node.children.map((child) => (
              <DebugTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                expandedDirs={expandedDirs}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const active = selectedPath === node.path;
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectFile(node.path)}
        className={`flex w-full flex-col rounded-md py-1.5 text-left text-sm transition-colors ${
          active
            ? "bg-[#111111] font-medium text-white"
            : "text-[#2f3437] hover:bg-[#f0efec]"
        }`}
        style={{
          paddingLeft: `${12 + depth * 16 + 20}px`,
          paddingRight: "12px",
        }}
      >
        <span className="truncate">{node.name}</span>
        {node.size != null && (
          <span
            className={`truncate text-[90%] ${
              active ? "text-white/70" : "text-[#787774]"
            }`}
          >
            {(node.size / 1024).toFixed(1)} KB
          </span>
        )}
      </button>
    </li>
  );
}

export default function DocsTreeSection({
  activePanel,
  onSelectPanel,
}: DocsTreeSectionProps) {
  const { debugFile, preloadDebugFile, selectDebugFile } = useAppGuide();
  const [apiExpanded, setApiExpanded] = useState(true);
  const [debugExpanded, setDebugExpanded] = useState(activePanel === "debug");
  const [debugTree, setDebugTree] = useState<ChunkDebugNode[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const treeLoadedRef = useRef(false);

  useEffect(() => {
    if (activePanel === "debug") {
      setDebugExpanded(true);
    }
  }, [activePanel]);

  useEffect(() => {
    if (treeLoadedRef.current) {
      return;
    }

    let cancelled = false;

    async function loadDebugTree() {
      setDebugLoading(true);
      try {
        const data = await fetchChunkDebugTree();
        if (cancelled) {
          return;
        }
        setDebugTree(data.tree);
        setExpandedDirs(new Set(collectDebugDirPaths(data.tree)));
        treeLoadedRef.current = true;

        const firstFile = collectFirstDebugFile(data.tree);
        if (firstFile) {
          preloadDebugFile(firstFile);
        }
      } catch {
        if (!cancelled) {
          setDebugTree([]);
        }
      } finally {
        if (!cancelled) {
          setDebugLoading(false);
        }
      }
    }

    loadDebugTree();
    return () => {
      cancelled = true;
    };
  }, [preloadDebugFile]);

  function toggleDebugDir(path: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function handleDebugHeaderClick() {
    const nextExpanded = !debugExpanded;
    setDebugExpanded(nextExpanded);
    if (nextExpanded) {
      onSelectPanel("debug");
    }
  }

  return (
    <section>
      <div className="mb-2 px-1">
        <span className="text-xs font-medium uppercase tracking-widest text-[#787774]">
          文档
        </span>
      </div>

      <ul className="space-y-0.5">
        <li>
          <TreeButton
            active={activePanel === "usage"}
            depth={0}
            onClick={() => onSelectPanel("usage")}
          >
            <span className="inline-block w-4 shrink-0" aria-hidden />
            使用说明
          </TreeButton>
        </li>

        <li>
          <TreeButton
            active={activePanel === "structure"}
            depth={0}
            onClick={() => onSelectPanel("structure")}
          >
            <span className="inline-block w-4 shrink-0" aria-hidden />
            项目结构
          </TreeButton>
        </li>

        <li>
          <button
            type="button"
            onClick={handleDebugHeaderClick}
            className={`flex w-full items-center gap-1 rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors hover:bg-[#f0efec] ${
              activePanel === "debug" ? "text-[#111111]" : "text-[#2f3437]"
            }`}
          >
            <span
              aria-hidden
              className="inline-block w-4 shrink-0 text-xs text-[#787774]"
            >
              {debugExpanded ? "▼" : "▶"}
            </span>
            <span>Debug</span>
          </button>
          {debugExpanded && (
            <ul className="mt-0.5 space-y-0.5">
              {debugLoading && (
                <li className="px-3 py-2 text-xs text-[#787774]">加载中...</li>
              )}
              {!debugLoading && debugTree.length === 0 && (
                <li className="px-3 py-2 text-xs text-[#787774]">
                  暂无调试文件
                </li>
              )}
              {!debugLoading &&
                debugTree.map((node) => (
                  <DebugTreeNode
                    key={node.path}
                    node={node}
                    depth={1}
                    selectedPath={activePanel === "debug" ? debugFile : null}
                    expandedDirs={expandedDirs}
                    onToggleDir={toggleDebugDir}
                    onSelectFile={selectDebugFile}
                  />
                ))}
            </ul>
          )}
        </li>

        <li>
          <button
            type="button"
            onClick={() => setApiExpanded((value) => !value)}
            className="flex w-full items-center gap-1 rounded-md px-3 py-1.5 text-left text-sm font-medium text-[#2f3437] transition-colors hover:bg-[#f0efec]"
          >
            <span
              aria-hidden
              className="inline-block w-4 shrink-0 text-xs text-[#787774]"
            >
              {apiExpanded ? "▼" : "▶"}
            </span>
            <span>API</span>
          </button>
          {apiExpanded && (
            <ul className="mt-0.5 space-y-0.5">
              {API_LINKS.map((item) => (
                <li key={item.name}>
                  <TreeLink depth={1} href={item.href}>
                    <ApiLinkTitle name={item.name} hint={item.hint} />
                  </TreeLink>
                </li>
              ))}
            </ul>
          )}
        </li>
      </ul>
    </section>
  );
}
