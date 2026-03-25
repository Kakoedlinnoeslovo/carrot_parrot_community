import type { WorkflowGraph, WorkflowNode } from "@/lib/workflow-graph";
import { parseWorkflowGraph } from "@/lib/workflow-graph";
import { prisma } from "@/lib/db";
import { getAppUrl } from "@/lib/env";
import { fal } from "@/lib/fal-client";

type Artifact = { text?: string; images: string[] };

/** Pull image URLs from fal model output (queue result or webhook payload). */
export function extractImageUrlsFromFalData(data: unknown): string[] {
  if (data == null || typeof data !== "object") return [];
  const o = data as Record<string, unknown>;
  const images = o.images;
  if (!Array.isArray(images)) return [];
  const urls: string[] = [];
  for (const item of images) {
    if (
      item &&
      typeof item === "object" &&
      "url" in item &&
      typeof (item as { url: unknown }).url === "string"
    ) {
      urls.push((item as { url: string }).url);
    }
  }
  return urls;
}

async function continueRunAfterFalOutput(runId: string) {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { workflow: true },
  });
  if (!run) return;
  const graph = parseWorkflowGraph(run.workflow.graphJson);
  await scheduleReadyFalSteps(runId, graph);
  await finalizeRunIfDone(runId);
}

/**
 * fal cannot POST to localhost — webhooks only work with a public URL.
 * Poll the queue until the request completes, then persist outputs (idempotent with webhooks).
 */
async function pollFalUntilComplete(
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
    const urls = extractImageUrlsFromFalData(res.data);

    const step = await prisma.runStep.findFirst({ where: { id: stepId, runId } });
    if (!step || step.status === "succeeded") {
      return;
    }

    await prisma.runStep.update({
      where: { id: stepId },
      data: {
        status: "succeeded",
        outputsJson: JSON.stringify({
          text: undefined,
          images: urls,
        } satisfies Artifact),
      },
    });

    await continueRunAfterFalOutput(runId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
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

function parseArtifacts(json: string | null | undefined): Artifact {
  if (!json) return { images: [] };
  try {
    const o = JSON.parse(json) as { text?: string; images?: string[] };
    return { text: o.text, images: Array.isArray(o.images) ? o.images : [] };
  } catch {
    return { images: [] };
  }
}

function predecessors(graph: WorkflowGraph, nodeId: string): string[] {
  return graph.edges.filter((e) => e.target === nodeId).map((e) => e.source);
}

function buildMergedPrompt(node: Extract<WorkflowNode, { type: "fal_model" }>, parentArtifacts: Artifact[]): string {
  let p = node.data.prompt;
  for (const a of parentArtifacts) {
    if (a.text) p = `${a.text}\n${p}`;
    if (a.images.length) {
      p += `\n(Reference images: ${a.images.join(", ")})`;
    }
  }
  return p.trim();
}

export async function processRun(runId: string) {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { workflow: true, steps: true },
  });
  if (!run) return;
  if (run.status === "succeeded" || run.status === "failed") return;

  await prisma.run.update({ where: { id: runId }, data: { status: "running" } });

  const graph = parseWorkflowGraph(run.workflow.graphJson);

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
  }

  await scheduleReadyFalSteps(runId, graph);
  await finalizeRunIfDone(runId);
}

async function scheduleReadyFalSteps(runId: string, graph: WorkflowGraph) {
  if (!process.env.FAL_KEY) {
    const needsFal = graph.nodes.some((n) => n.type === "fal_model");
    if (needsFal) {
      await failRun(
        runId,
        "FAL_KEY is not configured. Add it to run image generation nodes.",
      );
    }
    return;
  }

  const steps = await prisma.runStep.findMany({ where: { runId } });
  const byNode = Object.fromEntries(steps.map((s) => [s.nodeId, s]));

  for (const node of graph.nodes) {
    if (node.type !== "fal_model") continue;
    const step = byNode[node.id];
    if (!step || step.status !== "pending") continue;

    const preds = predecessors(graph, node.id);
    const predArtifacts = preds.map((pid) => {
      const sj = byNode[pid]?.outputsJson;
      return parseArtifacts(sj);
    });

    const predOk =
      preds.length === 0 ||
      preds.every((pid) => byNode[pid]?.status === "succeeded");
    if (!predOk) continue;

    const prompt = buildMergedPrompt(node, predArtifacts);
    const inputsJson = JSON.stringify({ prompt, falModelId: node.data.falModelId });

    await prisma.runStep.update({
      where: { id: step.id },
      data: { status: "running", inputsJson },
    });

    const webhookUrl = `${getAppUrl()}/api/webhooks/fal?runId=${encodeURIComponent(runId)}&stepId=${encodeURIComponent(
      step.id,
    )}`;

    try {
      const queued = await fal.queue.submit(node.data.falModelId, {
        input: { prompt, num_images: 1 },
        webhookUrl,
      });
      await prisma.runStep.update({
        where: { id: step.id },
        data: { falRequestId: queued.request_id },
      });

      void pollFalUntilComplete(runId, step.id, node.data.falModelId, queued.request_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
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

  let urls: string[] = [];
  if (b?.status === "OK" && b.payload != null) {
    urls = extractImageUrlsFromFalData(b.payload);
  } else if (b?.payload != null) {
    urls = extractImageUrlsFromFalData(b.payload);
  }
  if (urls.length === 0) {
    urls = extractImageUrlsFromFalData(body);
  }

  if (urls.length === 0 && b?.status !== "OK") {
    if (process.env.NODE_ENV === "development") {
      console.warn("[fal webhook] Unrecognized body; keys:", body && typeof body === "object" ? Object.keys(body) : []);
    }
    await prisma.runStep.update({
      where: { id: stepId },
      data: { status: "failed", error: "Unexpected webhook payload (no images)" },
    });
    await failRun(runId, "Unexpected webhook payload (no images)");
    return;
  }

  await prisma.runStep.update({
    where: { id: stepId },
    data: {
      status: "succeeded",
      outputsJson: JSON.stringify({
        text: undefined,
        images: urls,
      } satisfies Artifact),
    },
  });

  await continueRunAfterFalOutput(runId);
}
