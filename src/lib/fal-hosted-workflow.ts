import type { FalClient } from "@/lib/fal-client";
import { falLogError, falLogInfo, isFalLogVerbose } from "@/lib/fal-server-log";

/** fal-hosted workflow pipeline IDs use the `workflows/...` namespace (stream API). */
export function isFalHostedWorkflowEndpoint(endpointId: string): boolean {
  return endpointId.startsWith("workflows/");
}

export type WorkflowStreamEventSummary = {
  type?: string;
  node_id?: string;
  app_id?: string;
  message?: string;
};

function summarizeWorkflowEvent(ev: unknown): WorkflowStreamEventSummary | null {
  if (!ev || typeof ev !== "object") return null;
  const o = ev as Record<string, unknown>;
  return {
    type: typeof o.type === "string" ? o.type : undefined,
    node_id: typeof o.node_id === "string" ? o.node_id : undefined,
    app_id: typeof o.app_id === "string" ? o.app_id : undefined,
    message: typeof o.message === "string" ? o.message : undefined,
  };
}

export type FalHostedWorkflowResult =
  | { ok: true; finalOutput: unknown; events: WorkflowStreamEventSummary[] }
  | { ok: false; error: string };

export type FalHostedWorkflowStreamCtx = {
  runId?: string;
  stepId?: string;
};

/**
 * Runs a fal workflow endpoint via `fal.stream` and collects the final output payload.
 * Used by the orchestrator for `workflows/*` ids; individual models keep using `queue.submit`.
 */
export async function runFalHostedWorkflowStream(
  fal: FalClient,
  endpointId: string,
  input: Record<string, unknown>,
  ctx?: FalHostedWorkflowStreamCtx,
): Promise<FalHostedWorkflowResult> {
  const events: WorkflowStreamEventSummary[] = [];
  let lastWorkflowError: string | null = null;
  let finalOutput: unknown = null;

  try {
    const stream = await fal.stream(endpointId, { input });
    for await (const ev of stream) {
      const s = summarizeWorkflowEvent(ev);
      if (s) events.push(s);
      if (ev && typeof ev === "object") {
        const o = ev as Record<string, unknown>;
        if (o.type === "error") {
          lastWorkflowError = String(o.message ?? "workflow error");
        }
        if (o.type === "output" && o.output != null) {
          finalOutput = o.output;
        }
      }
    }
    const doneData = await stream.done();
    if (doneData && typeof doneData === "object") {
      const d = doneData as Record<string, unknown>;
      if (d.type === "error") {
        lastWorkflowError = String(d.message ?? "workflow error");
      }
      if (finalOutput == null && d.type === "output" && d.output != null) {
        finalOutput = d.output;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    falLogError("fal.workflow.stream.exception", {
      endpointId,
      ...(ctx?.runId ? { runId: ctx.runId } : {}),
      ...(ctx?.stepId ? { stepId: ctx.stepId } : {}),
      error: msg,
    });
    return { ok: false, error: msg };
  }

  if (lastWorkflowError) {
    falLogError("fal.workflow.stream.workflow_error", {
      endpointId,
      ...(ctx?.runId ? { runId: ctx.runId } : {}),
      ...(ctx?.stepId ? { stepId: ctx.stepId } : {}),
      error: lastWorkflowError,
    });
    return { ok: false, error: lastWorkflowError };
  }
  if (isFalLogVerbose()) {
    falLogInfo("fal.workflow.stream.verbose", {
      endpointId,
      ...(ctx?.runId ? { runId: ctx.runId } : {}),
      ...(ctx?.stepId ? { stepId: ctx.stepId } : {}),
      streamEventCount: events.length,
    });
  }
  return { ok: true, finalOutput, events };
}
