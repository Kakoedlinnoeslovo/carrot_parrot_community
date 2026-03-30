"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { nanoid } from "nanoid";
import { graphToFlow, flowToGraph } from "@/lib/flow-adapter";
import {
  parseWorkflowClipboard,
  remapSingleNodePaste,
  serializeWorkflowClipboard,
} from "@/lib/workflow-clipboard";
import type { WorkflowGraph } from "@/lib/workflow-graph";
import { FAL_WORKFLOW_TEMPLATES } from "@/lib/fal-workflow-templates";
import { FalModelForm } from "@/components/fal-model-form";
import type { RJSFSchema } from "@rjsf/utils";
import { computePrimaryImageInputKey } from "@/lib/fal-openapi-wiring";
import { listMappableInputKeysFromSchema, listMappableOutputKeysFromSchema } from "@/lib/fal-schema-handles";
import { AnalyticsEvent, track } from "@/lib/analytics";
import { parseArtifactJson } from "@/lib/artifact-json";

/** True when the server rejected a request because no fal.ai key is configured for this user. */
function responseIndicatesMissingFalKey(status: number, errorText: string | undefined): boolean {
  if (status === 401) return true;
  const m = errorText ?? "";
  return /fal\.ai API key|Add your fal\.ai|No fal\.ai API key/i.test(m);
}

/** Single source port: full step artifact (optional caption text + media URLs). */
const FAL_OUTPUT_HANDLES = ["out"] as const;

/** Shared classes: larger grab area, hover affordance (visual size set per node + globals). */
const FLOW_HANDLE_BASE =
  "!pointer-events-auto !h-3.5 !w-3.5 !min-h-[14px] !min-w-[14px] !rounded-sm !border !border-white/25 !shadow-sm nodrag transition-[box-shadow,transform] duration-150 ease-out hover:z-10 hover:!scale-125 hover:!shadow-md hover:!ring-2 hover:!ring-white/35";

type InputSlot = { id: string; kind: "image" | "text"; label: string; value: string };

type WireKind = "image" | "text" | "any";

function inferSourceWireKind(
  nodes: Node[],
  source: string,
  sourceHandle: string | null | undefined,
): WireKind {
  const n = nodes.find((x) => x.id === source);
  if (!n) return "any";
  if (n.type === "input_image") return "image";
  if (n.type === "input_prompt") return "text";
  if (n.type === "review_gate") return "text";
  if (n.type === "input_group") {
    const slots = (n.data as { slots?: InputSlot[] }).slots ?? [];
    const slot = slots.find((s) => s.id === sourceHandle);
    if (slot) return slot.kind === "image" ? "image" : "text";
    return "any";
  }
  if (n.type === "input_video") return "image";
  if (n.type === "media_process") {
    const h = sourceHandle ?? "out";
    if (h === "out" || !String(h).trim()) {
      const op = (n.data as { operation?: string }).operation;
      if (op === "segment_scenes") return "text";
      if (op === "sync_barrier") return "any";
      return "image";
    }
    return "any";
  }
  if (n.type === "fal_model") {
    const h = sourceHandle ?? "";
    // `out` is the full step artifact (caption text and/or media URLs). Do not tag it as `image` or
    // isWorkflowConnectionValid blocks out → explicit `prompt` / text targets.
    if (
      h === "images" ||
      h === "image" ||
      /^(video|videos|audio|media|data)$/i.test(h)
    ) {
      return "image";
    }
    if (h === "text" || h === "prompt") return "text";
    return "any";
  }
  return "any";
}

/** What the target port expects for connection validation. */
function inferTargetWireExpectation(
  nodes: Node[],
  target: string,
  targetHandle: string | null | undefined,
): WireKind {
  const n = nodes.find((x) => x.id === target);
  if (!n) return "any";
  if (n.type === "media_process") {
    const h = targetHandle ?? "";
    if (/^(video_url|audio_url|image_urls)$/i.test(h)) return "image";
    if (h === "barrier_in") return "any";
    if (/^video_\d+$/i.test(h)) return "image";
    return "any";
  }
  if (n.type === "review_gate") {
    const h = targetHandle ?? "";
    if (h === "in") return "text";
    if (h === "barrier_in") return "any";
    return "any";
  }
  if (n.type === "output_preview") return "image";
  if (n.type !== "fal_model") return "any";
  const h = targetHandle ?? "";
  if (!h.trim()) return "any";

  const imageField =
    /^(image_url|image_urls|model_image|garment_image|mask_url|video_url|audio_url)$/i.test(h) ||
    /_image$/i.test(h) ||
    (h.includes("image") && !/prompt/i.test(h));

  if (imageField) return "image";

  if (/^(prompt|negative_prompt|text|system_prompt|category|mode)$/i.test(h)) return "text";

  return "any";
}

function isWorkflowConnectionValid(nodes: Node[], conn: Connection | Edge): boolean {
  const source = conn.source;
  const target = conn.target;
  if (source === target) return false;

  const tgtNode = nodes.find((x) => x.id === target);
  const th = conn.targetHandle ?? null;
  if (tgtNode?.type === "fal_model" && (!th || !String(th).trim())) {
    return false;
  }
  if (tgtNode?.type === "media_process" && (!th || !String(th).trim())) {
    return false;
  }
  if (tgtNode?.type === "review_gate" && (!th || !String(th).trim())) {
    return false;
  }

  const sh = conn.sourceHandle ?? null;

  const srcKind = inferSourceWireKind(nodes, source, sh);
  const want = inferTargetWireExpectation(nodes, target, th);
  if (want === "any" || srcKind === "any") return true;
  if (want === "image" && srcKind === "text") return false;
  if (want === "text" && srcKind === "image") return false;
  return true;
}

function InputPromptNode({ id, data }: NodeProps) {
  const d = data as { prompt?: string };
  return (
    <div className="min-w-[200px] rounded-lg border border-zinc-600 bg-zinc-900/90 px-3 py-2 pr-6 shadow-lg">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-emerald-400">Text</span>
        <span className="font-mono text-[10px] text-zinc-500">sourceHandle</span>
      </div>
      <div className="text-xs text-zinc-400">Node {id.slice(0, 8)}…</div>
      <p className="mt-1 line-clamp-3 text-sm text-zinc-200">{d.prompt || "—"}</p>
      <div className="relative mt-2 flex min-h-[22px] items-center justify-end gap-2">
        <span className="font-mono text-[10px] text-emerald-300">prompt</span>
        <Handle
          type="source"
          position={Position.Right}
          id="prompt"
          className={`${FLOW_HANDLE_BASE} !absolute !right-0 !top-1/2 !-translate-y-1/2 !border-emerald-500/35 !bg-emerald-500`}
          title='sourceHandle="prompt" — connect to the fal node’s left port named prompt'
        />
      </div>
    </div>
  );
}

function InputImageNode({ id, data }: NodeProps) {
  const d = data as { imageUrl?: string };
  const url = (d.imageUrl ?? "").trim();
  const showPreview = /^https?:\/\//i.test(url) || /^data:image\//i.test(url);
  return (
    <div className="min-w-[200px] max-w-[240px] rounded-lg border border-zinc-600 bg-zinc-900/90 px-3 py-2 pr-6 shadow-lg">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-emerald-400">Image</span>
        <span className="font-mono text-[10px] text-zinc-600">image</span>
      </div>
      <div className="text-xs text-zinc-400">Node {id.slice(0, 8)}…</div>
      {showPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="mt-2 max-h-28 w-full rounded border border-zinc-700 object-contain"
        />
      ) : (
        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{url || "No image URL"}</p>
      )}
      <div className="relative mt-2 flex min-h-[22px] items-center justify-end gap-2">
        <span className="font-mono text-[10px] text-emerald-300">image</span>
        <Handle
          type="source"
          position={Position.Right}
          id="image"
          className={`${FLOW_HANDLE_BASE} !absolute !right-0 !top-1/2 !-translate-y-1/2 !border-emerald-500/35 !bg-emerald-500`}
          title='sourceHandle="image" — wire to fal image_url / image_urls / model_image as needed'
        />
      </div>
    </div>
  );
}

function InputVideoNode({ id, data }: NodeProps) {
  const d = data as { videoUrl?: string };
  const url = (d.videoUrl ?? "").trim();
  const showPreview = /^https?:\/\//i.test(url);
  return (
    <div className="min-w-[200px] max-w-[260px] rounded-lg border border-cyan-600/50 bg-zinc-900/90 px-3 py-2 pr-6 shadow-lg">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-cyan-400">Video</span>
        <span className="font-mono text-[10px] text-zinc-600">video</span>
      </div>
      <div className="text-xs text-zinc-400">Node {id.slice(0, 8)}…</div>
      {showPreview ? (
        <video
          src={url}
          controls
          playsInline
          className="mt-2 max-h-36 w-full rounded border border-zinc-700 bg-black"
        />
      ) : (
        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{url || "No video URL"}</p>
      )}
      <div className="relative mt-2 flex min-h-[22px] items-center justify-end gap-2">
        <span className="font-mono text-[10px] text-cyan-300">video</span>
        <Handle
          type="source"
          position={Position.Right}
          id="video"
          className={`${FLOW_HANDLE_BASE} !absolute !right-0 !top-1/2 !-translate-y-1/2 !border-cyan-500/35 !bg-cyan-600`}
          title='sourceHandle="video" — wire to media_process video_url or fal video_url'
        />
      </div>
    </div>
  );
}

