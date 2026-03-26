import type { WorkflowGraph } from "@/lib/workflow-graph";
import { parseWorkflowGraph } from "@/lib/workflow-graph";
import { prisma } from "@/lib/db";
import { getAppUrl } from "@/lib/env";
import {
  createFalClientFromApiKey,
  formatFalClientError,
  type FalClient,
} from "@/lib/fal-client";
import { resolveEffectiveFalApiKey } from "@/lib/fal-effective-key";
import { isFalEndpointIdAllowed } from "@/lib/fal-model-policy";
import { isFalHostedWorkflowEndpoint, runFalHostedWorkflowStream } from "@/lib/fal-hosted-workflow";
import {
  mergeFalInput,
  sanitizeFalInput,
  type MergeArtifact,
} from "@/lib/fal-merge-input";
import { canReuseFalStepFromPrevious } from "@/lib/fal-step-reuse";
import type { RunStep as PrismaRunStep } from "@prisma/client";
import {
  type Artifact,
  type MediaItem,
  parseArtifactJson,
} from "@/lib/artifact-json";
import { pickWorkflowCoverFromRunSteps } from "@/lib/workflow-cover-from-run";

export type { Artifact, MediaItem } from "@/lib/artifact-json";

/** Pull media URLs from fal model output (queue result or webhook payload). */
export function extractMediaFromFalData(data: unknown): MediaItem[] {
  const out: MediaItem[] = [];
  const seen = new Set<string>();

  function addUrl(url: string, kind: MediaItem["kind"]) {
    if (!url.startsWith("http") || seen.has(url)) return;
    seen.add(url);
    out.push({ url, kind });
  }

  function guessKindFromUrl(url: string): MediaItem["kind"] {
    const u = url.split("?")[0]?.toLowerCase() ?? "";
    if (/\.(mp4|webm|mov|m4v)(\?|$)/.test(u)) return "video";
    if (/\.(mp3|wav|m4a|aac|ogg)(\?|$)/.test(u)) return "audio";
    if (/\.(png|jpe?g|webp|gif)(\?|$)/.test(u)) return "image";
    return "unknown";
  }

  function walk(v: unknown, depth: number) {
    if (depth > 14) return;
    if (v == null) return;
    if (typeof v === "string") {
      if (/^https?:\/\//.test(v)) {
        addUrl(v, guessKindFromUrl(v));
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.url === "string" && /^https?:\/\//.test(o.url)) {
        const ct = typeof o.content_type === "string" ? o.content_type : "";
        let kind: MediaItem["kind"] = guessKindFromUrl(o.url);
        if (ct.startsWith("video/")) kind = "video";
        else if (ct.startsWith("audio/")) kind = "audio";
        else if (ct.startsWith("image/")) kind = "image";
        addUrl(o.url, kind);
      }
      for (const k of Object.keys(o)) {
        walk(o[k], depth + 1);
      }
    }
  }

  walk(data, 0);
  return out;
}

/** Legacy helper: image file URLs only. */
export function extractImageUrlsFromFalData(data: unknown): string[] {
  return extractMediaFromFalData(data)
    .filter((m) => m.kind === "image" || m.kind === "unknown")
    .map((m) => m.url);
}

function isNonUrlString(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && !/^https?:\/\//i.test(t);
}

/** OpenAI-style message.content: string or array of { type, text } blocks. */
function textFromOpenAiMessageContent(content: unknown): string | undefined {
  if (typeof content === "string") {
    const t = content.trim();
    return t || undefined;
  }
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === "string") {
      const t = block.trim();
      if (t) parts.push(t);
    } else if (block && typeof block === "object" && !Array.isArray(block)) {
      const b = block as Record<string, unknown>;
      if (typeof b.text === "string" && b.text.trim()) parts.push(b.text.trim());
    }
  }
  const joined = parts.join("\n").trim();
  return joined || undefined;
}

