"use client";

import { useEffect, useState } from "react";
import MarkdownPreview from "@/components/MarkdownPreview";
import { useAppGuide } from "@/lib/app-guide-context";
import { fetchChunkDebugFile } from "@/lib/api";

interface DebugPanelProps {
  embedded?: boolean;
}

type ViewMode = "source" | "preview";

export default function DebugPanel({ embedded = false }: DebugPanelProps) {
  const { debugFile } = useAppGuide();
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");

  useEffect(() => {
    if (!debugFile) {
      setFileContent("");
      setError(null);
      return;
    }

    setViewMode("preview");

    let cancelled = false;

    const path = debugFile;
    if (!path) {
      return;
    }

    async function loadFile() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchChunkDebugFile(path);
        if (!cancelled) {
          setFileContent(data.content);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "读取文件失败");
          setFileContent("");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadFile();
    return () => {
      cancelled = true;
    };
  }, [debugFile]);

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col" : "min-h-screen bg-[#f7f6f3] px-6 py-16"}>
      <div className={`mx-auto flex w-full flex-col ${embedded ? "h-full min-h-0 max-w-5xl" : "max-w-5xl"}`}>
        {!embedded && (
          <div className="mb-6">
            <h1 className="text-3xl font-semibold tracking-tight text-[#111111]">
              Debug
            </h1>
            <p className="mt-2 text-sm text-[#787774]">
              从左侧 Debug 树选择文件查看
            </p>
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-md border border-[#f5c2c0] bg-[#fdebec] px-4 py-3 text-sm text-[#9f2f2d]">
            {error}
          </p>
        )}

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#eaeaea] bg-white">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#eaeaea] px-5 py-3">
            <h2 className="min-w-0 truncate font-mono text-sm font-medium text-[#111111]">
              {debugFile ?? "未选择文件"}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={!debugFile || loading}
                onClick={() => setViewMode("source")}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  viewMode === "source"
                    ? "border-[#111111] bg-[#111111] text-white"
                    : "border-[#eaeaea] text-[#3c4043] hover:border-[#111111]"
                }`}
              >
                源码
              </button>
              <button
                type="button"
                disabled={!debugFile || loading}
                onClick={() => setViewMode("preview")}
                className={`rounded-md border px-3 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  viewMode === "preview"
                    ? "border-[#111111] bg-[#111111] text-white"
                    : "border-[#eaeaea] text-[#3c4043] hover:border-[#111111]"
                }`}
              >
                MD 预览
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {!debugFile && (
              <p className="text-sm text-[#787774]">请从左侧 Debug 树选择文件</p>
            )}
            {debugFile && loading && (
              <p className="text-sm text-[#787774]">读取文件...</p>
            )}
            {debugFile && !loading && viewMode === "source" && (
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[#2f3437]">
                {fileContent}
              </pre>
            )}
            {debugFile && !loading && viewMode === "preview" && (
              <MarkdownPreview content={fileContent} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
