"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ApiLinkTitle from "@/components/ApiLinkTitle";
import { useAppGuide } from "@/lib/app-guide-context";
import { API_LINKS } from "@/lib/docs-nav";

const PROJECT_GITHUB_URL = "https://github.com/talala1208/ChatPDF";

function DevIndicatorIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
      className="app-menu-mark pointer-events-none block shrink-0"
    >
      <g transform="translate(12, 12)">
        {/* T：顶横 + 竖笔 */}
        <path
          className="app-menu-mark-path0"
          d="M1.5 2 H9.5 L5 2 V9.5"
          fill="none"
          stroke="url(#app_menu_paint0)"
          strokeWidth="1.86"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="20"
          strokeDashoffset="20"
        />
        {/* L：竖笔与底横，与 T 略分开 */}
        <path
          className="app-menu-mark-path1"
          d="M10.5 3.5 V12 H14.5"
          fill="none"
          stroke="url(#app_menu_paint1)"
          strokeWidth="1.86"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="12.5"
          strokeDashoffset="12.5"
        />
      </g>
      <defs>
        <linearGradient
          id="app_menu_paint0"
          x1="6.5"
          y1="2"
          x2="6.5"
          y2="10"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="0.604072" stopColor="white" stopOpacity="0.3" />
          <stop offset="1" stopColor="white" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient
          id="app_menu_paint1"
          x1="12.5"
          y1="3.5"
          x2="12.5"
          y2="12"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0.3" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function ApiLinksMenu() {
  const { openPanel } = useAppGuide();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [open]);

  function handleOpenGuide(panel: "usage" | "structure" | "debug") {
    openPanel(panel);
    setOpen(false);
  }

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      ref={rootRef}
      className="app-menu-root fixed bottom-7 left-7 flex flex-col-reverse items-start"
    >
      <button
        type="button"
        aria-label="菜单"
        aria-expanded={open}
        data-open={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((value) => !value);
        }}
        className="app-menu-badge"
      >
        <DevIndicatorIcon />
      </button>

      {open && (
        <div className="app-menu-panel mb-2 w-56 rounded-xl border border-[#eaeaea] bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => handleOpenGuide("usage")}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-[#111111] transition-colors hover:bg-[#f8f9fa]"
          >
            <span>使用说明</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenGuide("structure")}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-[#111111] transition-colors hover:bg-[#f8f9fa]"
          >
            <span>项目结构</span>
          </button>

          <button
            type="button"
            onClick={() => handleOpenGuide("debug")}
            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-[#111111] transition-colors hover:bg-[#f8f9fa]"
          >
            <span>Debug</span>
          </button>

          {/* API：悬停展开子菜单 */}
          <div className="group relative">
            <div className="flex cursor-default items-center justify-between px-4 py-2.5 text-sm text-[#111111] transition-colors group-hover:bg-[#f8f9fa]">
              <span>API</span>
              <span aria-hidden className="text-[#787774]">
                ›
              </span>
            </div>
            <div className="pointer-events-none invisible absolute bottom-0 left-full ml-1 w-52 rounded-xl border border-[#eaeaea] bg-white py-1 opacity-0 shadow-lg transition-all duration-150 group-hover:pointer-events-auto group-hover:visible group-hover:opacity-100">
              {API_LINKS.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between px-4 py-2.5 text-sm text-[#111111] transition-colors hover:bg-[#f8f9fa]"
                >
                  <ApiLinkTitle name={item.name} hint={item.hint} />
                  <span aria-hidden className="text-[#787774]">
                    ↗
                  </span>
                </a>
              ))}
            </div>
          </div>

          <div className="my-1 border-t border-[#eaeaea]" />

          <a
            href={PROJECT_GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-4 py-2.5 text-sm text-[#111111] transition-colors hover:bg-[#f8f9fa]"
          >
            <span>GitHub</span>
            <span aria-hidden className="text-[#787774]">
              ↗
            </span>
          </a>
        </div>
      )}
    </div>,
    document.body
  );
}
