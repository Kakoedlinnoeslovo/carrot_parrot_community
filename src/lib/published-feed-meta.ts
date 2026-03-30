import {
  communityPreviewFromParsedGraph,
  type CommunityPreview,
} from "@/lib/community-preview";
import { extractFalModelsUsed, type FalModelUsedRow } from "@/lib/graph-models-used";
import type { WorkflowGraph } from "@/lib/workflow-graph";
import { safeParseWorkflowGraph } from "@/lib/workflow-graph";

export type PublishedFeedMetaV1 = {
  v: 1;
  falModels: FalModelUsedRow[];
  graphPreview?: { url: string; kind: "image" | "video" };
};

function graphPreviewForMeta(graph: WorkflowGraph): { url: string; kind: "image" | "video" } | null {
  const p = communityPreviewFromParsedGraph(graph);
  if (p.type !== "media") return null;
  return { url: p.url, kind: p.kind };
}

/** Serialize denormalized feed fields for `Workflow.publishedFeedMetaJson`. */
export function buildPublishedFeedMetaJsonFromGraph(graph: WorkflowGraph): string {
  const falModels = extractFalModelsUsed(graph);
  const gp = graphPreviewForMeta(graph);
  const meta: PublishedFeedMetaV1 = {
    v: 1,
    falModels,
    ...(gp ? { graphPreview: gp } : {}),
  };
  return JSON.stringify(meta);
}

export function buildPublishedFeedMetaJsonFromGraphJson(graphJson: string): string | null {
  const parsed = safeParseWorkflowGraph(graphJson);
  if (!parsed.success) return null;
  return buildPublishedFeedMetaJsonFromGraph(parsed.data);
}

export function parsePublishedFeedMeta(
  raw: string | null | undefined,
): PublishedFeedMetaV1 | null {
  if (raw == null || raw.trim() === "") return null;
  try {
    const o = JSON.parse(raw) as unknown;
    if (typeof o !== "object" || o === null) return null;
    const v = (o as { v?: unknown }).v;
    if (v !== 1) return null;
    const falModels = (o as { falModels?: unknown }).falModels;
    if (!Array.isArray(falModels)) return null;
    const models: FalModelUsedRow[] = [];
    for (const row of falModels) {
      if (typeof row !== "object" || row === null) continue;
      const id = (row as { id?: unknown }).id;
      const count = (row as { count?: unknown }).count;
      if (typeof id !== "string" || typeof count !== "number") continue;
      models.push({ id, count });
    }
    const gp = (o as { graphPreview?: unknown }).graphPreview;
    let graphPreview: PublishedFeedMetaV1["graphPreview"];
    if (
      gp != null &&
      typeof gp === "object" &&
      typeof (gp as { url?: unknown }).url === "string" &&
      ((gp as { kind?: unknown }).kind === "image" || (gp as { kind?: unknown }).kind === "video")
    ) {
      graphPreview = {
        url: (gp as { url: string }).url,
        kind: (gp as { kind: "image" | "video" }).kind,
      };
    }
    return { v: 1, falModels: models, ...(graphPreview ? { graphPreview } : {}) };
  } catch {
    return null;
  }
}

export type CommunityFeedCardPayload = {
  preview: CommunityPreview;
  modelsUsed: FalModelUsedRow[];
};

/**
 * One logical path for community cards: prefers denormalized meta; otherwise parses `graphJson` at most once.
 */
export function communityFeedCardFromWorkflowRow(args: {
  coverImageUrl: string | null | undefined;
  coverPreviewKind: string | null | undefined;
  graphJson: string;
  publishedFeedMetaJson: string | null | undefined;
}): CommunityFeedCardPayload {
  const meta = parsePublishedFeedMeta(args.publishedFeedMetaJson);
  const cover = args.coverImageUrl?.trim();
  if (cover && /^https?:\/\//i.test(cover)) {
    let preview: CommunityPreview;
    if (args.coverPreviewKind === "video" || args.coverPreviewKind === "image") {
      preview = { type: "media", url: cover, kind: args.coverPreviewKind };
    } else {
      const u = cover.split("?")[0]?.toLowerCase() ?? "";
      const kind = /\.(mp4|webm|mov|m4v)(\?|$)/.test(u) ? "video" : "image";
      preview = { type: "media", url: cover, kind };
    }
    const modelsUsed = meta?.falModels?.length ? meta.falModels : modelsFromGraphJson(args.graphJson);
    return { preview, modelsUsed };
  }

  if (
    meta?.graphPreview?.url &&
    meta.falModels?.length &&
    (meta.graphPreview.kind === "image" || meta.graphPreview.kind === "video")
  ) {
    return {
      preview: {
        type: "media",
        url: meta.graphPreview.url,
        kind: meta.graphPreview.kind,
      },
      modelsUsed: meta.falModels,
    };
  }

  const parsed = safeParseWorkflowGraph(args.graphJson);
  if (!parsed.success) {
    return { preview: { type: "placeholder" }, modelsUsed: [] };
  }
  const g = parsed.data;
  return {
    preview: communityPreviewFromParsedGraph(g),
    modelsUsed: meta?.falModels?.length ? meta.falModels : extractFalModelsUsed(g),
  };
}

function modelsFromGraphJson(graphJson: string): FalModelUsedRow[] {
  const parsed = safeParseWorkflowGraph(graphJson);
  if (!parsed.success) return [];
  return extractFalModelsUsed(parsed.data);
}
