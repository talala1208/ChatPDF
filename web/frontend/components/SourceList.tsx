"use client";

import { useState } from "react";
import type { ChatSource } from "@/lib/api";

export default function SourceList({ sources }: { sources: ChatSource[] }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <ul className="mt-3 space-y-2">
      {sources.map((src, i) => {
        const expanded = expandedIndex === i;
        const fileName = String(src.source).split("/").pop();

        return (
          <li key={`${src.source}-${src.page}-${i}`}>
            <button
              type="button"
              onClick={() => setExpandedIndex(expanded ? null : i)}
              className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-[#2f3437] transition-colors ${
                expanded
                  ? "bg-[#e8eaed]"
                  : "bg-white hover:bg-[#f0efec]"
              }`}
            >
              <span
                aria-hidden
                className={`shrink-0 text-[10px] leading-none text-[#787774] transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
              >
                ▼
              </span>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-[#e1f3fe] px-2.5 py-0.5 font-medium text-[#1f6c9f]">
                第 {src.page} 页
              </span>
              {typeof src.similarity === "number" ? (
                <span className="shrink-0 whitespace-nowrap rounded-full bg-[#f0efec] px-2.5 py-0.5 tabular-nums text-[#2f3437]">
                  相似度 {src.similarity.toFixed(2)}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate text-[#787774]">
                {src.build_route} · {fileName}
              </span>
            </button>
            {expanded && (
              <div className="mt-2 whitespace-pre-wrap rounded-md border border-[#eaeaea] bg-white px-3 py-3 text-sm leading-relaxed text-[#2f3437]">
                {src.content || "暂无 chunk 内容"}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