function ReviewGateNode({ id, data }: NodeProps) {
  const d = data as { text?: string; _runStepStatus?: string };
  const blocked = d._runStepStatus === "blocked";
  return (
    <div
      className={`min-w-[220px] max-w-[min(100vw,380px)] rounded-lg border px-3 py-2 pr-2 shadow-lg ${
        blocked
          ? "border-amber-500/60 bg-amber-950/40 ring-2 ring-amber-500/30"
          : "border-fuchsia-500/45 bg-zinc-900/90"
      }`}
    >
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-fuchsia-400">Review gate</div>
      <div className="text-[10px] text-zinc-500">Node {id.slice(0, 8)}…</div>
      {blocked ? (
        <p className="mt-1 text-[11px] text-amber-200/90">Run paused — edit caption in the sidebar, then Resume.</p>
      ) : (
        <p className="mt-1 line-clamp-3 text-[11px] text-zinc-400">{d.text?.trim() || "Caption (editable)"}</p>
      )}
      <div className="relative mt-3 min-h-[56px]">
        <Handle
          type="target"
          position={Position.Left}
          id="in"
          className={`${FLOW_HANDLE_BASE} !absolute !left-0 !top-[30%] !-translate-x-0 !-translate-y-1/2 !border-fuchsia-500/40 !bg-fuchsia-600`}
          title="Vision / caption input (text)"
        />
        <Handle
          type="target"
          position={Position.Left}
          id="barrier_in"
          className={`${FLOW_HANDLE_BASE} !absolute !left-0 !top-[70%] !-translate-x-0 !-translate-y-1/2 !border-zinc-500/40 !bg-zinc-600`}
          title="Sync barrier (all lanes ready)"
        />
        <div className="pointer-events-none flex h-full flex-col justify-between py-0.5 pl-4 text-[9px] text-zinc-500">
          <span className="font-mono">in</span>
          <span className="font-mono">barrier_in</span>
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className={`${FLOW_HANDLE_BASE} !absolute !right-0 !top-1/2 !-translate-y-1/2 !border-fuchsia-500/40 !bg-fuchsia-500`}
          title="Edited caption → downstream"
        />
        <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 font-mono text-[10px] text-fuchsia-300">
          out
        </span>
      </div>
    </div>
  );
}

const CONCAT_VIDEO_SLOT_COUNT = 8;

