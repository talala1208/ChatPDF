"use client";

import type { ReactNode } from "react";

interface ProjectStructurePanelProps {
  embedded?: boolean;
  onClose?: () => void;
}

/** 带白描边的 SVG 标签，避免被连线遮挡 */
function DiagramLabel({
  x,
  y,
  children,
  anchor = "middle",
  className,
  outlined = true,
}: {
  x: number;
  y: number;
  children: ReactNode;
  anchor?: "start" | "middle" | "end";
  className?: string;
  /** 是否加白描边，模块路径副标题等不需要描边时可设为 false */
  outlined?: boolean;
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      className={className}
      {...(outlined
        ? {
            paintOrder: "stroke fill",
            stroke: "#ffffff",
            strokeWidth: 4,
            strokeLinejoin: "round",
          }
        : {})}
    >
      {children}
    </text>
  );
}

function NodeShape({
  x,
  y,
  w,
  h,
  fill = "#ffffff",
  stroke = "#c8dcc8",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: string;
  stroke?: string;
}) {
  return (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={10}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.5}
    />
  );
}

/** 按方框内宽估算每行最大字符数 */
function maxCharsForWidth(innerWidth: number, fontSize: number): number {
  return Math.max(4, Math.floor(innerWidth / (fontSize * 0.62)));
}

/** 在分隔符或字符边界处换行 */
function wrapLines(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) {
    return [text];
  }

  const lines: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      lines.push(remaining);
      break;
    }

    const segment = remaining.slice(0, maxChars + 1);
    let breakAt = -1;
    for (const sep of [" · ", " / ", " ·", " /", " ", "·", "/"]) {
      const idx = segment.lastIndexOf(sep, maxChars);
      if (idx > 0) {
        breakAt = idx + sep.length;
        break;
      }
    }
    if (breakAt <= 0) {
      breakAt = maxChars;
    }

    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }

  return lines.length > 0 ? lines : [text];
}

function SvgMultilineText({
  x,
  y,
  w,
  h,
  pad,
  title,
  subtitle,
  titleSize = 13,
  subtitleSize = 11,
  titleClass = "fill-[#111111] font-medium",
  subtitleClass = "fill-[#787774]",
  gap = 8,
  vPad = 6,
  anchor = "middle",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  pad: number;
  title: string;
  subtitle?: string;
  titleSize?: number;
  subtitleSize?: number;
  titleClass?: string;
  subtitleClass?: string;
  gap?: number;
  vPad?: number;
  anchor?: "start" | "middle";
}) {
  const innerW = w - pad * 2;
  const innerH = h - vPad * 2;
  const textX = anchor === "start" ? x + pad : x + w / 2;
  const titleLines = wrapLines(title, maxCharsForWidth(innerW, titleSize));
  const subtitleLines = subtitle
    ? subtitle.includes("\n")
      ? subtitle.split("\n")
      : wrapLines(subtitle, maxCharsForWidth(innerW, subtitleSize))
    : [];
  const titleLineH = titleSize + 4;
  const subtitleLineH = subtitleSize + 4;
  const blockH =
    titleLines.length * titleLineH +
    (subtitleLines.length > 0
      ? gap + subtitleLines.length * subtitleLineH
      : 0);
  const startY = y + vPad + (innerH - blockH) / 2 + titleSize;

  return (
    <text x={textX} y={startY} textAnchor={anchor}>
      {titleLines.map((line, index) => (
        <tspan
          key={`title-${index}`}
          x={textX}
          dy={index === 0 ? 0 : titleLineH}
          className={titleClass}
          style={{ fontSize: titleSize }}
        >
          {line}
        </tspan>
      ))}
      {subtitleLines.map((line, index) => (
        <tspan
          key={`subtitle-${index}`}
          x={textX}
          dy={index === 0 ? (titleLines.length > 0 ? titleLineH + gap : 0) : subtitleLineH}
          className={subtitleClass}
          style={{ fontSize: subtitleSize }}
        >
          {line}
        </tspan>
      ))}
    </text>
  );
}

