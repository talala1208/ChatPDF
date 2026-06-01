"use client";

import type { ChatRecord } from "@/lib/api";
import { formatTokenUsage, getChatSettingItems } from "@/lib/api";
import CopyButton from "@/components/CopyButton";
import MarkdownPreview from "@/components/MarkdownPreview";
import SourceList from "@/components/SourceList";

const metaBadgeTitleClassName =
  "inline-flex h-7 w-[6.25rem] items-center justify-start rounded border border-[#eaeaea] bg-white px-2.5 text-left text-xs font-medium uppercase tracking-widest leading-none";

const metaBadgeContentClassName = "mt-2 space-y-1 text-left text-xs leading-normal";

function MetaBadgeSection({ title, lines }: { title: string; lines: string[] }) {
  return (
    <section className="text-xs text-[#787774]">
      <h3 className={metaBadgeTitleClassName}>{title}</h3>
      <div className={metaBadgeContentClassName}>
        {lines.map((line, index) => (
          <p key={index} className="break-words">
            {line}
          </p>
        ))}
      </div>
    </section>
  );
}

export default function HistoryDetailPanel({ record }: { record: ChatRecord }) {
  const chatSettings = getChatSettingItems(record);
  const chatSettingsText = chatSettings
    .map((item) => `${item.label}：${item.value}`)
    .join("｜");
  const tokenUsageLines =
    record.token_breakdown && record.token_breakdown.length > 0
      ? [
          ...record.token_breakdown.map((step) => {
            const modelPart = step.model ? `（${step.model}）` : "";
            return `${step.label}${modelPart}：${formatTokenUsage(step)}`;
          }),
          ...(record.token_usage
            ? [`合计：${formatTokenUsage(record.token_usage)}`]
            : []),
        ]
      : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[#111111]">
          历史问答
        </h2>
        <p className="mt-2 text-sm text-[#787774]">
          {record.vector_store_name} ·{" "}
          {new Date(record.created_at).toLocaleString("zh-CN")}
        </p>
      </div>

      <MetaBadgeSection title="问答参数" lines={[chatSettingsText]} />

      {tokenUsageLines.length > 0 ? (
        <MetaBadgeSection title="Token 消耗" lines={tokenUsageLines} />
      ) : null}

      <section className="rounded-lg border border-[#eaeaea] bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-medium uppercase tracking-widest text-[#787774]">
            问题
          </h3>
          <CopyButton text={record.question} />
        </div>
        <p className="mt-2 text-base leading-relaxed">{record.question}</p>
      </section>

      <section className="rounded-lg border border-[#eaeaea] bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-medium uppercase tracking-widest text-[#787774]">
            回答
          </h3>
          <CopyButton text={record.answer} />
        </div>
        <MarkdownPreview content={record.answer} className="mt-2 text-base" />
      </section>

      {record.sources?.length > 0 && (
        <section className="rounded-lg border border-[#eaeaea] bg-[#f7f6f3] p-6">
          <h3 className="text-xs font-medium uppercase tracking-widest text-[#787774]">
            来源
          </h3>
          <SourceList sources={record.sources} />
        </section>
      )}
    </div>
  );
}
