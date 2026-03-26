"use client";

import { useEffect, useMemo } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { graphToFlow } from "@/lib/flow-adapter";
import type { GraphMediaHint } from "@/lib/graph-media-hints";
import type { PublishedExemplarRow, PublishedPreviewItem } from "@/lib/published-exemplar";
import type { WorkflowGraph } from "@/lib/workflow-graph";

const DEFAULT_OUTPUT_HANDLE_KEYS = ["out", "images", "text", "media"] as const;

const FLOW_HANDLE_PUBLISHED =
  "!pointer-events-none !h-2.5 !w-2.5 !rounded-sm !border !border-white/20 !bg-white/40";

type InputSlot = { id: string; kind: "image" | "text"; label: string; value: string };

type RunOutputItem = { url: string; kind: "image" | "video" | "audio" | "unknown" };

function enrichPublishedNodes(
  nodes: Node[],
  edges: Edge[],
  exemplarByNodeId: Record<string, PublishedPreviewItem[]>,
): Node[] {
  const incomingByTarget = new Map<string, Set<string>>();
  const outgoingBySource = new Map<string, Set<string>>();
  for (const e of edges) {
    const th = e.targetHandle == null || e.targetHandle === "" ? "in" : e.targetHandle;
    if (!incomingByTarget.has(e.target)) incomingByTarget.set(e.target, new Set());
    incomingByTarget.get(e.target)!.add(th);
    const sh = e.sourceHandle;
    if (sh) {
      if (!outgoingBySource.has(e.source)) outgoingBySource.set(e.source, new Set());
      outgoingBySource.get(e.source)!.add(sh);
    }
  }

  return nodes.map((n) => {
    if (n.type === "fal_model") {
      const inc = [...(incomingByTarget.get(n.id) ?? [])];
      const inputKeys = inc.filter((h) => h !== "in");
      const outExtra = [...(outgoingBySource.get(n.id) ?? [])];
      const mergedOut = [...new Set([...DEFAULT_OUTPUT_HANDLE_KEYS, ...outExtra])];
      return {
        ...n,
        data: {
          ...(n.data as object),
          _inputHandleKeys: inputKeys,
          _outputHandleKeys: mergedOut,
        },
      };
    }
    if (n.type === "output_preview") {
      const preview = exemplarByNodeId[n.id];
      if (!preview?.length) return n;
      const previewItems: RunOutputItem[] = preview.map((p) => ({
        url: p.url,
        kind: p.kind === "audio" ? "audio" : p.kind === "video" ? "video" : "image",
      }));
      return {
        ...n,
        data: { ...(n.data as object), previewItems },
      };
    }
    return n;
  });
}

function PublishedInputPromptNode({ data }: NodeProps) {
  const d = data as { prompt?: string };
  return (
    <div className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out min-w-[180px] max-w-[220px] rounded-xl border border-white/15 bg-zinc-950/55 px-3 py-2 pr-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90">Text</div>
      <p className="mt-1 line-clamp-3 text-xs text-zinc-200">{d.prompt || "—"}</p>
      <div className="relative mt-2 flex min-h-[18px] justify-end">
        <Handle
          type="source"
          position={Position.Right}
          id="prompt"
          className={`${FLOW_HANDLE_PUBLISHED} !absolute !right-0 !top-1/2 !-translate-y-1/2 !bg-emerald-400/90`}
        />
      </div>
    </div>
  );
}

function PublishedInputImageNode({ data }: NodeProps) {
  const d = data as { imageUrl?: string };
  const url = (d.imageUrl ?? "").trim();
  const showPreview = /^https?:\/\//i.test(url) || /^data:image\//i.test(url);
  return (
    <div className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out min-w-[180px] max-w-[220px] rounded-xl border border-white/15 bg-zinc-950/55 px-3 py-2 pr-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90">Image</div>
      {showPreview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="mt-2 max-h-24 w-full rounded-lg border border-white/10 object-cover"
        />
      ) : (
        <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">{url || "No URL"}</p>
      )}
      <div className="relative mt-2 flex min-h-[18px] justify-end">
        <Handle
          type="source"
          position={Position.Right}
          id="image"
          className={`${FLOW_HANDLE_PUBLISHED} !absolute !right-0 !top-1/2 !-translate-y-1/2 !bg-emerald-400/90`}
        />
      </div>
    </div>
  );
}

