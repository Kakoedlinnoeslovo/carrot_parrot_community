import type { WorkflowGraph } from "@/lib/workflow-graph";

export type GraphMediaHint = {
  url: string;
  kind: "image" | "video" | "audio" | "unknown";
  source: string;
};

function guessKindFromUrl(url: string): GraphMediaHint["kind"] {
  const u = url.split("?")[0]?.toLowerCase() ?? "";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/.test(u)) return "video";
  if (/\.(mp3|wav|m4a|aac|ogg)(\?|$)/.test(u)) return "audio";
  if (/\.(png|jpe?g|webp|gif)(\?|$)/.test(u)) return "image";
  return "unknown";
}

function addHttpsString(
  out: GraphMediaHint[],
  seen: Set<string>,
  value: string,
  source: string,
) {
  const v = value.trim();
  if (!/^https?:\/\//i.test(v)) return;
  if (seen.has(v)) return;
  seen.add(v);
  out.push({ url: v, kind: guessKindFromUrl(v), source });
}

/** Recursively collect https URLs from saved falInput only (shallow object/array walk). */
function collectFromFalInputObject(
  value: unknown,
  out: GraphMediaHint[],
  seen: Set<string>,
  depth: number,
  path: string,
) {
  if (depth > 8) return;
  if (value == null) return;
  if (typeof value === "string") {
    addHttpsString(out, seen, value, `falInput.${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) =>
      collectFromFalInputObject(item, out, seen, depth + 1, `${path}[${i}]`),
    );
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = path ? `${path}.${k}` : k;
      collectFromFalInputObject(v, out, seen, depth + 1, next);
    }
  }
}

/**
 * Deduped media URLs implied by the saved workflow graph (inputs and static fal fields only).
 */
export function extractGraphMediaHints(graph: WorkflowGraph): GraphMediaHint[] {
  const seen = new Set<string>();
  const out: GraphMediaHint[] = [];

  for (const n of graph.nodes) {
    if (n.type === "input_image") {
      const url = n.data.imageUrl?.trim() ?? "";
      if (url.startsWith("http") || url.startsWith("data:image")) {
        if (url.startsWith("data:")) {
          if (!seen.has(url)) {
            seen.add(url);
            out.push({ url, kind: "image", source: `node:${n.id}:input_image` });
          }
        } else {
          addHttpsString(out, seen, url, `node:${n.id}:input_image`);
        }
      }
    }
    if (n.type === "input_group") {
      for (const s of n.data.slots ?? []) {
        if (s.kind === "image" && s.value?.trim()) {
          addHttpsString(out, seen, s.value, `node:${n.id}:slot:${s.label || s.id}`);
        }
      }
    }
    if (n.type === "input_prompt") {
      /* text only — skip */
    }
    if (n.type === "fal_model") {
      collectFromFalInputObject(n.data.falInput, out, seen, 0, "");
    }
  }

  return out;
}