function NodeText({
  x,
  y,
  w,
  h,
  title,
  subtitle,
  pad = 8,
  vPad = 6,
  subtitleSize,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle?: string;
  pad?: number;
  vPad?: number;
  subtitleSize?: number;
}) {
  return (
    <SvgMultilineText
      x={x}
      y={y}
      w={w}
      h={h}
      pad={pad}
      vPad={vPad}
      title={title}
      subtitle={subtitle}
      subtitleSize={subtitleSize}
    />
  );
}

function NoteBoxText({
  x,
  y,
  w,
  h,
  title,
  subtitle,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string;
}) {
  return (
    <SvgMultilineText
      x={x}
      y={y}
      w={w}
      h={h}
      pad={10}
      title={title}
      subtitle={subtitle}
      titleSize={11}
      subtitleSize={10}
      titleClass="fill-[#111111] font-medium"
      gap={8}
      anchor="start"
    />
  );
}

function SolidArrowLine({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="#5a7a5a"
      strokeWidth={1.5}
      markerEnd="url(#arrow-solid-green)"
    />
  );
}

function DashedArrowLine({
  x1,
  y1,
  x2,
  y2,
  color = "#1f6c9f",
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
}) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={color}
      strokeWidth={1.5}
      strokeDasharray="6 4"
      markerEnd="url(#arrow-dashed-blue)"
    />
  );
}