function PublishedInputGroupNode({ data }: NodeProps) {
  const d = data as { slots?: InputSlot[] };
  const slots = d.slots ?? [];
  return (
    <div className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out min-w-[200px] max-w-[260px] rounded-xl border border-emerald-500/25 bg-zinc-950/55 px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-300/90">Inputs</div>
      <div className="mt-2 space-y-2">
        {slots.length === 0 ? (
          <p className="text-[11px] text-zinc-500">No slots</p>
        ) : (
          slots.map((s) => (
            <div key={s.id} className="relative border-b border-white/5 py-1.5 pr-4 last:border-b-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-zinc-400">{s.label || s.kind}</span>
                <span className="rounded bg-white/5 px-1 text-[9px] uppercase text-zinc-500">{s.kind}</span>
              </div>
              {s.kind === "text" ? (
                <p className="mt-1 line-clamp-2 text-[11px] text-zinc-300">{s.value || "—"}</p>
              ) : s.value.trim() && /^https?:\/\//i.test(s.value) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.value}
                  alt=""
                  className="mt-1 max-h-16 w-full rounded-md border border-white/10 object-cover"
                />
              ) : null}
              <Handle
                type="source"
                position={Position.Right}
                id={s.id}
                className={`${FLOW_HANDLE_PUBLISHED} !absolute !right-0 !top-1/2 !-translate-y-1/2 !bg-emerald-400/85`}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PublishedOutputPreviewNode({ data }: NodeProps) {
  const d = data as { title?: string; previewItems?: RunOutputItem[] };
  const title = d.title ?? "Result";
  const items = d.previewItems ?? [];
  const primary = items[0];
  return (
    <div className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out min-w-[200px] max-w-[280px] rounded-xl border border-violet-400/35 bg-zinc-950/55 px-3 py-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className={`${FLOW_HANDLE_PUBLISHED} !bg-violet-500/90`}
      />
      <div className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">{title}</div>
      {primary ? (
        primary.kind === "video" ? (
          <video
            src={primary.url}
            controls
            playsInline
            className="mt-2 max-h-40 w-full rounded-lg border border-white/10 bg-black"
          />
        ) : primary.kind === "audio" ? (
          <audio src={primary.url} controls className="mt-2 w-full" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={primary.url}
            alt=""
            className="mt-2 max-h-40 w-full rounded-lg border border-white/10 object-contain"
          />
        )
      ) : (
        <p className="mt-2 text-[11px] text-zinc-500">Run this workflow to see output here.</p>
      )}
      {items.length > 1 ? (
        <p className="mt-1 text-[9px] text-zinc-600">+{items.length - 1} more below</p>
      ) : null}
    </div>
  );
}

function PublishedFalModelNode({ data }: NodeProps) {
  const d = data as {
    falModelId?: string;
    falInput?: Record<string, unknown>;
    _inputHandleKeys?: string[];
    _outputHandleKeys?: string[];
  };
  const preview =
    typeof d.falInput?.prompt === "string"
      ? d.falInput.prompt
      : JSON.stringify(d.falInput ?? {}).slice(0, 100);
  const inputKeys = d._inputHandleKeys ?? [];
  const outputKeys =
    d._outputHandleKeys && d._outputHandleKeys.length > 0
      ? d._outputHandleKeys
      : [...DEFAULT_OUTPUT_HANDLE_KEYS];

  const rowClass = "relative flex min-h-[20px] w-full items-center";

  return (
    <div className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out min-w-[260px] max-w-[320px] rounded-xl border border-amber-400/30 bg-zinc-950/55 px-3 py-2 shadow-[0_16px_48px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <div className="mb-2 border-b border-white/10 pb-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-300/90">fal</div>
        <div className="truncate font-mono text-[10px] text-zinc-400">{d.falModelId}</div>
      </div>
      <p className="mb-2 line-clamp-2 text-[11px] text-zinc-300">{preview || "—"}</p>
      <div className="flex gap-2 border-t border-white/10 pt-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-[9px] font-semibold uppercase text-zinc-500">In</div>
          <div className={rowClass}>
            <Handle
              type="target"
              position={Position.Left}
              id="in"
              className={`${FLOW_HANDLE_PUBLISHED} !absolute !left-[-1px] !top-1/2 !-translate-y-1/2 !bg-amber-400/90`}
            />
            <span className="ml-3 font-mono text-[9px] text-amber-100/90">in</span>
          </div>
          {inputKeys.map((key) => (
            <div key={key} className={rowClass}>
              <Handle
                type="target"
                position={Position.Left}
                id={key}
                className={`${FLOW_HANDLE_PUBLISHED} !absolute !left-[-1px] !top-1/2 !-translate-y-1/2 !bg-amber-400/85`}
              />
              <span className="ml-3 truncate font-mono text-[9px] text-zinc-300">{key}</span>
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 border-l border-white/10 pl-2">
          <div className="mb-1 text-[9px] font-semibold uppercase text-zinc-500">Out</div>
          <div className="flex flex-col gap-0.5">
            {outputKeys.map((key) => (
              <div key={key} className={`${rowClass} justify-end`}>
                <span className="mr-2 font-mono text-[9px] text-zinc-300">{key}</span>
                <Handle
                  type="source"
                  position={Position.Right}
                  id={key}
                  className={`${FLOW_HANDLE_PUBLISHED} !absolute !right-[-1px] !top-1/2 !-translate-y-1/2 !bg-amber-400/85`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const publishedNodeTypes = {
  input_prompt: PublishedInputPromptNode,
  input_image: PublishedInputImageNode,
  input_group: PublishedInputGroupNode,
  output_preview: PublishedOutputPreviewNode,
  fal_model: PublishedFalModelNode,
};

function FitViewOnMount() {
  const rf = useReactFlow();
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      rf.fitView({ padding: 0.18, duration: 240 });
    });
    return () => cancelAnimationFrame(id);
  }, [rf]);
  return null;
}

function PublishedFlowBoard({
  initialNodes,
  initialEdges,
}: {
  initialNodes: Node[];
  initialEdges: Edge[];
}) {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={publishedNodeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      minZoom={0.2}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
      className="!bg-transparent"
      defaultEdgeOptions={{
        style: { stroke: "rgba(161,161,170,0.5)", strokeWidth: 1.25 },
      }}
    >
      <Background gap={20} size={1} color="rgba(255,255,255,0.04)" />
      <Controls
        showInteractive={false}
        className="!m-3 !overflow-hidden !rounded-lg !border !border-white/15 !bg-zinc-950/70 !shadow-lg !backdrop-blur-md [&_button]:!rounded-md [&_button]:!border-white/10 [&_button]:!bg-zinc-900/80 [&_button]:!fill-zinc-200"
      />
      <FitViewOnMount />
    </ReactFlow>
  );
}

type ShowcaseProps = {
  /** Remount flow when graph or exemplar wiring changes */
  flowKey: string;
  graph: WorkflowGraph;
  graphMediaHints: GraphMediaHint[];
  exemplarGallery: PublishedExemplarRow[];
  exemplarPreviewByNodeId: Record<string, PublishedPreviewItem[]>;
};

export function PublishedWorkflowShowcase({
  flowKey,
  graph,
  graphMediaHints,
  exemplarGallery,
  exemplarPreviewByNodeId,
}: ShowcaseProps) {
  const { initialNodes, initialEdges } = useMemo(() => {
    const flow = graphToFlow(graph);
    const enriched = enrichPublishedNodes(flow.nodes, flow.edges, exemplarPreviewByNodeId);
    return { initialNodes: enriched, initialEdges: flow.edges };
  }, [graph, exemplarPreviewByNodeId]);

  const graphUrlSet = useMemo(() => new Set(graphMediaHints.map((h) => h.url)), [graphMediaHints]);
  const exemplarFiltered = useMemo(
    () => exemplarGallery.filter((row) => !graphUrlSet.has(row.url)),
    [exemplarGallery, graphUrlSet],
  );

  return (
    <div className="space-y-6 [perspective:1200px]">
      <div className="motion-safe:transition-transform motion-safe:duration-300 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/40 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
        <p className="border-b border-white/10 px-4 py-3 text-xs font-medium uppercase tracking-wide text-zinc-500">
          Graph snapshot
        </p>
        <div className="relative h-[min(520px,72vh)] min-h-[360px] w-full bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] bg-[length:20px_20px]">
          <ReactFlowProvider>
            <PublishedFlowBoard
              key={flowKey}
              initialNodes={initialNodes}
              initialEdges={initialEdges}
            />
          </ReactFlowProvider>
        </div>
      </div>

      {(graphMediaHints.length > 0 || exemplarFiltered.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">
          {graphMediaHints.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/35 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out hover:shadow-[0_20px_56px_rgba(0,0,0,0.4)]">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">From this workflow</h3>
              <p className="mt-1 text-[11px] text-zinc-600">URLs saved in the graph (inputs &amp; parameters).</p>
              <ul className="mt-4 flex flex-wrap gap-3">
                {graphMediaHints.map((h) => (
                  <li
                    key={h.url}
                    className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out w-[calc(50%-0.375rem)] min-w-[140px] flex-1 rounded-xl border border-white/10 bg-black/30 p-2"
                  >
                    <MediaThumb url={h.url} kind={h.kind} caption={h.source} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {exemplarFiltered.length > 0 ? (
            <div className="rounded-2xl border border-white/10 bg-zinc-950/35 p-4 shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out hover:shadow-[0_20px_56px_rgba(0,0,0,0.4)]">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                From creator&apos;s last successful run
              </h3>
              <p className="mt-1 text-[11px] text-zinc-600">Example outputs (not part of the saved graph).</p>
              <ul className="mt-4 flex flex-wrap gap-3">
                {exemplarFiltered.map((row) => (
                  <li
                    key={row.url}
                    className="motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out w-[calc(50%-0.375rem)] min-w-[140px] flex-1 rounded-xl border border-white/10 bg-black/30 p-2"
                  >
                    <MediaThumb url={row.url} kind={row.kind} caption={row.label} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MediaThumb({
  url,
  kind,
  caption,
}: {
  url: string;
  kind: GraphMediaHint["kind"] | PublishedExemplarRow["kind"];
  caption: string;
}) {
  const isVideo = kind === "video";
  const isAudio = kind === "audio";
  if (isAudio) {
    return (
      <div>
        <audio src={url} controls className="mt-1 w-full" />
        <p className="mt-2 line-clamp-2 text-[10px] text-zinc-500">{caption}</p>
      </div>
    );
  }
  if (isVideo) {
    return (
      <div>
        <video src={url} controls playsInline className="mt-1 max-h-36 w-full rounded-lg bg-black" />
        <p className="mt-2 line-clamp-2 text-[10px] text-zinc-500">{caption}</p>
      </div>
    );
  }
  if (url.startsWith("data:")) {
    return (
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="mt-1 max-h-36 w-full rounded-lg object-cover" />
        <p className="mt-2 line-clamp-2 text-[10px] text-zinc-500">{caption}</p>
      </div>
    );
  }
  return (
    <div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="mt-1 max-h-36 w-full rounded-lg object-cover" />
      <p className="mt-2 line-clamp-2 text-[10px] text-zinc-500">{caption}</p>
    </div>
  );
}
