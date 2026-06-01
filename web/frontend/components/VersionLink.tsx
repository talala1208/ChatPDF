"use client";

import { APP_VERSION, APP_VERSION_HISTORY } from "@/lib/app-versions";

/** 左上角版本号，悬停展示各版本更新摘要（样式对齐 About） */
export default function VersionLink() {
  return (
    <span className="group relative">
      <span className="inline-flex cursor-default rounded-md border border-[#eaeaea] bg-[#f0efec] px-3 py-1 text-xs text-[#3c4043] transition-colors group-hover:border-[#111111] group-hover:bg-white group-hover:text-[#111111]">
        {APP_VERSION}
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-10 mt-1.5 min-w-[16rem] max-w-[20rem] rounded-md border border-[#eaeaea] bg-white px-3 py-2.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
      >
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[#787774]">
          更新记录
        </p>
        <ul className="space-y-2">
          {APP_VERSION_HISTORY.map((entry) => (
            <li key={entry.version} className="text-xs leading-snug">
              <span className="font-medium text-[#111111]">{entry.version}</span>
              <span className="text-[#787774]"> · {entry.summary}</span>
            </li>
          ))}
        </ul>
      </span>
    </span>
  );
}