function ArchitectureDiagram() {
  // 统一节点尺寸，便于对齐与视觉一致
  const compact = { w: 110, h: 72 };
  const standard = { w: 130, h: 80 };
  const wide = { w: 150, h: 84 };
  const buildRoute = { w: 170, h: 72 };
  const secondaryY = 206;
  const secondaryH = buildRoute.h;
  const pipelineY = 88;
  const pipelineH = standard.h;
  const vectorStores = { x: 722, y: pipelineY, w: wide.w, h: pipelineH };
  const chunkDebug = { x: vectorStores.x, y: secondaryY, w: vectorStores.w, h: secondaryH };
  const storeColumnCx = vectorStores.x + vectorStores.w / 2;
  const vectorStoresBottomY = vectorStores.y + vectorStores.h;
  const answeringContentDy = 18;
  const answeringSectionY = 330;
  const answeringSectionH = 410;
  const answeringTitleY = answeringSectionY + 14 + answeringContentDy;
  const answeringSubtitleY = answeringSectionY + 34 + answeringContentDy;
  const answeringRowY = 390 + answeringContentDy;
  const answeringRowH = wide.h;
  const answeringRowCy = answeringRowY + answeringRowH / 2;
  const question = { x: 40, y: answeringRowY, w: compact.w, h: answeringRowH };
  const vectorStore = { x: 248, y: answeringRowY, w: standard.w, h: answeringRowH };
  const hybrid = { x: 416, y: answeringRowY, w: wide.w, h: answeringRowH };
  const requestColumnX = 632;
  const requestColumnW = standard.w;
  const topK = { x: requestColumnX, y: answeringRowY, w: requestColumnW, h: answeringRowH };
  const questionRightX = question.x + question.w;
  const questionRightCy = question.y + question.h / 2;
  const questionBottomCy = question.x + question.w / 2;
  const questionBottomY = question.y + question.h;
  const vectorStoreLeftX = vectorStore.x;
  const vectorStoreRightX = vectorStore.x + vectorStore.w;
  const hybridLeftX = hybrid.x;
  const hybridRightX = hybrid.x + hybrid.w;
  const hybridBottomCy = hybrid.x + hybrid.w / 2;
  const hybridBottomY = hybrid.y + hybrid.h;
  const topKLeftX = topK.x;
  const topKBottomY = topK.y + topK.h;
  const bottomRowY = 514 + answeringContentDy;
  const bottomRowH = wide.h;
  const bottomRowCy = bottomRowY + bottomRowH / 2;
  const llmRerank = { x: hybrid.x, y: 590 + answeringContentDy, w: wide.w, h: wide.h };
  const llmRerankLeftCy = llmRerank.y + llmRerank.h / 2;
  const llmRerankTopCx = llmRerank.x + llmRerank.w / 2;
  const noteBoxY = 608 + answeringContentDy;
  const request = { x: requestColumnX, y: bottomRowY, w: requestColumnW, h: bottomRowH };
  const requestColumnCx = requestColumnX + requestColumnW / 2;
  const prompt = { w: standard.w, h: bottomRowH, x: 30, y: bottomRowY };
  const answer = { x: 788, y: bottomRowY, w: compact.w, h: bottomRowH };
  const promptRightX = prompt.x + prompt.w;
  const promptRightCy = prompt.y + prompt.h / 2;
  const promptTopCx = prompt.x + prompt.w / 2;
  const requestLeftX = request.x;
  const requestLeftCy = request.y + request.h / 2;
  const requestRightX = request.x + request.w;
  const answerLeftX = answer.x;

  return (
    <svg
      viewBox="0 0 920 740"
      className="pointer-events-none w-full max-w-4xl"
      role="img"
      aria-label="ChatPDF 建库与问答架构图"
    >
      <defs>
        <marker
          id="arrow-solid-green"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="#5a7a5a" />
        </marker>
        <marker
          id="arrow-dashed-blue"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill="#1f6c9f" />
        </marker>
      </defs>

      {/* 底层：分区背景、节点边框、连线 */}
      <g aria-hidden="true">
        <rect x={0} y={0} width={920} height={310} rx={12} fill="#edf3ec" />
        <rect x={0} y={answeringSectionY} width={920} height={answeringSectionH} rx={12} fill="#e1f3fe" />

        <NodeShape x={40} y={pipelineY} w={compact.w} h={pipelineH} />
        <NodeShape x={168} y={pipelineY} w={standard.w} h={pipelineH} stroke="#b8d4b8" />
        <NodeShape x={336} y={pipelineY} w={wide.w} h={pipelineH} stroke="#b8d4b8" />
        <NodeShape x={326} y={secondaryY} w={buildRoute.w} h={secondaryH} stroke="#9cb89c" />
        <NodeShape x={524} y={pipelineY} w={wide.w} h={pipelineH} stroke="#b8d4b8" />
        <NodeShape x={vectorStores.x} y={vectorStores.y} w={vectorStores.w} h={vectorStores.h} stroke="#346538" />
        <NodeShape x={chunkDebug.x} y={chunkDebug.y} w={chunkDebug.w} h={chunkDebug.h} stroke="#9cb89c" />

        <SolidArrowLine x1={140} y1={128} x2={168} y2={128} />
        <SolidArrowLine x1={298} y1={128} x2={336} y2={128} />
        <DashedArrowLine x1={411} y1={168} x2={411} y2={secondaryY} color="#346538" />
        <SolidArrowLine x1={486} y1={128} x2={524} y2={128} />
        <SolidArrowLine x1={674} y1={128} x2={vectorStores.x} y2={128} />
        <DashedArrowLine
          x1={storeColumnCx}
          y1={vectorStoresBottomY}
          x2={storeColumnCx}
          y2={secondaryY}
          color="#346538"
        />

        <NodeShape x={question.x} y={question.y} w={question.w} h={question.h} stroke="#a8cce0" />
        <NodeShape x={vectorStore.x} y={vectorStore.y} w={vectorStore.w} h={vectorStore.h} stroke="#a8cce0" />
        <NodeShape x={hybrid.x} y={hybrid.y} w={hybrid.w} h={hybrid.h} stroke="#a8cce0" />
        <NodeShape x={llmRerank.x} y={llmRerank.y} w={llmRerank.w} h={llmRerank.h} stroke="#8eb8d4" />
        <NodeShape x={topK.x} y={topK.y} w={topK.w} h={topK.h} stroke="#a8cce0" />
        <NodeShape x={prompt.x} y={prompt.y} w={prompt.w} h={prompt.h} stroke="#a8cce0" />
        <NodeShape x={request.x} y={request.y} w={request.w} h={request.h} stroke="#1f6c9f" />
        <NodeShape x={answer.x} y={answer.y} w={answer.w} h={answer.h} stroke="#1f6c9f" />

        <DashedArrowLine
          x1={questionRightX}
          y1={questionRightCy}
          x2={storeColumnCx}
          y2={vectorStoresBottomY}
        />
        <SolidArrowLine x1={questionRightX} y1={questionRightCy} x2={vectorStoreLeftX} y2={answeringRowCy} />
        <SolidArrowLine x1={vectorStoreRightX} y1={answeringRowCy} x2={hybridLeftX} y2={answeringRowCy} />
        <DashedArrowLine
          x1={questionBottomCy}
          y1={questionBottomY}
          x2={llmRerank.x}
          y2={llmRerankLeftCy}
        />
        <SolidArrowLine x1={hybridBottomCy} y1={hybridBottomY} x2={llmRerankTopCx} y2={llmRerank.y} />
        <SolidArrowLine x1={hybridRightX} y1={answeringRowCy} x2={topKLeftX} y2={answeringRowCy} />
        <DashedArrowLine x1={questionBottomCy} y1={questionBottomY} x2={promptTopCx} y2={prompt.y} />
        <SolidArrowLine
          x1={promptRightX}
          y1={promptRightCy}
          x2={requestLeftX}
          y2={requestLeftCy}
        />
        <SolidArrowLine x1={requestColumnCx} y1={topKBottomY} x2={requestColumnCx} y2={bottomRowY} />
        <DashedArrowLine x1={questionRightX} y1={questionRightCy} x2={requestLeftX} y2={requestLeftCy} />
        <SolidArrowLine x1={requestRightX} y1={requestLeftCy} x2={answerLeftX} y2={bottomRowCy} />
      </g>

      {/* 顶层：所有文字标签（置于连线之上） */}
      <g>
        <DiagramLabel x={24} y={34} anchor="start" className="fill-[#346538] text-[15px] font-semibold">
          Ingestion · 建库
        </DiagramLabel>
        <DiagramLabel x={24} y={54} anchor="start" outlined={false} className="fill-[#787774] text-[11px]">
          web/backend/rag_service · build_vector_store
        </DiagramLabel>

        <NodeText x={40} y={pipelineY} w={compact.w} h={pipelineH} title="PDF" subtitle="本地文件夹" />
        <DiagramLabel x={149} y={118} className="fill-[#346538] text-[10px]">
          PDF Parsing
        </DiagramLabel>
        <NodeText
          x={168}
          y={pipelineY}
          w={standard.w}
          h={pipelineH}
          title="MinerU 云端"
          subtitle="mineru_pdf.py"
        />
        <DiagramLabel x={317} y={118} className="fill-[#346538] text-[10px]">
          清洗 + 切块
        </DiagramLabel>
        <NodeText
          x={336}
          y={pipelineY}
          w={wide.w}
          h={pipelineH}
          title="Text Chunking"
          subtitle="text_splitter.py"
        />
        <NodeText
          x={326}
          y={secondaryY}
          w={buildRoute.w}
          h={secondaryH}
          title="Build Route（二选一）"
          subtitle="per_page 按页 · full_text 全书"
        />
        <NodeText
          x={524}
          y={pipelineY}
          w={wide.w}
          h={pipelineH}
          title="Embedding"
          subtitle="DashScope → FAISS"
        />
        <NodeText
          x={vectorStores.x}
          y={vectorStores.y}
          w={vectorStores.w}
          h={vectorStores.h}
          title="Vector Stores"
          subtitle="FAISS + bm25.pkl"
        />
        <NodeText
          x={chunkDebug.x}
          y={chunkDebug.y}
          w={chunkDebug.w}
          h={chunkDebug.h}
          title="chunk_debug/"
          subtitle="可选 · 按 PDF 的 .md"
        />

        <DiagramLabel x={24} y={answeringTitleY} anchor="start" className="fill-[#1f6c9f] text-[15px] font-semibold">
          Answering · 问答
        </DiagramLabel>
        <DiagramLabel x={24} y={answeringSubtitleY} anchor="start" outlined={false} className="fill-[#787774] text-[11px]">
          web/backend/rag_service · iter_ask_question
        </DiagramLabel>

        <NodeText
          x={question.x}
          y={question.y}
          w={question.w}
          h={question.h}
          title="Question"
          subtitle="用户提问"
        />
        <DiagramLabel
          x={(questionRightX + storeColumnCx) / 2}
          y={(questionRightCy + vectorStoresBottomY) / 2 - 6}
          className="fill-[#1f6c9f] text-[10px]"
        >
          Routing · 选择向量库
        </DiagramLabel>

        <NodeText
          x={vectorStore.x}
          y={vectorStore.y}
          w={vectorStore.w}
          h={vectorStore.h}
          title="Vector Store"
          subtitle="vector_store_id"
        />
        <DiagramLabel
          x={(vectorStoreRightX + hybridLeftX) / 2}
          y={answeringRowCy - 10}
          className="fill-[#346538] text-[10px]"
        >
          Hybrid Retrieval
        </DiagramLabel>
        <NodeText
          x={hybrid.x}
          y={hybrid.y}
          w={hybrid.w}
          h={hybrid.h}
          title="混合检索"
          subtitle="hybrid_retriever.py · 向量+BM25 RRF"
        />
        <DiagramLabel
          x={(questionBottomCy + llmRerank.x) / 2}
          y={(questionBottomY + llmRerankLeftCy) / 2 - 6}
          className="fill-[#1f6c9f] text-[10px]"
        >
          可选 · LLM Rerank
        </DiagramLabel>
        <NodeText
          x={llmRerank.x}
          y={llmRerank.y}
          w={llmRerank.w}
          h={llmRerank.h}
          title="LLM 重排"
          subtitle="llm_reranker.py · rerank_model"
        />
        <DiagramLabel x={(hybridRightX + topKLeftX) / 2} y={answeringRowCy - 10} className="fill-[#346538] text-[10px]">
          Relevant Context
        </DiagramLabel>
        <NodeText
          x={topK.x}
          y={topK.y}
          w={topK.w}
          h={topK.h}
          title="Top-K Chunks"
          subtitle="含页码 / 相似度"
        />

        <NodeText
          x={prompt.x}
          y={prompt.y}
          w={prompt.w}
          h={prompt.h}
          vPad={10}
          subtitleSize={10}
          title="Prompt 预设"
          subtitle={"default/strict\nconcise/detailed"}
        />
        <DiagramLabel
          x={(promptRightX + requestLeftX) / 2}
          y={promptRightCy - 10}
          className="fill-[#346538] text-[10px]"
        >
          Routing · Prompt
        </DiagramLabel>
        <DiagramLabel
          x={(questionRightX + requestLeftX) / 2}
          y={(questionRightCy + requestLeftCy) / 2 - 6}
          className="fill-[#1f6c9f] text-[10px]"
        >
          Prompt Template
        </DiagramLabel>
        <NodeText
          x={request.x}
          y={request.y}
          w={request.w}
          h={request.h}
          subtitleSize={10}
          title="Request"
          subtitle="load_qa_chain · Question · Model · Temperature"
        />
        <NodeText
          x={answer.x}
          y={answer.y}
          w={answer.w}
          h={answer.h}
          title="Answer"
          subtitle="来源 + 历史"
        />
        <NoteBoxText
          x={620}
          y={noteBoxY}
          w={268}
          h={80}
          title="前端可选项（ChatPanel）"
          subtitle="Top-K · Temperature · Model · LLM Rerank · Rerank Model · Prompt 预设"
        />
      </g>
    </svg>
  );
}