/**
 * Plain-text completion from fal queue / webhook payloads (VLMs, LLMs).
 * openrouter/router/vision usually returns `{ output: string, usage: ... }`; queue payloads may nest
 * or use chat-shaped `choices[].message.content` (string or content-part array).
 */
export function extractTextFromFalData(data: unknown, depth = 0): string | undefined {
  if (data == null || depth > 12) return undefined;
  if (typeof data === "string") {
    const t = data.trim();
    return isNonUrlString(t) ? t : undefined;
  }
  if (typeof data !== "object" || Array.isArray(data)) return undefined;
  const o = data as Record<string, unknown>;

  const stringKeyOrder = [
    "output",
    "text",
    "content",
    "caption",
    "description",
    "answer",
    "response",
    "completion",
  ] as const;
  for (const k of stringKeyOrder) {
    const v = o[k];
    if (typeof v === "string" && isNonUrlString(v)) return v.trim();
  }

  if (typeof o.output === "object" && o.output != null && !Array.isArray(o.output)) {
    const inner = extractTextFromFalData(o.output, depth + 1);
    if (inner) return inner;
  }

  if (typeof o.message === "object" && o.message != null && !Array.isArray(o.message)) {
    const msg = o.message as Record<string, unknown>;
    const fromContent = textFromOpenAiMessageContent(msg.content);
    if (fromContent) return fromContent;
  }

  const choices = o.choices;
  if (Array.isArray(choices) && choices[0] != null && typeof choices[0] === "object") {
    const c0 = choices[0] as Record<string, unknown>;
    const msg = c0.message;
    if (msg != null && typeof msg === "object" && !Array.isArray(msg)) {
      const fromContent = textFromOpenAiMessageContent((msg as Record<string, unknown>).content);
      if (fromContent) return fromContent;
    }
  }

  for (const k of ["data", "result", "response", "body", "payload"] as const) {
    const v = o[k];
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      const inner = extractTextFromFalData(v, depth + 1);
      if (inner) return inner;
    }
  }

  return undefined;
}

async function runHostedWorkflowStep(
  fal: FalClient,
  runId: string,
  stepId: string,
  endpointId: string,
  mergedInput: Record<string, unknown>,
) {
  const existing = await prisma.runStep.findFirst({ where: { id: stepId, runId } });
  if (!existing || existing.status !== "running") return;

  const result = await runFalHostedWorkflowStream(fal, endpointId, mergedInput);

  const step = await prisma.runStep.findFirst({ where: { id: stepId, runId } });
  if (!step || step.status === "succeeded") return;

  if (!result.ok) {
    await prisma.runStep.update({
      where: { id: stepId },
      data: { status: "failed", error: result.error },
    });
    await prisma.run.update({
      where: { id: runId },
      data: { status: "failed", finishedAt: new Date(), error: result.error },
    });
    return;
  }

  const media = extractMediaFromFalData(result.finalOutput);
  const images = media.filter((m) => m.kind === "image" || m.kind === "unknown").map((m) => m.url);

  if (media.length === 0) {
    const err = "Workflow finished but no media URLs were found in the output.";
    await prisma.runStep.update({
      where: { id: stepId },
      data: { status: "failed", error: err },
    });
    await prisma.run.update({
      where: { id: runId },
      data: { status: "failed", finishedAt: new Date(), error: err },
    });
    return;
  }

  const workflowEvents = result.events.slice(-48);

  await prisma.runStep.update({
    where: { id: stepId },
    data: {
      status: "succeeded",
      outputsJson: JSON.stringify({
        text: undefined,
        images,
        media,
        workflowEvents,
      } satisfies Artifact),
    },
  });

  await continueRunAfterFalOutput(runId);
}

async function continueRunAfterFalOutput(runId: string) {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { workflow: true },
  });
  if (!run) return;
  const graph = parseWorkflowGraph(run.workflow.graphJson);
  const key = await resolveEffectiveFalApiKey(run.userId);
  const fal = key ? createFalClientFromApiKey(key) : null;
  await scheduleReadyFalSteps(runId, graph, fal);
  await schedulePassthroughSteps(runId, graph);
  await finalizeRunIfDone(runId);
}

