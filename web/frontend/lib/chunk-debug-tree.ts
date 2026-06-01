import type { ChunkDebugNode } from "@/lib/api";

/** 与后端 chunk_debug._pdf_debug_md_basename 规则一致 */
export function pdfFileNameToDebugBasename(pdfPath: string): string {
  const name = pdfPath.split(/[/\\]/).pop() ?? "";
  const stem = name.replace(/\.pdf$/i, "") || "document";
  const safe = stem.replace(/[^\w\u4e00-\u9fff-]+/g, "_").replace(/^_|_$/g, "");
  const base = safe || "document";
  return base.slice(0, 80);
}

/** 向量库 chunk debug 默认打开的 Markdown（首个 PDF 对应文件） */
export function getStoreDebugFilePath(
  storeId: string,
  pdfFiles?: string[]
): string {
  if (pdfFiles?.length) {
    return `${storeId}/${pdfFileNameToDebugBasename(pdfFiles[0])}.md`;
  }
  return `${storeId}/all_chunks.md`;
}

/** 从目录树中取第一个文件路径。 */
export function collectFirstDebugFile(
  nodes: ChunkDebugNode[]
): string | null {
  for (const node of nodes) {
    if (node.type === "file") {
      return node.path;
    }
    if (node.children?.length) {
      const nested = collectFirstDebugFile(node.children);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

/** 收集所有目录路径，用于默认展开。 */
export function collectDebugDirPaths(nodes: ChunkDebugNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === "dir") {
      paths.push(node.path);
      if (node.children?.length) {
        paths.push(...collectDebugDirPaths(node.children));
      }
    }
  }
  return paths;
}
