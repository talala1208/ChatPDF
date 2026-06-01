"use client";

import { useEffect, useState } from "react";
import { APP_TAGLINE } from "@/lib/docs-nav";

interface HomeLandingProps {
  onCreateNew: () => void;
  onBrowseStores: () => void;
}

const TECH_TAGS = ["FAISS", "MinerU", "BM25", "HYBRID"];

const TYPEWRITER_CHAR_MS = 100;
const TYPEWRITER_PAUSE_MS = 2000;

/** 首页副标题：逐字打出，完整显示后暂停再循环 */
function TypewriterTagline({ text }: { text: string }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    let count = 0;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function typeNext() {
      if (cancelled) {
        return;
      }
      if (count < text.length) {
        count += 1;
        setVisibleCount(count);
        timer = setTimeout(typeNext, TYPEWRITER_CHAR_MS);
        return;
      }
      timer = setTimeout(() => {
        if (cancelled) {
          return;
        }
        count = 0;
        setVisibleCount(0);
        timer = setTimeout(typeNext, TYPEWRITER_CHAR_MS);
      }, TYPEWRITER_PAUSE_MS);
    }

    setVisibleCount(0);
    timer = setTimeout(typeNext, TYPEWRITER_CHAR_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text]);

  const displayed = text.slice(0, visibleCount);

  return (
    <p className="mt-4 text-sm leading-relaxed text-[#787774]">
      <span className="relative inline-block text-left">
        <span aria-hidden className="invisible">
          {text}
        </span>
        <span className="absolute left-0 top-0 whitespace-nowrap">
          {displayed}
          <span
            aria-hidden
            className="ml-0.5 inline-block w-px animate-pulse bg-[#787774]"
          >
            |
          </span>
        </span>
      </span>
    </p>
  );
}

export default function HomeLanding({
  onCreateNew,
  onBrowseStores,
}: HomeLandingProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl text-center">
        <h1 className="home-title-iridescent font-semibold">ChatPDF</h1>
        <TypewriterTagline text={APP_TAGLINE} />
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {TECH_TAGS.map((tag) => (
            <span
              key={tag}
              className="rounded-md border border-[#eaeaea] bg-white px-3 py-1 text-xs font-medium tracking-wide text-[#3c4043]"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          <button
            type="button"
            onClick={onCreateNew}
            className="group rounded-xl border border-[#eaeaea] bg-white p-8 text-left transition-colors hover:border-[#111111]"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0efec] text-xl leading-none text-[#111111]">
              +
            </span>
            <h2 className="mt-5 text-lg font-medium text-[#111111]">
              新建向量库
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#787774]">
              从本地文件夹建库
            </p>
          </button>

          <button
            type="button"
            onClick={onBrowseStores}
            className="group rounded-xl border border-[#eaeaea] bg-white p-8 text-left transition-colors hover:border-[#111111]"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#f0efec] text-lg text-[#111111]">
              ≡
            </span>
            <h2 className="mt-5 text-lg font-medium text-[#111111]">
              已有向量库
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[#787774]">
              进入问答与历史记录
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