/** Resolves `output_preview` nodes by copying upstream artifacts (no fal call). */
async function schedulePassthroughSteps(runId: string, graph: WorkflowGraph) {
  const steps = await prisma.runStep.findMany({ where: { runId } });
  const byNode = Object.fromEntries(steps.map((s) => [s.nodeId, s]));

  for (const node of graph.nodes) {
    if (node.type !== "output_preview") continue;
    const step = byNode[node.id];
    if (!step || step.status !== "pending") continue;

    const preds = predecessors(graph, node.id);
    if (preds.length === 0) {
      await prisma.runStep.update({
        where: { id: step.id },
        data: {
          status: "succeeded",
          inputsJson: JSON.stringify({}),
          outputsJson: JSON.stringify({
            text: undefined,
            images: [],
            media: [],
          } satisfies Artifact),
        },
      });
      continue;
    }

    const predOk = preds.every((pid) => byNode[pid]?.status === "succeeded");
    if (!predOk) continue;

    const first = preds[0]!;
    const upstream = byNode[first]?.outputsJson ?? null;
    await prisma.runStep.update({
      where: { id: step.id },
      data: {
        status: "succeeded",
        inputsJson: JSON.stringify({ fromNodeId: first }),
        outputsJson: upstream ?? JSON.stringify({ text: undefined, images: [], media: [] } satisfies Artifact),
      },
    });
  }
}

async function pollFalUntilComplete(
  fal: FalClient,
  runId: string,
  stepId: string,
  endpointId: string,
  requestId: string,
) {
  const existing = await prisma.runStep.findFirst({ where: { id: stepId, runId } });
  if (!existing || existing.status === "succeeded" || existing.status === "failed") return;

  try {
    await fal.queue.subscribeToStatus(endpointId, { requestId });
    const res = await fal.queue.result(endpointId, { requestId });
    const media = extractMediaFromFalData(res.data);
    const images = media.filter((m) => m.kind === "image" || m.kind === "unknown").map((m) => m.url);
    const text = extractTextFromFalData(res.data);

    const step = await prisma.runStep.findFirst({ where: { id: stepId, runId } });
    if (!step || step.status === "succeeded") {
      return;
    }

    await prisma.runStep.update({
      where: { id: stepId },
      data: {
        status: "succeeded",
        outputsJson: JSON.stringify({
          text: text || undefined,
          images,
          media,
        } satisfies Artifact),
      },
    });

    await continueRunAfterFalOutput(runId);
  } catch (e) {
    const msg = formatFalClientError(e);
    const step = await prisma.runStep.findFirst({ where: { id: stepId, runId } });
    if (step?.status === "succeeded") {
      return;
    }
    await prisma.runStep.update({
      where: { id: stepId },
      data: { status: "failed", error: msg },
    });
    await prisma.run.update({
      where: { id: runId },
      data: { status: "failed", finishedAt: new Date(), error: msg },
    });
  }
}

function predecessors(graph: WorkflowGraph, nodeId: string): string[] {
  return graph.edges.filter((e) => e.target === nodeId).map((e) => e.source);
}

/**
 * Steps from a prior succeeded run (same workflow), keyed by nodeId, for reuse when inputs match.
 */
/** Exported for tests: prior-run steps used to skip unchanged fal_model nodes. */
export async function loadReuseReferenceStepsByNodeId(
  runId: string,
): Promise<Record<string, PrismaRunStep> | null> {
  const run = await prisma.run.findUnique({ where: { id: runId } });
  if (!run || run.skipStepReuse) return null;

  let refRunId: string | null = run.reuseReferenceRunId;

  if (refRunId) {
    const ref = await prisma.run.findFirst({
      where: {
        id: refRunId,
        workflowId: run.workflowId,
        userId: run.userId,
        status: "succeeded",
      },
    });
    if (!ref) return null;
    refRunId = ref.id;
  } else {
    const latest = await prisma.run.findFirst({
      where: {
        workflowId: run.workflowId,
        userId: run.userId,
        status: "succeeded",
        id: { not: runId },
      },
      orderBy: { finishedAt: "desc" },
    });
    refRunId = latest?.id ?? null;
  }

  if (!refRunId) return null;

  const refSteps = await prisma.runStep.findMany({ where: { runId: refRunId } });
  return Object.fromEntries(refSteps.map((s) => [s.nodeId, s]));
}