function ModuleItem({ name, desc }: { name: string; desc: string }) {
  return (
    <div className="flex flex-col items-start">
      <dt className="m-0 inline-block rounded border border-[#eaeaea] px-2 py-0.5 font-medium text-[#111111]">
        {name}
      </dt>
      <dd className="m-0 mt-1.5 pl-2 text-[90%] leading-relaxed text-[#787774]">
        {desc}
      </dd>
    </div>
  );
}

export default function ProjectStructurePanel({
  embedded = false,
  onClose,
}: ProjectStructurePanelProps) {
  return (
    <div className={embedded ? "" : "relative min-h-screen bg-[#f7f6f3] px-6 py-16"}>
      {!embedded && onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 rounded-md border border-[#eaeaea] bg-white px-4 py-2 text-sm text-[#3c4043] transition-colors hover:border-[#111111]"
        >
          返回首页
        </button>
      )}

      <article className="mx-auto w-full max-w-4xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[#111111]">
          项目结构
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#787774]">
          整体分为建库（Ingestion）与问答（Answering）两大分区
        </p>

        <div className="mt-8 space-y-0">
          <h2 className="text-base font-medium text-[#111111]">架构图</h2>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
            <span className="inline-flex items-center gap-2 text-xs text-[#787774]">
              <span className="inline-block h-0 w-8 border-t-2 border-[#5a7a5a]" />
              主流程
            </span>
            <span className="inline-flex items-center gap-2 text-xs text-[#787774]">
              <span className="inline-block h-0 w-8 border-t-2 border-dashed border-[#1f6c9f]" />
              Routing / 可选
            </span>
            <span className="inline-flex items-center gap-2 text-xs text-[#787774]">
              <span className="inline-block h-[14.4px] w-6 rounded border-2 border-white bg-[#edf3ec] shadow-[0_0_0_1px_#dadce0]" />
              建库分区
            </span>
            <span className="inline-flex items-center gap-2 text-xs text-[#787774]">
              <span className="inline-block h-[14.4px] w-6 rounded border-2 border-white bg-[#e1f3fe] shadow-[0_0_0_1px_#dadce0]" />
              问答分区
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#eaeaea] bg-white px-6 py-4 sm:py-6">
            <ArchitectureDiagram />
          </div>

          <h2 className="my-5 text-base font-medium text-[#111111]">主要模块</h2>
          <section className="rounded-xl border border-[#eaeaea] bg-white px-6 py-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <ModuleItem
                name="api.py"
                desc="HTTP 接口层：向量库建库/追加/删除、SSE 流式建库与问答、对话历史、chunk 调试浏览"
              />
              <ModuleItem
                name="rag_service.py"
                desc="建库与问答编排：DashScope Embedding、FAISS/BM25 持久化、load_qa_chain"
              />
              <ModuleItem
                name="mineru_pdf.py"
                desc="MinerU 云端 PDF 解析，输出含 HTML 表格的结构化 Markdown 文本"
              />
              <ModuleItem
                name="text_splitter.py"
                desc="文本切块：per_page 逐物理页、页内按 token 切分且不跨页；full_text 全书按字符切分"
              />
              <ModuleItem
                name="hybrid_retriever.py"
                desc="混合检索：FAISS 向量 Top-K + BM25 Top-K，RRF 融合排序并返回相似度"
              />
              <ModuleItem
                name="llm_reranker.py"
                desc="可选 LLM 重排：对候选 chunk 打相关度分，与混合检索分加权融合"
              />
              <ModuleItem
                name="prompt/ + prompt_config.py"
                desc="qa.yml 与 rerank.yml 管理问答/重排模板；后端启动时统一加载并校验占位符"
              />
              <ModuleItem
                name="chunk_debug.py"
                desc="可选建库调试：按 PDF 导出 chunks .md，支持按向量库浏览与清理"
              />
            </dl>
          </section>
        </div>
      </article>
    </div>
  );
}
