"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Node,
  type NodeProps,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nanoid } from "nanoid";
import { graphToFlow, flowToGraph } from "@/lib/flow-adapter";
import type { WorkflowGraph } from "@/lib/workflow-graph";

function InputPromptNode({ id, data }: NodeProps) {
  const d = data as { prompt?: string };
  return (
    <div className="min-w-[200px] rounded-lg border border-zinc-600 bg-zinc-900/90 px-3 py-2 shadow-lg">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-emerald-400">Input</div>
      <div className="text-xs text-zinc-400">Node {id.slice(0, 8)}…</div>
      <p className="mt-1 line-clamp-3 text-sm text-zinc-200">{d.prompt || "—"}</p>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-emerald-500" />
    </div>
  );
}

function FalModelNode({ id, data }: NodeProps) {
  const d = data as { prompt?: string; falModelId?: string };
  return (
    <div className="min-w-[220px] rounded-lg border border-zinc-600 bg-zinc-900/90 px-3 py-2 shadow-lg">
      <Handle type="target" position={Position.Left} className="!h-3 !w-3 !bg-amber-500" />
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-amber-400">fal</div>
      <div className="truncate text-xs text-zinc-500">
        {d.falModelId} · {id.slice(0, 6)}…
      </div>
      <p className="mt-1 line-clamp-4 text-sm text-zinc-200">{d.prompt || "—"}</p>
      <Handle type="source" position={Position.Right} className="!h-3 !w-3 !bg-amber-500" />
    </div>
  );
}

const nodeTypes = {
  input_prompt: InputPromptNode,
  fal_model: FalModelNode,
};

type Props = {
  workflowId: string;
  initialGraph: WorkflowGraph;
  title: string;
  visibility: string;
  slug: string | null;
};

export function WorkflowEditor({ workflowId, initialGraph, title, visibility, slug }: Props) {
  const initial = useMemo(() => graphToFlow(initialGraph), [initialGraph]);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wfTitle, setWfTitle] = useState(title);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [pubSlug, setPubSlug] = useState<string | null>(slug);
  const [pubVis, setPubVis] = useState(visibility);
  const [outputUrls, setOutputUrls] = useState<string[]>([]);
  const [outputsMissing, setOutputsMissing] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? null;

  const deleteNodesById = useCallback(
    (ids: Set<string>) => {
      if (ids.size === 0) return;
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

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, id: `e-${nanoid(8)}` }, eds)),
    [setEdges],
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
      setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
    }
  }, [nodes, edges, workflowId, wfTitle]);

  const addNode = (kind: "input_prompt" | "fal_model") => {
    const id = nanoid(10);
    const y = 40 + nodes.length * 28;
    const base: Node = {
      id,
      position: { x: 120 + (nodes.length % 3) * 40, y },
      type: kind,
      data:
        kind === "input_prompt"
          ? { prompt: "" }
          : { prompt: "Describe the image", falModelId: "fal-ai/flux/schnell" },
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
          steps?: { outputsJson?: string | null }[];
        };
      };
      setRunStatus(data.run.status);
      setRunError(data.run.error);
      if (data.run.status === "succeeded" || data.run.status === "failed") {
        clearInterval(t);
        if (data.run.status === "succeeded") {
          const collect = (steps: { outputsJson?: string | null }[]) => {
            const imgs: string[] = [];
            for (const s of steps) {
              if (!s.outputsJson) continue;
              try {
                const o = JSON.parse(s.outputsJson) as { images?: string[] };
                if (o.images?.length) imgs.push(...o.images);
              } catch {
                /* ignore */
              }
            }
            return imgs;
          };
          let imgs = collect(data.run.steps ?? []);
          if (imgs.length === 0) {
            const r2 = await fetch(`/api/runs/${runId}`);
            if (r2.ok) {
              const d2 = (await r2.json()) as {
                run: { steps?: { outputsJson?: string | null }[] };
              };
              imgs = collect(d2.run.steps ?? []);
            }
          }
          setOutputUrls(imgs);
          setOutputsMissing(imgs.length === 0);
        }
      }
    }, 1500);
    return () => clearInterval(t);
  }, [runId]);

  const publish = async () => {
    await save();
    const res = await fetch(`/api/workflows/${workflowId}/publish`, { method: "POST" });
    const j = (await res.json()) as { workflow?: { slug?: string | null }; error?: string };
    if (!res.ok) {
      alert(j.error ?? "Publish failed");
      return;
    }
    setPubVis("published");
    if (j.workflow?.slug) setPubSlug(j.workflow.slug);
  };

  const runWorkflow = async () => {
    await save();
    setOutputUrls([]);
    setOutputsMissing(false);
    setRunError(null);
    setRunStatus("pending");
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId }),
    });
    const j = (await res.json()) as { runId?: string; error?: string };
    if (!res.ok) {
      setRunStatus("failed");
      setRunError(j.error ?? "Run failed");
      return;
    }
    setRunId(j.runId!);
    setRunStatus("running");
  };

  const updateSelectedData = (patch: Record<string, string>) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id ? { ...n, data: { ...n.data, ...patch } } : n,
      ),
    );
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col md:flex-row">
      <div className="relative min-h-[360px] flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          deleteKeyCode={["Backspace", "Delete"]}
          onNodeClick={(_, n) => {
            setSelectedId(n.id);
            setNodes((nds) =>
              nds.map((node) => ({ ...node, selected: node.id === n.id })),
            );
          }}
          onPaneClick={() => {
            setSelectedId(null);
            setNodes((nds) => nds.map((node) => ({ ...node, selected: false })));
          }}
          onNodesDelete={(deleted) => {
            deleteNodesById(new Set(deleted.map((n) => n.id)));
          }}
          fitView
          className="bg-zinc-950"
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#333" />
          <MiniMap className="!bg-zinc-900" />
          <Controls className="!bg-zinc-900 !text-zinc-200 !border-zinc-700" />
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
              onClick={() => addNode("fal_model")}
              className="rounded-md bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-zinc-600 hover:bg-zinc-700"
            >
              + fal model
            </button>
          </div>
        </div>
      </div>

      <aside className="w-full border-t border-zinc-800 bg-zinc-950 p-4 md:w-80 md:border-l md:border-t-0">
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
            className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-white"
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
            The server polls fal when your app is not reachable by webhooks (e.g. localhost).
          </p>
          {runStatus && (
            <p className="mt-2 text-sm text-zinc-300">
              Status: <span className="text-orange-400">{runStatus}</span>
            </p>
          )}
          {runError && <p className="mt-1 text-xs text-red-400">{runError}</p>}
          {runStatus === "succeeded" && outputsMissing && (
            <p className="mt-2 text-xs text-amber-500/90">
              Run finished but no image URLs were stored. Check FAL_KEY, fal logs, and server terminal
              for errors.
            </p>
          )}
          {outputUrls.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {outputUrls.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt="Output"
                  className="max-h-40 rounded border border-zinc-700"
                />
              ))}
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
          {selectedNode?.type === "fal_model" && (
            <div className="mt-2 space-y-2">
              <label className="text-xs text-zinc-500">Model</label>
              <select
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                value={String((selectedNode.data as { falModelId?: string }).falModelId)}
                onChange={(e) => updateSelectedData({ falModelId: e.target.value })}
              >
                <option value="fal-ai/flux/schnell">fal-ai/flux/schnell</option>
              </select>
              <label className="text-xs text-zinc-500">Prompt</label>
              <textarea
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                rows={4}
                value={String((selectedNode.data as { prompt?: string }).prompt ?? "")}
                onChange={(e) => updateSelectedData({ prompt: e.target.value })}
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
