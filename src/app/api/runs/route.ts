import { NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { assertCanRunWorkflow, bumpDailyRunCount } from "@/lib/guardrails";
import { processRun } from "@/lib/orchestrator";
import { graphNeedsFalKey, hasEffectiveFalApiKey } from "@/lib/fal-effective-key";
import { assertAcyclic, safeParseWorkflowGraph } from "@/lib/workflow-graph";
import { z } from "zod";

const postSchema = z.object({
  workflowId: z.string().min(1),
  /** When true, every fal_model step calls fal (no copy from a prior run). */
  forceFullRerun: z.boolean().optional(),
  /** Optional succeeded run to match inputs against; defaults to latest succeeded run for this workflow. */
  reuseFromRunId: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await req.json();
  const parsed = postSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const wf = await prisma.workflow.findFirst({
    where: { id: parsed.data.workflowId, userId: session.user.id },
  });
  if (!wf) {
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  }

  const graphParsed = safeParseWorkflowGraph(wf.graphJson);
  if (!graphParsed.success) {
    return NextResponse.json({ error: "Stored workflow graph is invalid" }, { status: 400 });
  }
  const graph = graphParsed.data;
  assertAcyclic(graph);

  if (graphNeedsFalKey(graph)) {
    const hasKey = await hasEffectiveFalApiKey(session.user.id);
    if (!hasKey) {
      return NextResponse.json(
        {
          error:
            "Add your fal.ai API key in onboarding or Settings (or set FAL_KEY on the server for operator-funded runs).",
        },
        { status: 400 },
      );
    }
  }

  try {
    await assertCanRunWorkflow(session.user.id, session.user.email, graph);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Guardrail rejected run";
    return NextResponse.json({ error: msg }, { status: 429 });
  }

  await bumpDailyRunCount(session.user.id);

  let reuseReferenceRunId: string | null = null;
  const forceFull = parsed.data.forceFullRerun ?? false;
  if (!forceFull && parsed.data.reuseFromRunId) {
    const ref = await prisma.run.findFirst({
      where: {
        id: parsed.data.reuseFromRunId,
        workflowId: wf.id,
        userId: session.user.id,
        status: "succeeded",
      },
    });
    if (!ref) {
      return NextResponse.json(
        { error: "reuseFromRunId not found or is not a succeeded run for this workflow" },
        { status: 400 },
      );
    }
    reuseReferenceRunId = ref.id;
  }

  const run = await prisma.$transaction(async (tx) => {
    const r = await tx.run.create({
      data: {
        workflowId: wf.id,
        userId: session.user.id,
        status: "pending",
        skipStepReuse: forceFull,
        reuseReferenceRunId,
      },
    });
    await tx.runStep.createMany({
      data: graph.nodes.map((n) => ({
        runId: r.id,
        nodeId: n.id,
        status: "pending",
      })),
    });
    return r;
  });

  after(async () => {
    try {
      await processRun(run.id);
    } catch (e) {
      console.error("processRun failed", e);
      await prisma.run.update({
        where: { id: run.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: e instanceof Error ? e.message : String(e),
        },
      });
    }
  });

  return NextResponse.json({ runId: run.id });
}
