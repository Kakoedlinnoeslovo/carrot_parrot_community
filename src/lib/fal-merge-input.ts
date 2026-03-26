import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/lib/workflow-graph";

/** Matches orchestrator Artifact shape used for merging. */
export type MergeArtifact = {
  text?: string;
  images: string[];
  media?: { url: string; kind: string }[];
};

/**
 * Edit-style endpoints (nano-banana, gemini …/edit) take `image_urls: string[]`.
 * Many img2img models (e.g. FLUX) take `image_url` only — sending `image_urls` too can 422.
 */
export function falEndpointUsesImageUrlsArray(endpointId: string): boolean {
  if (endpointId.startsWith("workflows/")) return true;
  const e = endpointId.toLowerCase();
  if (e.includes("nano-banana")) return true;
  if (e.includes("nano-boron")) return true;
  if (e.includes("gemini") && e.includes("/edit")) return true;
  return false;
}

function imageUrlsFieldEmpty(input: Record<string, unknown>): boolean {
  const existingUrls = input.image_urls;
  return (
    !Array.isArray(existingUrls) ||
    existingUrls.length === 0 ||
    existingUrls.every((u) => u == null || String(u).trim() === "")
  );
}

/** Map upstream prompts into workflow-specific fields (e.g. weather template). */
export function applyWorkflowInputAliases(
  endpointId: string,
  input: Record<string, unknown>,
  texts: string[],
): void {
  if (!endpointId.startsWith("workflows/")) return;
  const joined = texts.join("\n");
  if (endpointId.includes("template/weather")) {
    const w = input.weather;
    if (w == null || (typeof w === "string" && w.trim() === "")) {
      if (joined) input.weather = joined;
    }
  }
}

export function sanitizeFalInput(input: Record<string, unknown>): Record<string, unknown> {
  const out = { ...input };
  const urls = out.image_urls;
  if (Array.isArray(urls)) {
    const filtered = urls.filter((u) => typeof u === "string" && u.trim() !== "");
    if (filtered.length === 0) {
      delete out.image_urls;
    } else {
      out.image_urls = filtered;
    }
  }
  if (typeof out.image_url === "string" && out.image_url.trim() === "") {
    delete out.image_url;
  }
  return out;
}

type UpstreamSignal = { texts: string[]; urls: string[] };

function isMisleadingQueueOutputHandle(sh: string): boolean {
  return /^(status|request_id|response_url|status_url|cancel_url|queue_position|logs)$/.test(sh);
}

function incomingEdges(graph: WorkflowGraph, nodeId: string): WorkflowEdge[] {
  return graph.edges.filter((e) => e.target === nodeId);
}

function isExplicitTargetHandle(h: string | null | undefined): boolean {
  return Boolean(h && h !== "in");
}

function resolveUpstream(
  edge: WorkflowEdge,
  graph: WorkflowGraph,
  artifacts: Record<string, MergeArtifact | undefined>,
): UpstreamSignal {
  const sourceNode = graph.nodes.find((n) => n.id === edge.source);
  if (!sourceNode) return { texts: [], urls: [] };

  if (sourceNode.type === "input_group") {
    const slots = sourceNode.data.slots ?? [];
    const slot = slots.find((s) => s.id === edge.sourceHandle);
    if (!slot) return { texts: [], urls: [] };
    if (slot.kind === "text") {
      const t = (slot.value ?? "").trim();
      return { texts: t ? [t] : [], urls: [] };
    }
    const raw = (slot.value ?? "").trim();
    const ok = /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw);
    return { texts: [], urls: ok && raw ? [raw] : [] };
  }

  if (sourceNode.type === "input_prompt") {
    const t = (sourceNode.data.prompt ?? "").trim();
    return { texts: t ? [t] : [], urls: [] };
  }

  if (sourceNode.type === "input_image") {
    const raw = (sourceNode.data.imageUrl ?? "").trim();
    const ok = /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw);
    return { texts: [], urls: ok && raw ? [raw] : [] };
  }

  if (sourceNode.type === "fal_model") {
    const art = artifacts[edge.source];
    if (!art) return { texts: [], urls: [] };
    const sh = edge.sourceHandle ?? "out";
    /** OpenAPI labels queue submit fields as "outputs"; we only have finished media in artifacts. */
    if (sh === "out" || sh === "" || isMisleadingQueueOutputHandle(sh)) {
      const texts = art.text ? [art.text] : [];
      const urls = [...art.images, ...(art.media?.map((m) => m.url) ?? [])];
      return { texts, urls: [...new Set(urls)] };
    }
    if (sh === "text") {
      return { texts: art.text ? [art.text] : [], urls: [] };
    }
    if (sh === "images") {
      const urls = [
        ...art.images,
        ...(art.media?.filter((m) => m.kind === "image" || m.kind === "unknown").map((m) => m.url) ?? []),
      ];
      return { texts: [], urls: [...new Set(urls)] };
    }
    if (sh === "media") {
      const urls = art.media?.map((m) => m.url) ?? art.images;
      return { texts: [], urls: [...new Set(urls)] };
    }
    if (sh === "video") {
      const urls = art.media?.filter((m) => m.kind === "video").map((m) => m.url) ?? [];
      return { texts: [], urls: urls };
    }
    if (sh === "audio") {
      const urls = art.media?.filter((m) => m.kind === "audio").map((m) => m.url) ?? [];
      return { texts: [], urls: urls };
    }
    return { texts: [], urls: art.images[0] ? [art.images[0]] : [] };
  }

  return { texts: [], urls: [] };
}