export async function processRun(runId: string) {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { workflow: true, steps: true },
  });
  if (!run) return;
  if (run.status === "succeeded" || run.status === "failed") return;

  const graph = parseWorkflowGraph(run.workflow.graphJson);
  const needsFal = graph.nodes.some((n) => n.type === "fal_model");
  const falKey = await resolveEffectiveFalApiKey(run.userId);
  if (needsFal && !falKey) {
    await failRun(
      runId,
      "Add your fal.ai API key in onboarding or Settings, or set FAL_KEY on the server.",
    );
    return;
  }
  const fal = falKey ? createFalClientFromApiKey(falKey) : null;

  await prisma.run.update({ where: { id: runId }, data: { status: "running" } });

  for (const node of graph.nodes) {
    if (node.type === "input_prompt") {
      const prompt = node.data.prompt ?? "";
      await prisma.runStep.updateMany({
        where: { runId, nodeId: node.id, status: "pending" },
        data: {
          status: "succeeded",
          inputsJson: JSON.stringify({}),
          outputsJson: JSON.stringify({ text: prompt, images: [] } satisfies Artifact),
        },
      });
    }
    if (node.type === "input_image") {
      const raw = (node.data.imageUrl ?? "").trim();
      const ok = /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw);
      const images = ok && raw ? [raw] : [];
      const media: MediaItem[] = ok && raw ? [{ url: raw, kind: "image" }] : [];
      await prisma.runStep.updateMany({
        where: { runId, nodeId: node.id, status: "pending" },
        data: {
          status: "succeeded",
          inputsJson: JSON.stringify({}),
          outputsJson: JSON.stringify({
            text: undefined,
            images,
            media,
          } satisfies Artifact),
        },
      });
    }
    if (node.type === "input_group") {
      const slots = node.data.slots ?? [];
      const images: string[] = [];
      const media: MediaItem[] = [];
      const textParts: string[] = [];
      for (const s of slots) {
        if (s.kind === "text") {
          const t = (s.value ?? "").trim();
          if (t) textParts.push(t);
        } else {
          const raw = (s.value ?? "").trim();
          const ok = /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw);
          if (ok && raw) {
            images.push(raw);
            media.push({ url: raw, kind: "image" });
          }
        }
      }
      const text = textParts.join("\n\n");
      await prisma.runStep.updateMany({
        where: { runId, nodeId: node.id, status: "pending" },
        data: {
          status: "succeeded",
          inputsJson: JSON.stringify({}),
          outputsJson: JSON.stringify({
            text: text || undefined,
            images,
            media,
          } satisfies Artifact),
        },
      });
    }
  }

  await schedulePassthroughSteps(runId, graph);
  await scheduleReadyFalSteps(runId, graph, fal);
  await finalizeRunIfDone(runId);
}

