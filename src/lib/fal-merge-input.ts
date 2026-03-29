import type { WorkflowEdge, WorkflowGraph, WorkflowNode } from "@/lib/workflow-graph";

/** Matches orchestrator Artifact shape used for merging. */
export type MergeArtifact = {
  text?: string;
  images: string[];
  media?: { url: string; kind: string }[];
};

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
  for (const k of Object.keys(out)) {
    if (out[k] === null || out[k] === undefined) {
      delete out[k];
    }
  }
  // Omit empty strings so queue APIs apply JSON Schema defaults (e.g. Kling AI Avatar `prompt` defaults to ".").
  for (const k of Object.keys(out)) {
    if (typeof out[k] === "string" && out[k].trim() === "") {
      delete out[k];
    }
  }
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
  return typeof h === "string" && h.trim() !== "" && h !== "in";
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
    if (isMisleadingQueueOutputHandle(sh)) {
      const texts = art.text ? [art.text] : [];
      const urls = [...art.images, ...(art.media?.map((m) => m.url) ?? [])];
      return { texts, urls: [...new Set(urls)] };
    }
    /** Single UI port `out` (and OpenAPI output keys): full artifact — text plus media URLs. */
    const texts = art.text ? [art.text] : [];
    const urls = [...art.images, ...(art.media?.map((m) => m.url) ?? [])];
    return { texts, urls: [...new Set(urls)] };
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
  urlArrayKeysWired: Set<string>,
): void {
  const texts = signal.texts;
  const urls = signal.urls;

  if (keyExpectsUrlArray(key)) {
    if (!urls.length) return;
    if (!urlArrayKeysWired.has(key)) {
      input[key] = urls;
      urlArrayKeysWired.add(key);
    } else {
      const prev = Array.isArray(input[key])
        ? (input[key] as unknown[]).filter((u): u is string => typeof u === "string" && u.trim() !== "")
        : [];
      input[key] = [...prev, ...urls];
    }
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
 * Merge static falInput with upstream nodes. Each wire must target a real API field
 * (e.g. `prompt`, `image_url`); there is no legacy `in` bucket.
 */
export function mergeFalInput(
  node: Extract<WorkflowNode, { type: "fal_model" }>,
  graph: WorkflowGraph,
  artifacts: Record<string, MergeArtifact | undefined>,
): Record<string, unknown> {
  const input: Record<string, unknown> = { ...(node.data.falInput ?? {}) };
  const endpointId = node.data.falModelId;

  const edges = incomingEdges(graph, node.id);
  const explicit = edges.filter((e) => isExplicitTargetHandle(e.targetHandle ?? null));
  const urlArrayKeysWired = new Set<string>();

  for (const e of explicit) {
    const key = e.targetHandle as string;
    const signal = resolveUpstream(e, graph, artifacts);
    assignExplicitTarget(endpointId, input, key, signal, urlArrayKeysWired);
  }

  const texts = explicit
    .flatMap((e) => resolveUpstream(e, graph, artifacts).texts)
    .filter((t): t is string => Boolean(t));
  applyWorkflowInputAliases(endpointId, input, texts);

  return input;
}
