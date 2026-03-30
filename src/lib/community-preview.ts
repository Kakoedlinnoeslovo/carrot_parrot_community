import { extractGraphMediaHints } from "@/lib/graph-media-hints";
import type { WorkflowGraph } from "@/lib/workflow-graph";
import { safeParseWorkflowGraph } from "@/lib/workflow-graph";

export type CommunityPreview =
  | { type: "media"; url: string; kind: "image" | "video" }
  | { type: "placeholder" };

function guessKindFromUrl(url: string): "image" | "video" {
  const u = url.split("?")[0]?.toLowerCase() ?? "";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/.test(u)) return "video";
  return "image";
}

/** Media preview from an already-validated graph (no cover). */
export function communityPreviewFromParsedGraph(graph: WorkflowGraph): CommunityPreview {
  const hints = extractGraphMediaHints(graph);
  for (const h of hints) {
    if (h.url.startsWith("data:")) continue;
    if (h.kind === "video" || h.kind === "image") {
      return {
        type: "media",
        url: h.url,
        kind: h.kind === "video" ? "video" : "image",
      };
    }
  }
  for (const h of hints) {
    if (h.url.startsWith("data:")) continue;
    if (/^https?:\/\//i.test(h.url)) {
      return { type: "media", url: h.url, kind: guessKindFromUrl(h.url) };
    }
  }
  return { type: "placeholder" };
}

/** Thumbnail for community cards: cover URL, then graph media hints, else placeholder. */
export function communityPreviewFromWorkflow(
  coverImageUrl: string | null | undefined,
  graphJson: string,
  coverPreviewKind?: string | null,
): CommunityPreview {
  const cover = coverImageUrl?.trim();
  if (cover && /^https?:\/\//i.test(cover)) {
    if (coverPreviewKind === "video" || coverPreviewKind === "image") {
      return { type: "media", url: cover, kind: coverPreviewKind };
    }
    return { type: "media", url: cover, kind: guessKindFromUrl(cover) };
  }

  const parsed = safeParseWorkflowGraph(graphJson);
  if (!parsed.success) {
    return { type: "placeholder" };
  }

  return communityPreviewFromParsedGraph(parsed.data);
}