/** Exported for tests; also used by `processRun` and `continueRunAfterFalOutput`. */
export async function scheduleReadyFalSteps(
  runId: string,
  graph: WorkflowGraph,
  fal: FalClient | null,
) {
  const needsFal = graph.nodes.some((n) => n.type === "fal_model");
  if (needsFal && !fal) {
    await failRun(
      runId,
      "Add your fal.ai API key in onboarding or Settings, or set FAL_KEY on the server.",
    );
    return;
  }

  const reuseMap = await loadReuseReferenceStepsByNodeId(runId);
  let steps = await prisma.runStep.findMany({ where: { runId } });

  if (reuseMap) {
    while (true) {
      const byNode = Object.fromEntries(steps.map((s) => [s.nodeId, s]));
      let anyReuse = false;

      for (const node of graph.nodes) {
        if (node.type !== "fal_model") continue;
        const step = byNode[node.id];
        if (!step || step.status !== "pending") continue;

        const preds = predecessors(graph, node.id);
        const predOk =
          preds.length === 0 ||
          preds.every((pid) => byNode[pid]?.status === "succeeded");
        if (!predOk) continue;

        if (!isFalEndpointIdAllowed(node.data.falModelId)) {
          await prisma.runStep.update({
            where: { id: step.id },
            data: {
              status: "failed",
              error: "Model is not allowed by server policy (FAL_MODEL_ALLOWLIST / FAL_MODEL_DENYLIST).",
            },
          });
          await prisma.run.update({
            where: { id: runId },
            data: { status: "failed", finishedAt: new Date(), error: "Blocked model endpoint" },
          });
          return;
        }

        const artifactByNodeId: Record<string, MergeArtifact | undefined> = Object.fromEntries(
          steps.map((s) => [s.nodeId, parseArtifactJson(s.outputsJson) as MergeArtifact]),
        );
        const mergedInput = sanitizeFalInput(mergeFalInput(node, graph, artifactByNodeId));
        const payload = {
          falModelId: node.data.falModelId,
          falInput: mergedInput,
        };
        const inputsJson = JSON.stringify(payload);

        const prev = reuseMap[node.id];
        if (canReuseFalStepFromPrevious(prev, payload)) {
          await prisma.runStep.update({
            where: { id: step.id },
            data: {
              status: "succeeded",
              inputsJson,
              outputsJson: prev!.outputsJson,
              error: null,
            },
          });
          const i = steps.findIndex((s) => s.id === step.id);
          if (i >= 0) {
            steps[i] = {
              ...steps[i],
              status: "succeeded",
              inputsJson,
              outputsJson: prev!.outputsJson,
              error: null,
            };
          }
          anyReuse = true;
        }
      }

      if (!anyReuse) break;

      await schedulePassthroughSteps(runId, graph);
      await finalizeRunIfDone(runId);
      steps = await prisma.runStep.findMany({ where: { runId } });
    }
  }

  steps = await prisma.runStep.findMany({ where: { runId } });
  const byNode = Object.fromEntries(steps.map((s) => [s.nodeId, s]));

  for (const node of graph.nodes) {
    if (node.type !== "fal_model") continue;
    const step = byNode[node.id];
    if (!step || step.status !== "pending") continue;

    const preds = predecessors(graph, node.id);
    const predOk =
      preds.length === 0 ||
      preds.every((pid) => byNode[pid]?.status === "succeeded");
    if (!predOk) continue;

    if (!isFalEndpointIdAllowed(node.data.falModelId)) {
      await prisma.runStep.update({
        where: { id: step.id },
        data: {
          status: "failed",
          error: "Model is not allowed by server policy (FAL_MODEL_ALLOWLIST / FAL_MODEL_DENYLIST).",
        },
      });
      await prisma.run.update({
        where: { id: runId },
        data: { status: "failed", finishedAt: new Date(), error: "Blocked model endpoint" },
      });
      return;
    }

    const artifactByNodeId: Record<string, MergeArtifact | undefined> = Object.fromEntries(
      steps.map((s) => [s.nodeId, parseArtifactJson(s.outputsJson) as MergeArtifact]),
    );
    const mergedInput = sanitizeFalInput(mergeFalInput(node, graph, artifactByNodeId));
    const inputsJson = JSON.stringify({
      falModelId: node.data.falModelId,
      falInput: mergedInput,
    });

    await prisma.runStep.update({
      where: { id: step.id },
      data: { status: "running", inputsJson },
    });

    if (isFalHostedWorkflowEndpoint(node.data.falModelId)) {
      void runHostedWorkflowStep(fal!, runId, step.id, node.data.falModelId, mergedInput);
      continue;
    }

    const webhookUrl = `${getAppUrl()}/api/webhooks/fal?runId=${encodeURIComponent(runId)}&stepId=${encodeURIComponent(
      step.id,
    )}`;

    try {
      const queued = await fal!.queue.submit(node.data.falModelId, {
        input: mergedInput,
        webhookUrl,
      });
      await prisma.runStep.update({
        where: { id: step.id },
        data: { falRequestId: queued.request_id },
      });

      void pollFalUntilComplete(fal!, runId, step.id, node.data.falModelId, queued.request_id);
    } catch (e) {
      const msg = formatFalClientError(e);
      await prisma.runStep.update({
        where: { id: step.id },
        data: { status: "failed", error: msg },
      });
      await prisma.run.update({
        where: { id: runId },
        data: { status: "failed", finishedAt: new Date(), error: msg },
      });
    }
  }
}

