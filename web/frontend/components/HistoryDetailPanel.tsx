"use client";

import type { ChatRecord } from "@/lib/api";
import { formatTokenUsage } from "@/lib/api";
import CopyButton from "@/components/CopyButton";
import SourceList from "@/components/SourceList";

export default function HistoryDetailPanel({ record }: { record: ChatRecord }) {
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

      {record.token_breakdown && record.token_breakdown.length > 0 && (
        <section>
          <h3 className="inline-block rounded border border-[#eaeaea] bg-white px-2.5 py-1 text-xs font-medium uppercase tracking-widest text-[#787774]">
            Token 消耗
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-[#787774]">
            {record.token_breakdown.map((step) => (
              <li key={`${step.label}-${step.model ?? ""}`}>
                {step.label}
                {step.model ? (
                  <span className="text-[#787774]">（{step.model}）</span>
                ) : null}
                ：{formatTokenUsage(step)}
              </li>
            ))}
          </ul>
          {record.token_usage ? (
            <p className="mt-3 text-sm text-[#787774]">
              合计：{formatTokenUsage(record.token_usage)}
            </p>
          ) : null}
        </section>
      )}

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
        <p className="mt-2 whitespace-pre-wrap text-base leading-relaxed">
          {record.answer}
        </p>
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
