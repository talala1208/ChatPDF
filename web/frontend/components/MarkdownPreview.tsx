"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export default function MarkdownPreview({
  content,
  className,
}: MarkdownPreviewProps) {
  return (
    <div
      className={`markdown-preview leading-relaxed text-[#2f3437] ${className ?? "text-sm"}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