function MediaProcessNode({ id, data }: NodeProps) {
  const d = data as { operation?: string; previewItems?: RunOutputItem[] };
  const op = d.operation ?? "extract_audio";
  const items = d.previewItems ?? [];
  const imageItems = items.filter((x) => x.kind === "image" || x.kind === "unknown");
  const videoItem = items.find((x) => x.kind === "video");
  const audioItem = items.find((x) => x.kind === "audio");
  const isConcat = op === "concat_videos";
  return (
    <div className="min-w-[220px] max-w-[min(100vw,400px)] rounded-lg border border-teal-500/45 bg-zinc-900/90 px-3 py-2 pr-2 shadow-lg">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-teal-400">Media process</div>
      <div className="text-[10px] text-zinc-500">Node {id.slice(0, 8)}…</div>
      <p className="mt-1 font-mono text-xs text-teal-200/90">{op}</p>
      {imageItems.length > 0 ? (
        <div className="mt-2 space-y-1">
          <div className="max-h-48 overflow-y-auto rounded border border-zinc-800/90 bg-zinc-950/60 p-1.5">
            <div className="grid grid-cols-3 gap-1">
              {imageItems.map((it, i) => (
                <a
                  key={`${it.url}-${i}`}
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  className="relative aspect-video overflow-hidden rounded border border-zinc-700/90 bg-black/40 outline-none ring-teal-500/30 transition hover:ring-2"
                  title="Open full size"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          </div>
          <p className="text-[9px] leading-snug text-zinc-500">
            {imageItems.length} frame{imageItems.length === 1 ? "" : "s"} from last run. Change source video or{" "}
            <span className="font-mono text-zinc-400">fps</span> /{" "}
            <span className="font-mono text-zinc-400">maxFrames</span> in the sidebar, then re-run. To swap URLs
            manually, use an <span className="font-mono text-zinc-400">Input group</span> of images instead of{" "}
            <span className="font-mono text-zinc-400">extract_frames</span>.
          </p>
        </div>
      ) : videoItem ? (
        <div className="mt-2">
          <video
            src={videoItem.url}
            controls
            playsInline
            className="max-h-40 w-full rounded border border-zinc-700 bg-black"
          />
        </div>
      ) : audioItem ? (
        <div className="mt-2">
          <audio src={audioItem.url} controls className="w-full min-w-0" />
        </div>
      ) : null}
      <div
        className={`relative mt-3 ${isConcat ? "min-h-[200px]" : "min-h-[96px]"}`}
      >
        {!isConcat ? (
          <>
            <Handle
              type="target"
              position={Position.Left}
              id="video_url"
              className={`${FLOW_HANDLE_BASE} !absolute !left-0 !top-[14%] !-translate-x-0 !-translate-y-1/2 !border-teal-500/40 !bg-teal-600`}
              title="video_url"
            />
            <Handle
              type="target"
              position={Position.Left}
              id="image_urls"
              className={`${FLOW_HANDLE_BASE} !absolute !left-0 !top-[38%] !-translate-x-0 !-translate-y-1/2 !border-teal-500/40 !bg-teal-600`}
              title="image_urls — image sequence for images_to_video"
            />
            <Handle
              type="target"
              position={Position.Left}
              id="audio_url"
              className={`${FLOW_HANDLE_BASE} !absolute !left-0 !top-[62%] !-translate-x-0 !-translate-y-1/2 !border-teal-500/40 !bg-teal-600`}
              title="audio_url"
            />
            <Handle
              type="target"
              position={Position.Left}
              id="barrier_in"
              className={`${FLOW_HANDLE_BASE} !absolute !left-0 !top-[86%] !-translate-x-0 !-translate-y-1/2 !border-zinc-500/40 !bg-zinc-600`}
              title="barrier_in — ordering / sync"
            />
            <div className="pointer-events-none flex h-full flex-col justify-between py-0.5 pl-4 text-[9px] text-zinc-500">
              <span className="font-mono">video_url</span>
              <span className="font-mono">image_urls</span>
              <span className="font-mono">audio_url</span>
              <span className="font-mono">barrier_in</span>
            </div>
          </>
        ) : (
          <>
            {Array.from({ length: CONCAT_VIDEO_SLOT_COUNT }, (_, i) => {
              const pct = ((i + 0.5) / CONCAT_VIDEO_SLOT_COUNT) * 100;
              return (
                <Handle
                  key={`video_${i}`}
                  type="target"
                  position={Position.Left}
                  id={`video_${i}`}
                  className={`${FLOW_HANDLE_BASE} !absolute !left-0 !-translate-x-0 !-translate-y-1/2 !border-teal-500/40 !bg-teal-600`}
                  style={{ top: `${pct}%` }}
                  title={`video_${i} — concat order`}
                />
              );
            })}
            <div className="pointer-events-none absolute inset-y-0 left-4 flex flex-col justify-evenly py-1 text-[8px] text-zinc-500">
              {Array.from({ length: CONCAT_VIDEO_SLOT_COUNT }, (_, i) => (
                <span key={i} className="font-mono">
                  video_{i}
                </span>
              ))}
            </div>
          </>
        )}
        <Handle
          type="source"
          position={Position.Right}
          id="out"
          className={`${FLOW_HANDLE_BASE} !absolute !right-0 !top-1/2 !-translate-y-1/2 !border-teal-500/40 !bg-teal-500`}
          title='sourceHandle="out"'
        />
        <span className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 font-mono text-[10px] text-teal-300">
          out
        </span>
      </div>
    </div>
  );
}

function InputGroupNode({ id, data }: NodeProps) {
  const d = data as { slots?: InputSlot[] };
  const slots = d.slots ?? [];
  return (
    <div className="min-w-[260px] max-w-[300px] rounded-lg border border-emerald-700/40 bg-zinc-900/90 px-3 py-2 shadow-lg">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-400">
        Request · inputs
      </div>
      <div className="text-[10px] text-zinc-500">Node {id.slice(0, 8)}…</div>
      <div className="mt-2 space-y-0">
        {slots.length === 0 ? (
          <p className="text-xs text-zinc-500">Add slots in the sidebar.</p>
        ) : (
          slots.map((s) => (
            <div
              key={s.id}
              className="relative border-b border-zinc-800 py-2 pr-5 last:border-b-0"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-medium text-emerald-500/90">{s.label || s.kind}</span>
                <span className="shrink-0 rounded bg-zinc-800 px-1 font-mono text-[9px] uppercase text-zinc-500">
                  {s.kind}
                </span>
              </div>
              {s.kind === "text" ? (
                <p className="mt-1 line-clamp-3 text-xs text-zinc-300">{s.value || "—"}</p>
              ) : s.value.trim() && /^https?:\/\//i.test(s.value) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.value}
                  alt=""
                  className="mt-1 max-h-20 w-full rounded border border-zinc-700 object-contain"
                />
              ) : (
                <p className="mt-1 text-[11px] text-zinc-500">No image URL</p>
              )}
              <Handle
                type="source"
                position={Position.Right}
                id={s.id}
                className={`${FLOW_HANDLE_BASE} !top-[calc(50%-2px)] !border-emerald-500/35 !bg-emerald-400`}
                title={`sourceHandle="${s.id}" (slot "${s.label}")`}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function OutputPreviewNode({ data }: NodeProps) {
  const d = data as { title?: string; previewItems?: RunOutputItem[] };
  const title = d.title ?? "Result";
  const items = d.previewItems ?? [];
  const primary = items[0];
  return (
    <div className="min-w-[220px] max-w-[min(100vw,320px)] rounded-lg border border-violet-500/45 bg-zinc-900/90 px-3 py-2 shadow-lg">
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className={`${FLOW_HANDLE_BASE} !border-violet-500/40 !bg-violet-500`}
      />
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-violet-400">{title}</div>
      {primary ? (
        primary.kind === "video" ? (
          <video
            src={primary.url}
            controls
            playsInline
            className="mt-1 max-h-52 w-full rounded border border-zinc-700 bg-black"
          />
        ) : primary.kind === "audio" ? (
          <audio src={primary.url} controls className="mt-1 w-full min-w-[200px]" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primary.url}
            alt=""
            className="mt-1 max-h-52 w-full rounded border border-zinc-700 object-contain"
          />
        )
      ) : (
        <p className="text-xs leading-relaxed text-zinc-500">
          Connect the last step here, then run — image or video appears on the canvas.
        </p>
      )}
      {items.length > 1 ? (
        <p className="mt-1 text-[10px] text-zinc-600">+{items.length - 1} more in the Run panel</p>
      ) : null}
    </div>
  );
}

function InputImageNodeSettings({
  imageUrl,
  onImageUrlChange,
}: {
  imageUrl: string;
  onImageUrlChange: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/fal/storage/upload", { method: "POST", body: fd });
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        throw new Error(j.error ?? res.statusText);
      }
      if (j.url) {
        onImageUrlChange(j.url);
        track(AnalyticsEvent.storageUploadSuccess, { context: "input_image" });
      }
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 120);
      track(AnalyticsEvent.storageUploadError, { context: "input_image", message: msg });
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const trimmed = imageUrl.trim();
  const showPreview = /^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed);

  return (
    <div className="mt-2 space-y-2">
      <label className="text-xs text-zinc-500">Image URL or upload</label>
      <input
        type="url"
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
        placeholder="https://…"
        value={imageUrl}
        onChange={(e) => onImageUrlChange(e.target.value)}
      />
      <label className="inline-flex cursor-pointer items-center rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700">
        {busy ? "Uploading…" : "Upload image file"}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </label>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {showPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={trimmed} alt="" className="max-h-48 rounded border border-zinc-700" />
      ) : null}
      <p className="text-[11px] leading-snug text-zinc-600">
        Connect this node to a fal model that expects images (e.g.{" "}
        <span className="font-mono text-zinc-500">fal-ai/nano-banana-2/edit</span>). When{" "}
        <span className="font-mono text-zinc-500">image_urls</span> is empty in the model, the run uses this
        image.
      </p>
    </div>
  );
}

function InputVideoNodeSettings({
  videoUrl,
  onVideoUrlChange,
}: {
  videoUrl: string;
  onVideoUrlChange: (v: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/fal/storage/upload", { method: "POST", body: fd });
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) {
        throw new Error(j.error ?? res.statusText);
      }
      if (j.url) {
        onVideoUrlChange(j.url);
        track(AnalyticsEvent.storageUploadSuccess, { context: "input_video" });
      }
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 120);
      track(AnalyticsEvent.storageUploadError, { context: "input_video", message: msg });
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const trimmed = videoUrl.trim();
  const showPreview = /^https?:\/\//i.test(trimmed);

  return (
    <div className="mt-2 space-y-2">
      <label className="text-xs text-zinc-500">Video URL or upload (HTTPS)</label>
      <input
        type="url"
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
        placeholder="https://…"
        value={videoUrl}
        onChange={(e) => onVideoUrlChange(e.target.value)}
      />
      <label className="inline-flex cursor-pointer items-center rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700">
        {busy ? "Uploading…" : "Upload video file"}
        <input
          type="file"
          accept="video/*"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </label>
      {err && <p className="text-xs text-red-400">{err}</p>}
      {showPreview ? (
        <video src={trimmed} controls playsInline className="max-h-48 rounded border border-zinc-700 bg-black" />
      ) : null}
      <p className="text-[11px] leading-snug text-zinc-600">
        Wire <span className="font-mono">video</span> to <span className="font-mono">video_url</span> on a media
        process or fal node.
      </p>
    </div>
  );
}

const MEDIA_PROCESS_OPS = [
  "extract_audio",
  "extract_frames",
  "extract_keyframes",
  "pick_image",
  "segment_scenes",
  "sync_barrier",
  "concat_videos",
  "mux_audio_video",
  "images_to_video",
] as const;

function InputGroupNodeSettings({
  slots,
  onSlotsChange,
}: {
  slots: InputSlot[];
  onSlotsChange: (next: InputSlot[]) => void;
}) {
  const [busyIdx, setBusyIdx] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function uploadSlot(index: number, file: File) {
    setErr(null);
    setBusyIdx(index);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/fal/storage/upload", { method: "POST", body: fd });
      const j = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      if (j.url) {
        const next = [...slots];
        next[index] = { ...next[index]!, value: j.url };
        onSlotsChange(next);
        track(AnalyticsEvent.storageUploadSuccess, { context: "input_group_slot" });
      }
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 120);
      track(AnalyticsEvent.storageUploadError, { context: "input_group_slot", message: msg });
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyIdx(null);
    }
  }

  function patchSlot(index: number, patch: Partial<InputSlot>) {
    const next = [...slots];
    next[index] = { ...next[index]!, ...patch };
    onSlotsChange(next);
  }

  function removeSlot(index: number) {
    onSlotsChange(slots.filter((_, i) => i !== index));
  }

  return (
    <div className="mt-2 space-y-3">
      {err && <p className="text-xs text-red-400">{err}</p>}
      {slots.map((s, i) => (
        <div key={s.id} className="rounded border border-zinc-800 bg-zinc-900/50 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-[10px] text-zinc-500">Label</label>
            <input
              className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
              value={s.label}
              onChange={(e) => patchSlot(i, { label: e.target.value })}
            />
            <select
              className="rounded border border-zinc-700 bg-zinc-900 px-1 py-1 text-[11px] text-zinc-200"
              value={s.kind}
              onChange={(e) =>
                patchSlot(i, { kind: e.target.value as "image" | "text", value: "" })
              }
            >
              <option value="image">image</option>
              <option value="text">text</option>
            </select>
            <button
              type="button"
              className="text-[11px] text-red-400 hover:underline"
              onClick={() => removeSlot(i)}
            >
              Remove
            </button>
          </div>
          {s.kind === "text" ? (
            <textarea
              className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
              rows={3}
              value={s.value}
              onChange={(e) => patchSlot(i, { value: e.target.value })}
            />
          ) : (
            <div className="mt-2 space-y-1">
              <input
                type="url"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                placeholder="https://…"
                value={s.value}
                onChange={(e) => patchSlot(i, { value: e.target.value })}
              />
              <label className="inline-flex cursor-pointer items-center rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700">
                {busyIdx === i ? "Uploading…" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={busyIdx !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) void uploadSlot(i, f);
                  }}
                />
              </label>
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800"
          onClick={() =>
            onSlotsChange([
              ...slots,
              {
                id: `slot-${nanoid(6)}`,
                kind: "image",
                label: `image_${slots.length + 1}`,
                value: "",
              },
            ])
          }
        >
          + Image slot
        </button>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800"
          onClick={() =>
            onSlotsChange([
              ...slots,
              {
                id: `slot-${nanoid(6)}`,
                kind: "text",
                label: `prompt_${slots.length + 1}`,
                value: "",
              },
            ])
          }
        >
          + Text slot
        </button>
      </div>
      <p className="text-[11px] leading-snug text-zinc-600">
        Each slot has its own handle on the right. Connect one or more into a fal model or chain them
        like a try-on workflow.
      </p>
    </div>
  );
}

function FalModelNode({ id, data }: NodeProps) {
  const d = data as {
    falModelId?: string;
    falInput?: Record<string, unknown>;
    _inputHandleKeys?: string[];
    _runStepStatus?: string;
  };
  const stepStatus = d._runStepStatus;
  const isRunning = stepStatus === "running";
  const isQueued = stepStatus === "pending";
  const preview =
    typeof d.falInput?.prompt === "string"
      ? d.falInput.prompt
      : JSON.stringify(d.falInput ?? {}).slice(0, 120);
  const inputKeys = d._inputHandleKeys ?? [];
  const outputKeys = [...FAL_OUTPUT_HANDLES];
  const rowClass = "relative flex min-h-[22px] w-full items-center gap-0";
  const handleOffset = "left-[-1px]";
  return (
    <div
      className={`relative min-w-[min(100vw,320px)] max-w-[360px] rounded-lg border bg-zinc-900/90 px-3 py-2 shadow-lg transition-[box-shadow,border-color] duration-300 ${
        isRunning
          ? "border-orange-400/95 ring-2 ring-orange-400/75 animate-pulse shadow-[0_0_22px_rgba(251,146,60,0.22)]"
          : isQueued
            ? "border-amber-900/80 ring-1 ring-amber-700/40"
            : "border-zinc-600"
      }`}
    >
      {isRunning ? (
        <div className="absolute -right-1 -top-2 z-10 rounded-md bg-orange-500 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-md">
          Running
        </div>
      ) : isQueued ? (
        <div className="absolute -right-1 -top-2 z-10 rounded-md bg-zinc-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-200 shadow-md">
          Queued
        </div>
      ) : null}
      <div className="mb-2 border-b border-zinc-800 pb-2">
        <div className="text-xs font-medium uppercase tracking-wide text-amber-400">fal</div>
        <div className="truncate font-mono text-[10px] leading-snug text-zinc-500">{d.falModelId}</div>
        <div className="truncate text-[10px] text-zinc-600">node {id.slice(0, 8)}…</div>
      </div>

      <p className="mb-3 line-clamp-3 text-xs text-zinc-300">{preview || "—"}</p>

      <div className="flex gap-2 border-t border-zinc-800 pt-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
            Inputs (API field name = wire target)
          </div>
          <div className="flex flex-col gap-0.5">
            {inputKeys.map((key) => (
              <div key={key} className={rowClass}>
                <Handle
                  type="target"
                  position={Position.Left}
                  id={key}
                  className={`${FLOW_HANDLE_BASE} !absolute ${handleOffset} !top-1/2 !-translate-y-1/2 !border-amber-500/45 !bg-amber-500`}
                  title={`targetHandle="${key}" → falInput.${key}`}
                />
                <span className="ml-4 font-mono text-[10px] leading-tight text-zinc-200">{key}</span>
              </div>
            ))}
            {inputKeys.length === 0 ? (
              <p className="pl-4 text-[9px] leading-snug text-zinc-600">
                No OpenAPI input schema yet. Set fields in the sidebar or connect upstream nodes to named
                inputs.
              </p>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 flex-1 border-l border-zinc-800 pl-2">
          <div className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
            Outputs (source handle)
          </div>
          <p className="mb-1.5 text-[8px] leading-snug text-zinc-600">
            <span className="rounded bg-zinc-800 px-1 font-mono text-zinc-400">out</span>{" "}
            <span className="text-zinc-500">
              type: <strong className="text-zinc-400">text + URLs</strong> — connects to the next model’s
            </span>{" "}
            <span className="font-mono text-amber-200/80">prompt</span>
            <span className="text-zinc-500"> (caption), </span>
            <span className="font-mono text-amber-200/80">image_url</span>
            <span className="text-zinc-500"> / </span>
            <span className="font-mono text-amber-200/80">image_urls</span>
            <span className="text-zinc-500"> / </span>
            <span className="font-mono text-amber-200/80">start_image_url</span>
            <span className="text-zinc-500">, etc., by field name.</span>
          </p>
          <div className="flex flex-col gap-0.5">
            {outputKeys.map((key) => (
              <div key={key} className={`${rowClass} justify-end`}>
                <div className="mr-2 flex min-w-0 flex-1 flex-col items-end gap-0.5">
                  <span className="font-mono text-[10px] leading-tight text-zinc-200">{key}</span>
                  <span className="text-[8px] leading-tight text-zinc-500">text + media URLs</span>
                </div>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={key}
                  className={`${FLOW_HANDLE_BASE} !absolute !right-[-1px] !top-1/2 !-translate-y-1/2 !border-amber-500/45 !bg-amber-500`}
                  title='sourceHandle="out" — full run artifact: optional caption string plus any image/video/audio URLs (maps to the input field you wire to)'
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const nodeTypes = {
  input_prompt: InputPromptNode,
  input_image: InputImageNode,
  input_video: InputVideoNode,
  input_group: InputGroupNode,
  media_process: MediaProcessNode,
  review_gate: ReviewGateNode,
  output_preview: OutputPreviewNode,
  fal_model: FalModelNode,
};

type FalModelHit = {
  endpoint_id: string;
  metadata?: { display_name?: string; category?: string; description?: string };
};

type RunOutputItem = { url: string; kind: "image" | "video" | "audio" | "unknown" };

type WorkflowEventRow = { type?: string; node_id?: string; app_id?: string; message?: string };

function collectWorkflowStreamEvents(steps: { outputsJson?: string | null }[]): WorkflowEventRow[] {
  const rows: WorkflowEventRow[] = [];
  for (const s of steps) {
    if (!s.outputsJson) continue;
    try {
      const o = JSON.parse(s.outputsJson) as { workflowEvents?: WorkflowEventRow[] };
      if (Array.isArray(o.workflowEvents)) {
        rows.push(...o.workflowEvents);
      }
    } catch {
      /* ignore */
    }
  }
  return rows;
}

function collectRunOutputs(steps: { outputsJson?: string | null }[]): RunOutputItem[] {
  const items: RunOutputItem[] = [];
  const seen = new Set<string>();
  for (const s of steps) {
    if (!s.outputsJson) continue;
    try {
      const o = JSON.parse(s.outputsJson) as {
        images?: string[];
        media?: { url: string; kind: string }[];
      };
      if (Array.isArray(o.media)) {
        for (const m of o.media) {
          if (m.url && !seen.has(m.url)) {
            seen.add(m.url);
            const k = (m.kind as RunOutputItem["kind"]) || "unknown";
            items.push({ url: m.url, kind: k });
          }
        }
      }
      if (Array.isArray(o.images)) {
        for (const u of o.images) {
          if (u && !seen.has(u)) {
            seen.add(u);
            items.push({ url: u, kind: "image" });
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  return items;
}

type Props = {
  workflowId: string;
  initialGraph: WorkflowGraph;
  title: string;
  visibility: string;
  slug: string | null;
};

function isEditableClipboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

function FlowClipboardBridge({
  onCopy,
  onPasteAtFlowPosition,
}: {
  onCopy: () => boolean;
  onPasteAtFlowPosition: (pos: { x: number; y: number }) => Promise<boolean>;
}) {
  const rf = useReactFlow();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (isEditableClipboardTarget(e.target)) return;

      if (e.key === "c" || e.key === "C") {
        if (onCopy()) e.preventDefault();
      } else if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        const p = rf.screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        void onPasteAtFlowPosition(p);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rf, onCopy, onPasteAtFlowPosition]);

  return null;
}

function WorkflowEditorCanvas({ workflowId, initialGraph, title, visibility, slug }: Props) {
  const initial = useMemo(() => graphToFlow(initialGraph), [initialGraph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wfTitle, setWfTitle] = useState(title);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [pubSlug, setPubSlug] = useState<string | null>(slug);
  const [pubVis, setPubVis] = useState(visibility);
  const [runOutputs, setRunOutputs] = useState<RunOutputItem[]>([]);
  const [outputsMissing, setOutputsMissing] = useState(false);
  const [artifactPreviewByNodeId, setArtifactPreviewByNodeId] = useState<
    Record<string, RunOutputItem[]>
  >({});
  /** Plain text from each step's artifact (vision captions, etc.) for sidebar when node `data` is still empty. */
  const [stepArtifactTextByNodeId, setStepArtifactTextByNodeId] = useState<Record<string, string>>({});
  const [workflowStreamEvents, setWorkflowStreamEvents] = useState<WorkflowEventRow[]>([]);
  const [origin, setOrigin] = useState("");
  /** Per-node run step status while a run is in progress (from GET /api/runs/:id). */
  const [runStepByNodeId, setRunStepByNodeId] = useState<Record<string, string>>({});
  const [runStartedAtIso, setRunStartedAtIso] = useState<string | null>(null);
  const [runClock, setRunClock] = useState(0);

  const [modelQuery, setModelQuery] = useState("");
  const [modelHits, setModelHits] = useState<FalModelHit[]>([]);
  const [modelSearchLoading, setModelSearchLoading] = useState(false);
  const [detailByEndpoint, setDetailByEndpoint] = useState<
    Record<string, { input: RJSFSchema | null; output: RJSFSchema | null }>
  >({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const detailRequestedRef = useRef<Set<string>>(new Set());
  const runTerminalLoggedRef = useRef<string | null>(null);
  /** Last pointer position on the flow pane (flow coords); used when adding nodes from the toolbar. */
  const lastPaneFlowPosRef = useRef<{ x: number; y: number } | null>(null);
  const rf = useReactFlow();
  const [falKeyBanner, setFalKeyBanner] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const runInProgress = runStatus === "pending" || runStatus === "running";
  const runPaused = runStatus === "paused";
  const runShowsStepOverlay =
    runStatus === "pending" || runStatus === "running" || runStatus === "paused";

  useEffect(() => {
    if (!runStartedAtIso || !runInProgress) return;
    const id = window.setInterval(() => setRunClock((c) => c + 1), 1000);
    return () => window.clearInterval(id);
  }, [runStartedAtIso, runInProgress]);

  const runElapsedLabel = useMemo(() => {
    if (!runStartedAtIso || !runInProgress) return null;
    const ms = Date.now() - new Date(runStartedAtIso).getTime() + runClock * 0;
    const sec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
  }, [runStartedAtIso, runInProgress, runClock]);

  const falProgress = useMemo(() => {
    const falIds = nodes.filter((n) => n.type === "fal_model").map((n) => n.id);
    const total = falIds.length;
    if (total === 0) return { total: 0, done: 0, runningIds: [] as string[], queuedIds: [] as string[] };
    const done = falIds.filter((id) => runStepByNodeId[id] === "succeeded").length;
    const runningIds = falIds.filter((id) => runStepByNodeId[id] === "running");
    const queuedIds = falIds.filter((id) => runStepByNodeId[id] === "pending");
    return { total, done, runningIds, queuedIds };
  }, [nodes, runStepByNodeId]);

  /** Recomputed every render; `runClock` ticks once per second during a run so ETA stays fresh. */
  let roughEtaSeconds: number | null = null;
  if (runStartedAtIso && runInProgress && falProgress.total > 0 && falProgress.done >= 1) {
    const remaining = falProgress.total - falProgress.done;
    if (remaining > 0) {
      const elapsedSec = Math.max(
        1,
        (Date.now() - new Date(runStartedAtIso).getTime()) / 1000,
      );
      roughEtaSeconds = Math.round((elapsedSec / falProgress.done) * remaining);
    }
  }

  const activeRunningNodeId = falProgress.runningIds[0] ?? null;
  const activeRunningNode = activeRunningNodeId
    ? nodes.find((n) => n.id === activeRunningNodeId)
    : undefined;
  const activeRunningModelLabel =
    activeRunningNode?.type === "fal_model"
      ? String((activeRunningNode.data as { falModelId?: string }).falModelId ?? "").slice(0, 48)
      : null;

  const nodesForFlow = useMemo(() => {
    return nodes.map((n) => {
      if (n.type === "output_preview") {
        const items = artifactPreviewByNodeId[n.id];
        if (!items?.length) return n;
        return {
          ...n,
          data: { ...(n.data as Record<string, unknown>), previewItems: items },
        };
      }
      if (n.type === "media_process") {
        const items = artifactPreviewByNodeId[n.id];
        if (!items?.length) return n;
        return {
          ...n,
          data: { ...(n.data as Record<string, unknown>), previewItems: items },
        };
      }
      if (n.type === "fal_model") {
        const mid = String((n.data as { falModelId?: string }).falModelId ?? "").trim();
        const detail = mid ? detailByEndpoint[mid] : undefined;
        const inputKeys = listMappableInputKeysFromSchema(detail?.input ?? null);
        const stepSt = runShowsStepOverlay ? runStepByNodeId[n.id] : undefined;
        return {
          ...n,
          data: {
            ...(n.data as Record<string, unknown>),
            _inputHandleKeys: inputKeys,
            ...(stepSt ? { _runStepStatus: stepSt } : {}),
          },
        };
      }
      if (n.type === "review_gate") {
        const stepSt = runShowsStepOverlay ? runStepByNodeId[n.id] : undefined;
        if (!stepSt) return n;
        return {
          ...n,
          data: {
            ...(n.data as Record<string, unknown>),
            _runStepStatus: stepSt,
          },
        };
      }
      return n;
    });
  }, [nodes, artifactPreviewByNodeId, detailByEndpoint, runShowsStepOverlay, runStepByNodeId]);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  const selectedFalModelId =
    selectedNode?.type === "fal_model"
      ? String((selectedNode.data as { falModelId?: string }).falModelId ?? "")
      : "";

  const reviewGateCaption = useMemo(() => {
    if (selectedNode?.type !== "review_gate") return null;
    const visionEdge = edges.find(
      (e) => e.target === selectedNode.id && e.targetHandle === "in",
    );
    const visionId = visionEdge?.source ?? null;
    const rawStored = String((selectedNode.data as { text?: string }).text ?? "");
    const fromRun = visionId ? (stepArtifactTextByNodeId[visionId] ?? "") : "";
    const displayValue = rawStored.length > 0 ? rawStored : fromRun;
    const hydratedFromVision = rawStored.length === 0 && fromRun.trim().length > 0;
    return { visionId, displayValue, hydratedFromVision };
  }, [selectedNode, edges, stepArtifactTextByNodeId]);

  useEffect(() => {
    const t = setTimeout(() => {
      setModelSearchLoading(true);
      fetch(`/api/fal/models?q=${encodeURIComponent(modelQuery)}&limit=20`)
        .then(async (r) => {
          const j = (await r.json()) as { models?: FalModelHit[]; error?: string };
          if (responseIndicatesMissingFalKey(r.status, j.error)) {
            setFalKeyBanner(true);
            setModelHits([]);
            return;
          }
          setFalKeyBanner(false);
          setModelHits(Array.isArray(j.models) ? j.models : []);
        })
        .catch(() => {
          setModelHits([]);
        })
        .finally(() => setModelSearchLoading(false));
    }, 280);
    return () => clearTimeout(t);
  }, [modelQuery]);

  useEffect(() => {
    const ids = [
      ...new Set(
        nodes
          .filter((n) => n.type === "fal_model")
          .map((n) => String((n.data as { falModelId?: string }).falModelId ?? "").trim())
          .filter(Boolean),
      ),
    ];
    for (const id of ids) {
      if (detailRequestedRef.current.has(id)) continue;
      detailRequestedRef.current.add(id);
      void fetch(`/api/fal/models/detail?endpointId=${encodeURIComponent(id)}`)
        .then(async (r) => {
          const j = (await r.json()) as {
            inputSchema?: RJSFSchema | null;
            outputSchema?: RJSFSchema | null;
            error?: string;
          };
          if (!r.ok) {
            if (responseIndicatesMissingFalKey(r.status, j.error)) {
              setFalKeyBanner(true);
            }
            setDetailErrors((prev) => ({ ...prev, [id]: j.error ?? r.statusText }));
            setDetailByEndpoint((prev) => ({ ...prev, [id]: { input: null, output: null } }));
            return;
          }
          setDetailByEndpoint((prev) => ({
            ...prev,
            [id]: { input: j.inputSchema ?? null, output: j.outputSchema ?? null },
          }));
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          setDetailErrors((prev) => ({ ...prev, [id]: msg }));
          setDetailByEndpoint((prev) => ({ ...prev, [id]: { input: null, output: null } }));
        });
    }
  }, [nodes]);

  /** Persist OpenAPI-derived wiring hints on fal_model nodes so migration and runs do not rely on endpoint-id heuristics. */
  useEffect(() => {
    setNodes((nds) => {
      let changed = false;
      const next = nds.map((n) => {
        if (n.type !== "fal_model") return n;
        const mid = String((n.data as { falModelId?: string }).falModelId ?? "").trim();
        if (!mid) return n;
        const detail = detailByEndpoint[mid];
        if (!detail || (detail.input == null && detail.output == null)) return n;
        const d = { ...(n.data as Record<string, unknown>) };
        const inputSchema =
          detail.input && typeof detail.input === "object"
            ? (detail.input as Record<string, unknown>)
            : null;
        const openapiInputKeys = listMappableInputKeysFromSchema(detail.input ?? null);
        const openapiOutputKeys = listMappableOutputKeysFromSchema(detail.output ?? null);
        const primaryImageInputKey = inputSchema ? computePrimaryImageInputKey(inputSchema) : undefined;

        const sameKeys =
          JSON.stringify(d.openapiInputKeys) === JSON.stringify(openapiInputKeys) &&
          JSON.stringify(d.openapiOutputKeys) === JSON.stringify(openapiOutputKeys) &&
          d.primaryImageInputKey === primaryImageInputKey;
        if (sameKeys) return n;

        changed = true;
        d.openapiInputKeys = openapiInputKeys;
        d.openapiOutputKeys = openapiOutputKeys;
        if (primaryImageInputKey) d.primaryImageInputKey = primaryImageInputKey;
        else delete d.primaryImageInputKey;
        return { ...n, data: d };
      });
      return changed ? next : nds;
    });
  }, [detailByEndpoint, setNodes]);

  const detailSchema =
    selectedFalModelId && selectedNode?.type === "fal_model"
      ? detailByEndpoint[selectedFalModelId]?.input ?? null
      : null;
  const detailLoading = Boolean(
    selectedFalModelId &&
      selectedNode?.type === "fal_model" &&
      !(selectedFalModelId in detailByEndpoint),
  );
  const detailError =
    selectedFalModelId && selectedNode?.type === "fal_model"
      ? detailErrors[selectedFalModelId] ?? null
      : null;

  const deleteNodesById = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return;
      track(AnalyticsEvent.canvasDeleteNode, { count: ids.size });
      setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
      setEdges((eds) => eds.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
      setSelectedId((cur) => (cur && ids.has(cur) ? null : cur));
    },
    [setNodes, setEdges],
  );

  const deleteSelectedNode = useCallback(() => {
    if (!selectedId) return;
    deleteNodesById(new Set([selectedId]));
  }, [selectedId, deleteNodesById]);

  const handleClipboardCopy = useCallback((): boolean => {
    if (!selectedId) return false;
    const node = nodes.find((n) => n.id === selectedId);
    if (!node) return false;
    const graph = flowToGraph([node], []);
    const text = serializeWorkflowClipboard(graph);
    void navigator.clipboard.writeText(text).then(() => {
      track(AnalyticsEvent.canvasCopyNode, { workflowId });
    });
    return true;
  }, [selectedId, nodes, workflowId]);

  const handleClipboardPaste = useCallback(
    async (flowPosition: { x: number; y: number }): Promise<boolean> => {
      let text: string;
      try {
        text = await navigator.clipboard.readText();
      } catch {
        return false;
      }
      const parsed = parseWorkflowClipboard(text);
      if (!parsed) return false;
      const remapped = remapSingleNodePaste(parsed);
      const flow = graphToFlow(remapped);
      const newNode = flow.nodes[0];
      if (!newNode) return false;
      newNode.position = {
        x: flowPosition.x - 100,
        y: flowPosition.y - 40,
      };
      setNodes((nds) => [
        ...nds.map((n) => ({ ...n, selected: false })),
        { ...newNode, selected: true },
      ]);
      setSelectedId(newNode.id);
      track(AnalyticsEvent.canvasPasteNode, { workflowId });
      return true;
    },
    [setNodes, workflowId],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => isWorkflowConnectionValid(nodes, connection),
    [nodes],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const src = nodes.find((n) => n.id === params.source);
      const tgt = nodes.find((n) => n.id === params.target);
      track(AnalyticsEvent.canvasConnect, {
        sourceType: src?.type ?? "unknown",
        targetType: tgt?.type ?? "unknown",
      });
      setEdges((eds) => addEdge({ ...params, id: `e-${nanoid(8)}` }, eds));
    },
    [nodes, setEdges],
  );

  const save = useCallback(async () => {
    setSaveState("saving");
    try {
      const graph = flowToGraph(nodes, edges);
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graphJson: JSON.stringify(graph), title: wfTitle }),
      });
      if (!res.ok) throw new Error("Save failed");
      setSaveState("saved");
      track(AnalyticsEvent.workflowSaveSuccess, { workflowId });
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      track(AnalyticsEvent.workflowSaveError, { workflowId });
    }
  }, [nodes, edges, workflowId, wfTitle]);

  const addNode = (
    kind:
      | "input_prompt"
      | "input_image"
      | "input_video"
      | "input_group"
      | "media_process"
      | "review_gate"
      | "output_preview"
      | "fal_model",
  ) => {
    track(AnalyticsEvent.canvasAddNode, { nodeType: kind });
    const id = nanoid(10);
    const fallback = {
      x: 120 + (nodes.length % 3) * 40,
      y: 40 + nodes.length * 28,
    };
    const position = lastPaneFlowPosRef.current ?? fallback;
    const base: Node = {
      id,
      position,
      type: kind,
      data:
        kind === "input_prompt"
          ? { prompt: "" }
          : kind === "input_image"
            ? { imageUrl: "" }
            : kind === "input_video"
              ? { videoUrl: "" }
              : kind === "media_process"
                ? { operation: "extract_audio", params: {} }
                : kind === "review_gate"
                  ? { text: "" }
                  : kind === "input_group"
                  ? {
                      slots: [
                        {
                          id: `slot-${nanoid(6)}`,
                          kind: "image" as const,
                          label: "model_image",
                          value: "",
                        },
                        {
                          id: `slot-${nanoid(6)}`,
                          kind: "image" as const,
                          label: "garment_image",
                          value: "",
                        },
                        {
                          id: `slot-${nanoid(6)}`,
                          kind: "text" as const,
                          label: "prompt",
                          value: "",
                        },
                      ],
                    }
                  : kind === "output_preview"
                    ? { title: "Response" }
                    : {
                        falModelId: "fal-ai/flux/schnell",
                        falInput: { prompt: "Describe the image", num_images: 1 },
                      },
    };
    setNodes((nds) => [...nds, base]);
  };

  useEffect(() => {
    if (!runId) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        run: {
          status: string;
          error: string | null;
          startedAt?: string;
          steps?: { nodeId: string; status?: string; outputsJson?: string | null }[];
        };
      };
      setRunStatus(data.run.status);
      setRunError(data.run.error);
      if (data.run.startedAt) setRunStartedAtIso(data.run.startedAt);
      const steps = data.run.steps ?? [];
      const stepStatusMap: Record<string, string> = {};
      for (const s of steps) {
        if (s.nodeId && s.status) stepStatusMap[s.nodeId] = s.status;
      }
      setRunStepByNodeId(stepStatusMap);
      const byNode: Record<string, RunOutputItem[]> = {};
      const textByNode: Record<string, string> = {};
      for (const s of steps) {
        if (s.nodeId && s.outputsJson) {
          byNode[s.nodeId] = collectRunOutputs([{ outputsJson: s.outputsJson }]);
          const a = parseArtifactJson(s.outputsJson);
          const t = typeof a.text === "string" ? a.text.trim() : "";
          if (t) textByNode[s.nodeId] = a.text as string;
        }
      }
      setArtifactPreviewByNodeId(byNode);
      setStepArtifactTextByNodeId(textByNode);
      if (data.run.status === "succeeded" || data.run.status === "failed") {
        clearInterval(t);
        if (runId && runTerminalLoggedRef.current !== runId) {
          runTerminalLoggedRef.current = runId;
          track(AnalyticsEvent.workflowRunComplete, {
            workflowId,
            status: data.run.status,
          });
        }
        if (data.run.status === "succeeded") {
          let items = collectRunOutputs(steps);
          let ev = collectWorkflowStreamEvents(steps);
          if (items.length === 0) {
            const r2 = await fetch(`/api/runs/${runId}`);
            if (r2.ok) {
              const d2 = (await r2.json()) as {
                run: { steps?: { outputsJson?: string | null }[] };
              };
              items = collectRunOutputs(d2.run.steps ?? []);
              ev = collectWorkflowStreamEvents(d2.run.steps ?? []);
            }
          }
          setRunOutputs(items);
          setWorkflowStreamEvents(ev);
          setOutputsMissing(items.length === 0);
        }
      } else {
        setWorkflowStreamEvents(collectWorkflowStreamEvents(steps));
      }
    }, 1500);
    return () => clearInterval(t);
  }, [runId, workflowId]);

  const publish = async () => {
    await save();
    const res = await fetch(`/api/workflows/${workflowId}/publish`, { method: "POST" });
    const j = (await res.json()) as { workflow?: { slug?: string | null }; error?: string };
    if (!res.ok) {
      track(AnalyticsEvent.workflowPublishError, { workflowId, status: res.status });
      alert(j.error ?? "Publish failed");
      return;
    }
    track(AnalyticsEvent.workflowPublishSuccess, { workflowId });
    setPubVis("published");
    if (j.workflow?.slug) setPubSlug(j.workflow.slug);
  };

  const runWorkflow = async () => {
    await save();
    runTerminalLoggedRef.current = null;
    setRunOutputs([]);
    setArtifactPreviewByNodeId({});
    setStepArtifactTextByNodeId({});
    setWorkflowStreamEvents([]);
    setOutputsMissing(false);
    setRunError(null);
    setRunStepByNodeId({});
    setRunStartedAtIso(null);
    setRunClock(0);
    setRunStatus("pending");
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId }),
    });
    const j = (await res.json()) as { runId?: string; error?: string };
    if (!res.ok) {
      if (responseIndicatesMissingFalKey(res.status, j.error)) {
        setFalKeyBanner(true);
      }
      setRunStatus("failed");
      setRunError(j.error ?? "Run failed");
      track(AnalyticsEvent.workflowRunComplete, { workflowId, status: "failed" });
      return;
    }
    track(AnalyticsEvent.workflowRunStart, { workflowId });
    setRunId(j.runId!);
    setRunStatus("running");
  };

  const resumePausedRun = async () => {
    if (!runId || runStatus !== "paused") return;
    setResumeBusy(true);
    setRunError(null);
    try {
      await save();
      const graph = flowToGraph(nodes, edges);
      const gateTexts: Record<string, string> = {};
      for (const n of nodes) {
        if (n.type === "review_gate") {
          const raw = String((n.data as { text?: string }).text ?? "");
          const visionEdge = edges.find((e) => e.target === n.id && e.targetHandle === "in");
          const visionId = visionEdge?.source;
          const fromVision =
            visionId && stepArtifactTextByNodeId[visionId]
              ? stepArtifactTextByNodeId[visionId]
              : "";
          gateTexts[n.id] = raw.trim().length > 0 ? raw : fromVision;
        }
      }
      const res = await fetch(`/api/runs/${runId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gateTexts,
          graphJson: JSON.stringify(graph),
        }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      setRunStatus("running");
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setResumeBusy(false);
    }
  };

  const updateSelectedData = (patch: Record<string, unknown>) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    );
  };

  const setFalInput = (fd: Record<string, unknown>) => {
    updateSelectedData({ falInput: fd });
  };

  const falDocsUrl = (id: string) => `https://fal.ai/models/${encodeURIComponent(id)}/api`;

  const useJsonWithoutOpenApi =
    selectedNode?.type === "fal_model" &&
    selectedFalModelId.startsWith("workflows/") &&
    !detailLoading &&
    (!detailSchema || Boolean(detailError));

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {falKeyBanner ? (
        <div
          className="shrink-0 border-b border-amber-500/40 bg-amber-950/60 px-4 py-3 text-center text-sm text-amber-100"
          role="status"
        >
          <Link
            href="/settings/fal-key"
            className="font-semibold text-amber-300 underline-offset-4 hover:underline"
          >
            Set up your fal.ai API key
          </Link>{" "}
          to search models, upload images, and run workflows. Create one in the{" "}
          <a
            href="https://fal.ai/dashboard/keys"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-amber-300/90 underline-offset-4 hover:underline"
          >
            fal dashboard
          </a>
          .
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="relative min-h-[360px] flex-1">
        <ReactFlow
          nodes={nodesForFlow}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          connectionRadius={36}
          nodeTypes={nodeTypes}
          deleteKeyCode={["Backspace", "Delete"]}
          onNodeClick={(_, n) => {
            setSelectedId(n.id);
            setNodes((nds) =>
              nds.map((node) => ({ ...node, selected: node.id === n.id })),
            );
          }}
          onPaneMouseMove={(e) => {
            lastPaneFlowPosRef.current = rf.screenToFlowPosition({
              x: e.clientX,
              y: e.clientY,
            });
          }}
          onPaneClick={() => {
            setSelectedId(null);
            setNodes((nds) => nds.map((node) => ({ ...node, selected: false })));
          }}
          onNodesDelete={(deleted) => {
            deleteNodesById(new Set(deleted.map((n) => n.id)));
          }}
          fitView
          className="workflow-flow bg-zinc-950"
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            style: { stroke: "#71717a", strokeWidth: 1.5 },
          }}
        >
          <Background gap={20} size={1} color="#333" />
          <MiniMap className="!bg-zinc-900" />
          <Controls className="!bg-zinc-900 !text-zinc-200 !border-zinc-700" />
          <FlowClipboardBridge onCopy={handleClipboardCopy} onPasteAtFlowPosition={handleClipboardPaste} />
        </ReactFlow>
        <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-2">
          <div className="pointer-events-auto flex gap-2">
            <button
              type="button"
              onClick={() => addNode("input_prompt")}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-zinc-600 hover:bg-zinc-700"
            >
              + Input
            </button>
            <button
              type="button"
              onClick={() => addNode("input_image")}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-zinc-600 hover:bg-zinc-700"
            >
              + Image input
            </button>
            <button
              type="button"
              onClick={() => addNode("input_video")}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-cyan-900/50 hover:bg-zinc-700"
            >
              + Video input
            </button>
            <button
              type="button"
              onClick={() => addNode("media_process")}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-teal-900/50 hover:bg-zinc-700"
            >
              + Media process
            </button>
            <button
              type="button"
              onClick={() => addNode("review_gate")}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-fuchsia-900/50 hover:bg-zinc-700"
            >
              + Review gate
            </button>
            <button
              type="button"
              onClick={() => addNode("input_group")}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-zinc-600 hover:bg-zinc-700"
            >
              + Input group
            </button>
            <button
              type="button"
              onClick={() => addNode("fal_model")}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-zinc-600 hover:bg-zinc-700"
            >
              + fal model
            </button>
            <button
              type="button"
              onClick={() => addNode("output_preview")}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-violet-900/50 hover:bg-zinc-700"
            >
              + Result
            </button>
          </div>
        </div>
      </div>

      <aside className="w-full max-w-xl border-t border-zinc-800 bg-zinc-950 p-4 md:w-[min(100%,28rem)] md:border-l md:border-t-0 md:overflow-y-auto">
        <label className="block text-xs font-medium text-zinc-500">Title</label>
        <input
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
          value={wfTitle}
          onChange={(e) => setWfTitle(e.target.value)}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void save()}
            className="rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-sm font-medium text-zinc-100 transition-[background-color,border-color] duration-300 ease-out hover:border-white/15 hover:bg-white/15"
          >
            {saveState === "saving" ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => void runWorkflow()}
            className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-400"
          >
            Run workflow
          </button>
          <button
            type="button"
            onClick={() => void publish()}
            className="rounded-md border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900"
          >
            Publish
          </button>
        </div>
        {pubVis === "published" && pubSlug && origin && (
          <p className="mt-3 text-xs text-zinc-400">
            Share:{" "}
            <span className="break-all text-orange-400">
              {origin}/w/{pubSlug}
            </span>
          </p>
        )}
        {saveState === "saved" && <p className="mt-2 text-xs text-emerald-500">Saved.</p>}
        {saveState === "error" && <p className="mt-2 text-xs text-red-500">Save failed.</p>}

        <div className="mt-6 border-t border-zinc-800 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Run</h3>
          <p className="mt-1 text-xs text-zinc-600">
            The server polls fal when your app is not reachable by webhooks (e.g. localhost). Watch
            the canvas: the active fal node pulses orange while that step runs.
          </p>
          {runStatus && (
            <p className="mt-2 text-sm text-zinc-300">
              Status: <span className="text-orange-400">{runStatus}</span>
            </p>
          )}
          {runPaused && (
            <div className="mt-3 rounded-md border border-amber-600/50 bg-amber-950/35 p-3">
              <p className="text-sm text-amber-100/90">
                Run is paused at review gates. Edit captions on each <span className="font-mono">review_gate</span> node
                in the sidebar, save if needed, then resume.
              </p>
              <button
                type="button"
                disabled={!runId || resumeBusy}
                onClick={() => void resumePausedRun()}
                className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-amber-500 disabled:opacity-50"
              >
                {resumeBusy ? "Resuming…" : "Resume run"}
              </button>
            </div>
          )}
          {runInProgress && runElapsedLabel && (
            <p className="mt-1 text-xs text-zinc-500">
              Elapsed: <span className="text-zinc-300">{runElapsedLabel}</span>
            </p>
          )}
          {runInProgress && falProgress.total > 0 && (
            <p className="mt-1 text-xs text-zinc-500">
              Model steps:{" "}
              <span className="text-zinc-300">
                {falProgress.done} / {falProgress.total} finished
              </span>
              {falProgress.runningIds.length > 0 ? (
                <span className="text-orange-400/90"> · one running</span>
              ) : falProgress.queuedIds.length > 0 ? (
                <span className="text-amber-500/80"> · waiting in queue</span>
              ) : null}
            </p>
          )}
          {runInProgress && activeRunningModelLabel && (
            <p className="mt-1 text-xs text-zinc-500">
              Now on:{" "}
              <span className="break-all font-mono text-[11px] text-orange-300/95">
                {activeRunningModelLabel}
              </span>
            </p>
          )}
          {runInProgress && roughEtaSeconds != null && roughEtaSeconds > 0 && (
            <p className="mt-1 text-[11px] leading-snug text-zinc-600">
              Rough ETA: ~{roughEtaSeconds < 60 ? `${roughEtaSeconds}s` : `${Math.round(roughEtaSeconds / 60)}m`}{" "}
              left (average from completed steps; actual time varies).
            </p>
          )}
          {runError && (
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-red-400">{runError}</p>
          )}
          {runStatus === "succeeded" && outputsMissing && (
            <p className="mt-2 text-xs text-amber-500/90">
              Run finished but no media URLs were stored. Check your fal API key in Settings, fal logs, and server terminal
              for errors.
            </p>
          )}
          {workflowStreamEvents.length > 0 && (
            <div className="mt-3 max-h-40 overflow-y-auto rounded border border-zinc-800 bg-zinc-900/50 p-2 font-mono text-[10px] text-zinc-400">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                fal workflow stream
              </div>
              <ul className="space-y-0.5">
                {workflowStreamEvents.map((ev, i) => (
                  <li key={`${ev.node_id ?? ""}-${i}`}>
                    <span className="text-orange-400/90">{ev.type ?? "?"}</span>
                    {ev.node_id ? (
                      <span className="ml-1 text-zinc-500">{ev.node_id}</span>
                    ) : null}
                    {ev.message ? (
                      <span className="ml-1 text-red-400/90">{ev.message}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {runOutputs.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {runOutputs.map((item) =>
                item.kind === "video" ? (
                  <video
                    key={item.url}
                    src={item.url}
                    controls
                    className="max-h-40 max-w-[200px] rounded border border-zinc-700"
                  />
                ) : item.kind === "audio" ? (
                  <audio key={item.url} src={item.url} controls className="w-full min-w-[200px]" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={item.url}
                    src={item.url}
                    alt="Output"
                    className="max-h-40 rounded border border-zinc-700"
                  />
                ),
              )}
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-zinc-800 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Selected node
          </h3>
          {!selectedNode && (
            <p className="mt-2 text-sm text-zinc-500">
              Click a node to edit parameters. Press <kbd className="rounded bg-zinc-800 px-1">Delete</kbd>{" "}
              or <kbd className="rounded bg-zinc-800 px-1">⌫</kbd> to remove it.
            </p>
          )}
          {selectedNode && (
            <button
              type="button"
              onClick={deleteSelectedNode}
              className="mt-2 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-1.5 text-sm text-red-200 hover:bg-red-950/70"
            >
              Delete node
            </button>
          )}
          {selectedNode?.type === "input_prompt" && (
            <div className="mt-2 space-y-2">
              <label className="text-xs text-zinc-500">Prompt text</label>
              <textarea
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                rows={4}
                value={String((selectedNode.data as { prompt?: string }).prompt ?? "")}
                onChange={(e) => updateSelectedData({ prompt: e.target.value })}
              />
            </div>
          )}
          {selectedNode?.type === "input_image" && (
            <InputImageNodeSettings
              imageUrl={String((selectedNode.data as { imageUrl?: string }).imageUrl ?? "")}
              onImageUrlChange={(imageUrl) => updateSelectedData({ imageUrl })}
            />
          )}
          {selectedNode?.type === "input_video" && (
            <InputVideoNodeSettings
              videoUrl={String((selectedNode.data as { videoUrl?: string }).videoUrl ?? "")}
              onVideoUrlChange={(videoUrl) => updateSelectedData({ videoUrl })}
            />
          )}
          {selectedNode?.type === "review_gate" && (
            <div className="mt-2 space-y-2">
              <label className="text-xs text-zinc-500">Caption (fed to downstream fal merge as text)</label>
              <textarea
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                rows={5}
                value={reviewGateCaption?.displayValue ?? ""}
                onChange={(e) => updateSelectedData({ text: e.target.value })}
              />
              {reviewGateCaption?.hydratedFromVision ? (
                <p className="text-[11px] leading-snug text-zinc-500">
                  Showing text from the vision step above. Edit here, then Resume when ready.
                </p>
              ) : null}
              <p className="text-[11px] leading-snug text-zinc-600">
                Wire <span className="font-mono">in</span> from vision (text). Optional <span className="font-mono">barrier_in</span> from{" "}
                <span className="font-mono">sync_barrier</span> so all lanes align before pause.
              </p>
            </div>
          )}
          {selectedNode?.type === "media_process" && (
            <div className="mt-2 space-y-2">
              <label className="text-xs text-zinc-500">Operation</label>
              <select
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                value={String((selectedNode.data as { operation?: string }).operation ?? "extract_audio")}
                onChange={(e) =>
                  updateSelectedData({
                    operation: e.target.value,
                    params: (selectedNode.data as { params?: Record<string, unknown> }).params ?? {},
                  })
                }
              >
                {MEDIA_PROCESS_OPS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              {String((selectedNode.data as { operation?: string }).operation ?? "") === "extract_frames" ? (
                <>
                  <label className="text-xs text-zinc-500">Params (extract_frames)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min={0.1}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                      placeholder="fps"
                      value={
                        Number((selectedNode.data as { params?: { fps?: number } }).params?.fps ?? "") || ""
                      }
                      onChange={(e) => {
                        const v = e.target.value === "" ? undefined : Number(e.target.value);
                        updateSelectedData({
                          params: {
                            ...((selectedNode.data as { params?: Record<string, unknown> }).params ?? {}),
                            ...(v != null && !Number.isNaN(v) ? { fps: v } : { fps: undefined }),
                          },
                        });
                      }}
                    />
                    <input
                      type="number"
                      min={1}
                      max={48}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                      placeholder="maxFrames"
                      value={
                        Number((selectedNode.data as { params?: { maxFrames?: number } }).params?.maxFrames ?? "") ||
                        ""
                      }
                      onChange={(e) => {
                        const v = e.target.value === "" ? undefined : Number(e.target.value);
                        updateSelectedData({
                          params: {
                            ...((selectedNode.data as { params?: Record<string, unknown> }).params ?? {}),
                            ...(v != null && !Number.isNaN(v) ? { maxFrames: v } : { maxFrames: undefined }),
                          },
                        });
                      }}
                    />
                  </div>
                </>
              ) : null}
              {String((selectedNode.data as { operation?: string }).operation ?? "") === "extract_keyframes" ? (
                <>
                  <label className="text-xs text-zinc-500">Params (extract_keyframes)</label>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        max={24}
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                        placeholder="keyframeMaxSegments"
                        title="Max segments (keyframes)"
                        value={
                          Number(
                            (selectedNode.data as { params?: { keyframeMaxSegments?: number } }).params
                              ?.keyframeMaxSegments ?? "",
                          ) || ""
                        }
                        onChange={(e) => {
                          const v = e.target.value === "" ? undefined : Number(e.target.value);
                          updateSelectedData({
                            params: {
                              ...((selectedNode.data as { params?: Record<string, unknown> }).params ?? {}),
                              ...(v != null && !Number.isNaN(v)
                                ? { keyframeMaxSegments: v }
                                : { keyframeMaxSegments: undefined }),
                            },
                          });
                        }}
                      />
                      <input
                        type="number"
                        step="0.05"
                        min={0.05}
                        max={1}
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                        placeholder="sceneThreshold"
                        title="Optical flow scene cut sensitivity"
                        value={
                          Number(
                            (selectedNode.data as { params?: { sceneThreshold?: number } }).params?.sceneThreshold ??
                              "",
                          ) || ""
                        }
                        onChange={(e) => {
                          const v = e.target.value === "" ? undefined : Number(e.target.value);
                          updateSelectedData({
                            params: {
                              ...((selectedNode.data as { params?: Record<string, unknown> }).params ?? {}),
                              ...(v != null && !Number.isNaN(v)
                                ? { sceneThreshold: v }
                                : { sceneThreshold: undefined }),
                            },
                          });
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] leading-snug text-zinc-600">
                    One PNG per optical-flow segment (midpoint). Outputs <span className="font-mono">image_urls</span> for{" "}
                    <span className="font-mono">pick_image</span> lanes.
                  </p>
                </>
              ) : null}
              {String((selectedNode.data as { operation?: string }).operation ?? "") === "pick_image" ? (
                <>
                  <label className="text-xs text-zinc-500">Params (pick_image)</label>
                  <input
                    type="number"
                    min={0}
                    max={64}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                    placeholder="index (0-based)"
                    value={(selectedNode.data as { params?: { index?: number } }).params?.index ?? 0}
                    onChange={(e) => {
                      const v = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      updateSelectedData({
                        params: {
                          ...((selectedNode.data as { params?: Record<string, unknown> }).params ?? {}),
                          index: Number.isNaN(v) ? 0 : v,
                        },
                      });
                    }}
                  />
                </>
              ) : null}
              {String((selectedNode.data as { operation?: string }).operation ?? "") === "images_to_video" ? (
                <>
                  <label className="text-xs text-zinc-500">Params (images_to_video)</label>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.05"
                        min={0.05}
                        max={60}
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                        placeholder="secondsPerFrame"
                        title="Seconds each image is shown"
                        value={
                          Number(
                            (selectedNode.data as { params?: { secondsPerFrame?: number } }).params
                              ?.secondsPerFrame ?? "",
                          ) || ""
                        }
                        onChange={(e) => {
                          const v = e.target.value === "" ? undefined : Number(e.target.value);
                          updateSelectedData({
                            params: {
                              ...((selectedNode.data as { params?: Record<string, unknown> }).params ?? {}),
                              ...(v != null && !Number.isNaN(v)
                                ? { secondsPerFrame: v }
                                : { secondsPerFrame: undefined }),
                            },
                          });
                        }}
                      />
                      <input
                        type="number"
                        min={1}
                        max={48}
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                        placeholder="maxFrames"
                        title="Max images from upstream (cap)"
                        value={
                          Number(
                            (selectedNode.data as { params?: { maxFrames?: number } }).params?.maxFrames ?? "",
                          ) || ""
                        }
                        onChange={(e) => {
                          const v = e.target.value === "" ? undefined : Number(e.target.value);
                          updateSelectedData({
                            params: {
                              ...((selectedNode.data as { params?: Record<string, unknown> }).params ?? {}),
                              ...(v != null && !Number.isNaN(v) ? { maxFrames: v } : { maxFrames: undefined }),
                            },
                          });
                        }}
                      />
                    </div>
                    <input
                      type="number"
                      min={64}
                      max={4096}
                      step={1}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-xs text-zinc-100"
                      placeholder="maxWidth (optional)"
                      title="Optional max width in pixels; height scales"
                      value={
                        Number((selectedNode.data as { params?: { maxWidth?: number } }).params?.maxWidth ?? "") ||
                        ""
                      }
                      onChange={(e) => {
                        const v = e.target.value === "" ? undefined : Number(e.target.value);
                        updateSelectedData({
                          params: {
                            ...((selectedNode.data as { params?: Record<string, unknown> }).params ?? {}),
                            ...(v != null && !Number.isNaN(v) ? { maxWidth: v } : { maxWidth: undefined }),
                          },
                        });
                      }}
                    />
                  </div>
                  <p className="text-[11px] leading-snug text-zinc-600">
                    Wire upstream <span className="font-mono">out</span> to <span className="font-mono">image_urls</span>{" "}
                    (e.g. extract_frames or nano-banana). Produces one MP4 slideshow.
                  </p>
                </>
              ) : null}
              <p className="text-[11px] text-zinc-600">
                Requires <span className="font-mono">ffmpeg</span> on the server. Outputs upload to fal storage.
              </p>
            </div>
          )}
          {selectedNode?.type === "input_group" && (
            <div className="mt-2 space-y-2">
              <label className="text-xs text-zinc-500">Input slots</label>
              <InputGroupNodeSettings
                slots={
                  ((selectedNode.data as { slots?: InputSlot[] }).slots ?? []) as InputSlot[]
                }
                onSlotsChange={(slots) => updateSelectedData({ slots })}
              />
            </div>
          )}
          {selectedNode?.type === "output_preview" && (
            <div className="mt-2 space-y-2">
              <label className="text-xs text-zinc-500">Title</label>
              <input
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                value={String((selectedNode.data as { title?: string }).title ?? "Result")}
                onChange={(e) => updateSelectedData({ title: e.target.value })}
              />
              <p className="text-[11px] leading-snug text-zinc-600">
                Connect the upstream node that produces the final image or video. After a successful
                run, the media appears inside this node on the canvas.
              </p>
            </div>
          )}
          {selectedNode?.type === "fal_model" && (
            <div className="mt-2 space-y-3">
              <div>
                <label className="text-xs text-zinc-500">Endpoint id</label>
                <input
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100"
                  value={selectedFalModelId}
                  onChange={(e) => updateSelectedData({ falModelId: e.target.value })}
                />
                {selectedFalModelId ? (
                  <a
                    href={falDocsUrl(selectedFalModelId)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-xs text-orange-400 hover:underline"
                  >
                    Open API docs on fal.ai
                  </a>
                ) : null}
              </div>

              <div>
                <label className="text-xs text-zinc-500">fal workflow templates</label>
                <p className="mt-0.5 text-[10px] text-zinc-600">
                  Hosted <span className="font-mono">workflows/…</span> pipelines use{" "}
                  <span className="font-mono">fal.stream</span> (see docs). Connect prompt + image
                  inputs like single-model nodes.
                </p>
                <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto rounded border border-zinc-800">
                  {FAL_WORKFLOW_TEMPLATES.map((tpl) => (
                    <li key={tpl.id}>
                      <button
                        type="button"
                        className="w-full px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                        onClick={() => {
                          track(AnalyticsEvent.workflowTemplateApplied, {
                            templateId: tpl.id.slice(0, 96),
                          });
                          updateSelectedData({
                            falModelId: tpl.id,
                            falInput: { ...tpl.defaultFalInput },
                          });
                        }}
                      >
                        <span className="font-mono text-cyan-400/90">{tpl.title}</span>
                        <span className="ml-1 block text-[10px] text-zinc-500">{tpl.description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <label className="text-xs text-zinc-500">Search models</label>
                <input
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                  placeholder="Type to search…"
                  value={modelQuery}
                  onChange={(e) => setModelQuery(e.target.value)}
                />
                <p className="mt-0.5 text-[10px] text-zinc-600">
                  {modelSearchLoading ? "Loading…" : `${modelHits.length} results`}
                </p>
                <ul className="mt-1 max-h-36 overflow-y-auto rounded border border-zinc-800">
                  {modelHits.map((m) => (
                    <li key={m.endpoint_id}>
                      <button
                        type="button"
                        className="w-full px-2 py-1.5 text-left text-xs text-zinc-200 hover:bg-zinc-800"
                        onClick={() => {
                          track(AnalyticsEvent.falModelSelected, {
                            endpointId: m.endpoint_id.slice(0, 96),
                          });
                          updateSelectedData({
                            falModelId: m.endpoint_id,
                            falInput: {},
                            openapiInputKeys: undefined,
                            openapiOutputKeys: undefined,
                            primaryImageInputKey: undefined,
                          });
                        }}
                      >
                        <span className="font-mono text-orange-300">{m.endpoint_id}</span>
                        {m.metadata?.display_name ? (
                          <span className="ml-1 text-zinc-500">{m.metadata.display_name}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              {detailLoading && <p className="text-xs text-zinc-500">Loading input schema…</p>}
              {detailError && <p className="text-xs text-red-400">{detailError}</p>}

              <div>
                <label className="text-xs text-zinc-500">Model input</label>
                <FalModelForm
                  key={`${selectedId}-${selectedFalModelId}`}
                  schema={detailSchema}
                  formData={
                    ((selectedNode.data as { falInput?: Record<string, unknown> }).falInput ??
                      {}) as Record<string, unknown>
                  }
                  onChange={setFalInput}
                  noSchemaFallback={useJsonWithoutOpenApi ? "json" : "message"}
                />
              </div>
            </div>
          )}
        </div>
      </aside>
      </div>
    </div>
  );
}

export function WorkflowEditor(props: Props) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorCanvas {...props} />
    </ReactFlowProvider>
  );
}
