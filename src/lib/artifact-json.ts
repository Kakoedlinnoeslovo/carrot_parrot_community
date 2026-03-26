import type { WorkflowStreamEventSummary } from "@/lib/fal-hosted-workflow";

export type MediaItem = { url: string; kind: "image" | "video" | "audio" | "unknown" };

export type Artifact = {
  text?: string;
  /** @deprecated use media; kept for upstream chaining */
  images: string[];
  media?: MediaItem[];
  /** fal `workflows/...` stream: summarized submit/completion/output/error events */
  workflowEvents?: WorkflowStreamEventSummary[];
};

export function parseArtifactJson(json: string | null | undefined): Artifact {
  if (!json) return { images: [] };
  try {
    const o = JSON.parse(json) as {
      text?: string;
      images?: string[];
      media?: MediaItem[];
      workflowEvents?: WorkflowStreamEventSummary[];
    };
    return {
      text: o.text,
      images: Array.isArray(o.images) ? o.images : [],
      media: Array.isArray(o.media) ? o.media : undefined,
      workflowEvents: Array.isArray(o.workflowEvents) ? o.workflowEvents : undefined,
    };
  } catch {
    return { images: [] };
  }
}