async function failRun(runId: string, error: string) {
  await prisma.run.update({
    where: { id: runId },
    data: { status: "failed", finishedAt: new Date(), error },
  });
}

async function finalizeRunIfDone(runId: string) {
  const steps = await prisma.runStep.findMany({ where: { runId } });
  if (steps.some((s) => s.status === "failed")) {
    const err = steps.find((s) => s.status === "failed")?.error ?? "Step failed";
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: err,
      },
    });
    return;
  }

  if (steps.length > 0 && steps.every((s) => s.status === "succeeded")) {
    await prisma.run.update({
      where: { id: runId },
      data: { status: "succeeded", finishedAt: new Date() },
    });

    const run = await prisma.run.findUnique({
      where: { id: runId },
      select: {
        userId: true,
        workflowId: true,
        workflow: { select: { userId: true } },
      },
    });
    if (run?.workflow && run.userId === run.workflow.userId) {
      const ordered = await prisma.runStep.findMany({
        where: { runId },
        orderBy: { createdAt: "asc" },
        select: { outputsJson: true, createdAt: true },
      });
      const cover = pickWorkflowCoverFromRunSteps(ordered);
      if (cover) {
        await prisma.workflow.update({
          where: { id: run.workflowId },
          data: {
            coverImageUrl: cover.url,
            coverPreviewKind: cover.kind,
          },
        });
      }
    }
  }
}

export async function handleFalWebhook(runId: string, stepId: string, body: unknown) {
  const step = await prisma.runStep.findFirst({
    where: { id: stepId, runId },
  });
  if (!step) return;

  if (step.status === "succeeded") {
    return;
  }

  const b = body as Record<string, unknown>;

  if (b?.status === "ERROR") {
    const err = String(b.error ?? "fal error");
    await prisma.runStep.update({
      where: { id: stepId },
      data: {
        status: "failed",
        error: err,
      },
    });
    await prisma.run.update({
      where: { id: runId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        error: err,
      },
    });
    return;
  }

  let payload: unknown = null;
  if (b?.status === "OK" && b.payload != null) {
    payload = b.payload;
  } else if (b?.payload != null) {
    payload = b.payload;
  } else {
    payload = body;
  }

  const media = extractMediaFromFalData(payload);
  const images = media.filter((m) => m.kind === "image" || m.kind === "unknown").map((m) => m.url);
  const text = extractTextFromFalData(payload);

  if (media.length === 0 && text == null && b?.status !== "OK") {
    if (process.env.NODE_ENV === "development") {
      console.warn("[fal webhook] Unrecognized body; keys:", body && typeof body === "object" ? Object.keys(body) : []);
    }
    await prisma.runStep.update({
      where: { id: stepId },
      data: { status: "failed", error: "Unexpected webhook payload (no media URLs)" },
    });
    await failRun(runId, "Unexpected webhook payload (no media URLs)");
    return;
  }

  await prisma.runStep.update({
    where: { id: stepId },
    data: {
      status: "succeeded",
      outputsJson: JSON.stringify({
        text: text || undefined,
        images,
        media,
      } satisfies Artifact),
    },
  });

  await continueRunAfterFalOutput(runId);
}
