"use client";

import { useState } from "react";

export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="shrink-0 rounded border border-[#eaeaea] bg-[#f7f6f3] px-2.5 py-1 text-xs text-[#787774] transition-colors hover:border-[#dadce0] hover:text-[#2f3437]"
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}