/** Heuristic: field wants an array of URL strings. */
function keyExpectsUrlArray(key: string): boolean {
  const k = key.toLowerCase();
  return k === "image_urls" || k.endsWith("_urls") || k.includes("image_urls");
}

function keyExpectsSingleUrl(key: string): boolean {
  const k = key.toLowerCase();
  return (
    k === "image_url" ||
    k.endsWith("_image") ||
    k.endsWith("_url") ||
    k.includes("mask_url") ||
    k.includes("video_url") ||
    k.includes("audio_url")
  );
}

function keyExpectsText(key: string): boolean {
  const k = key.toLowerCase();
  return /prompt|text|caption|instruction|system|negative|weather|description|query/.test(k);
}

function assignExplicitTarget(
  endpointId: string,
  input: Record<string, unknown>,
  key: string,
  signal: UpstreamSignal,
): void {
  const texts = signal.texts;
  const urls = signal.urls;

  if (keyExpectsUrlArray(key)) {
    if (urls.length) input[key] = urls;
    return;
  }
  if (keyExpectsSingleUrl(key)) {
    if (urls[0]) input[key] = urls[0];
    return;
  }
  if (keyExpectsText(key)) {
    const t = texts.join("\n");
    if (t) {
      if (typeof input[key] === "string" && String(input[key]).trim()) {
        input[key] = `${t}\n${input[key]}`;
      } else {
        input[key] = t;
      }
    }
    return;
  }
  // default: prefer text, else first URL, else array of urls
  if (texts.length) {
    input[key] = texts.join("\n");
  } else if (urls.length === 1) {
    input[key] = urls[0];
  } else if (urls.length > 1) {
    input[key] = urls;
  }
}

/**
 * Merge static falInput with upstream nodes. Respects edge targetHandle / sourceHandle when set;
 * edges to target handle `in` (or missing) use legacy prompt + image merge heuristics.
 */
export function mergeFalInput(
  node: Extract<WorkflowNode, { type: "fal_model" }>,
  graph: WorkflowGraph,
  artifacts: Record<string, MergeArtifact | undefined>,
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...(node.data.falInput ?? {}) };
  const endpointId = node.data.falModelId;
  const useImageUrlsArray = falEndpointUsesImageUrlsArray(endpointId);

  const edges = incomingEdges(graph, node.id);
  const explicit = edges.filter((e) => isExplicitTargetHandle(e.targetHandle ?? null));
  const legacy = edges.filter((e) => !isExplicitTargetHandle(e.targetHandle ?? null));

  for (const e of explicit) {
    const key = e.targetHandle as string;
    const signal = resolveUpstream(e, graph, artifacts);
    assignExplicitTarget(endpointId, input, key, signal);
  }

  const parentArtifacts = legacy.map((e) => artifacts[e.source]).filter((a): a is MergeArtifact => Boolean(a));

  const texts = parentArtifacts.map((a) => a.text).filter((t): t is string => Boolean(t));
  if (texts.length) {
    if (typeof input.prompt === "string") {
      input.prompt = [...texts, input.prompt].join("\n");
    } else if (input.prompt === undefined) {
      input.prompt = texts.join("\n");
    }
  }
  const parentUrls = parentArtifacts.flatMap((a) => {
    const fromMedia = a.media?.map((m) => m.url) ?? [];
    return [...a.images, ...fromMedia];
  });
  const uniqueParentUrls = [...new Set(parentUrls)];

  if (useImageUrlsArray) {
    if (uniqueParentUrls.length && imageUrlsFieldEmpty(input)) {
      input.image_urls = uniqueParentUrls;
    } else if (imageUrlsFieldEmpty(input)) {
      const single = input.image_url;
      if (typeof single === "string" && single.trim() !== "") {
        input.image_urls = [single];
      }
    }
    delete input.image_url;
  } else if (uniqueParentUrls.length) {
    const first = uniqueParentUrls[0];
    if (first) {
      const eid = endpointId.toLowerCase();
      const prefersStartImage =
        eid.includes("image-to-video") || eid.includes("kling-video") || eid.includes("kling");
      if (prefersStartImage) {
        if (input.start_image_url === undefined || String(input.start_image_url).trim() === "") {
          input.start_image_url = first;
        }
      } else if (input.image_url === undefined || input.image_url === "") {
        input.image_url = first;
      }
    }
  }

  applyWorkflowInputAliases(endpointId, input, texts);

  return input;
}
