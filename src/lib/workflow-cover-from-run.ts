import type { MediaItem } from "@/lib/artifact-json";
import { parseArtifactJson } from "@/lib/artifact-json";

function guessKindFromUrl(url: string): MediaItem["kind"] {
  const u = url.split("?")[0]?.toLowerCase() ?? "";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/.test(u)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg)(\?|$)/.test(u)) return "audio";
  if (/\.(png|jpe?g|webp|gif)(\?|$)/.test(u)) return "image";
  return "unknown";
}

export type WorkflowCoverPick = { url: string; kind: "image" | "video" };

/**
 * Best community-card cover from run steps (chronological): last video, else last image.
 * Only https URLs (skips data: and non-http).
 */
export function pickWorkflowCoverFromRunSteps(
  steps: { outputsJson: string | null; createdAt: Date }[],
): WorkflowCoverPick | null {
  const ordered = [...steps].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const items: { url: string; kind: MediaItem["kind"] }[] = [];
  for (const s of ordered) {
    const a = parseArtifactJson(s.outputsJson);
    for (const url of a.images) {
      if (typeof url === "string" && /^https?:\/\//i.test(url)) {
        items.push({ url, kind: guessKindFromUrl(url) });
      }
    }
    for (const m of a.media ?? []) {
      if (m?.url && /^https?:\/\//i.test(m.url)) {
        items.push({ url: m.url, kind: m.kind });
      }
    }
  }
  const videos = items.filter((i) => i.kind === "video");
  if (videos.length > 0) {
    const last = videos[videos.length - 1]!;
    return { url: last.url, kind: "video" };
  }
  const images = items.filter((i) => i.kind === "image" || i.kind === "unknown");
  if (images.length > 0) {
    const last = images[images.length - 1]!;
    return { url: last.url, kind: "image" };
  }
  return null;
}
