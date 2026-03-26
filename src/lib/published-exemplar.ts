import type { MediaItem } from "@/lib/artifact-json";
import { parseArtifactJson } from "@/lib/artifact-json";

export type PublishedPreviewItem = { url: string; kind: MediaItem["kind"] };

function guessKindFromUrl(url: string): MediaItem["kind"] {
  const u = url.split("?")[0]?.toLowerCase() ?? "";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/.test(u)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg)(\?|$)/.test(u)) return "audio";
  if (/\.(png|jpe?g|webp|gif)(\?|$)/.test(u)) return "image";
  return "unknown";
}

/** Per-node artifacts for wiring output_preview nodes on the published canvas. */
export function buildExemplarPreviewByNodeId(
  steps: { nodeId: string; outputsJson: string | null }[],
): Record<string, PublishedPreviewItem[]> {
  const out: Record<string, PublishedPreviewItem[]> = {};
  for (const s of steps) {
    const a = parseArtifactJson(s.outputsJson);
    const items: PublishedPreviewItem[] = [];
    for (const url of a.images) {
      if (typeof url === "string" && url.startsWith("http")) {
        items.push({ url, kind: guessKindFromUrl(url) });
      }
    }
    for (const m of a.media ?? []) {
      if (m?.url?.startsWith("http")) {
        items.push({ url: m.url, kind: m.kind });
      }
    }
    if (items.length) out[s.nodeId] = items;
  }
  return out;
}

export type PublishedExemplarRow = { url: string; kind: MediaItem["kind"]; label: string };

/** Flattened deduped gallery rows from a succeeded run (owner exemplar). */
export function flattenExemplarGallery(
  steps: { nodeId: string; outputsJson: string | null }[],
): PublishedExemplarRow[] {
  const seen = new Set<string>();
  const rows: PublishedExemplarRow[] = [];
  for (const s of steps) {
    const a = parseArtifactJson(s.outputsJson);
    const label = `${s.nodeId.slice(0, 8)}…`;
    for (const url of a.images) {
      if (typeof url !== "string" || !url.startsWith("http") || seen.has(url)) continue;
      seen.add(url);
      rows.push({ url, kind: guessKindFromUrl(url), label });
    }
    for (const m of a.media ?? []) {
      if (!m?.url?.startsWith("http") || seen.has(m.url)) continue;
      seen.add(m.url);
      rows.push({ url: m.url, kind: m.kind, label });
    }
  }
  return rows;
}
