import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type RouteCtx = { params: Promise<{ runId: string }> };

/**
 * POST `/api/runs/[runId]/cancel` — cancel a running/pending workflow run.
 *
 * Sets the run status to "cancelled", marks all pending/running steps as "cancelled",
 * and records the finish time. In-flight fal polling loops detect the cancelled step
 * status and exit early on their next iteration.
 */
export async function POST(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { runId } = await ctx.params;

  const run = await prisma.run.findFirst({
    where: { id: runId, userId: session.user.id },
  });
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (run.status !== "pending" && run.status !== "running") {
    return NextResponse.json({ error: "Run is not active" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.run.update({
      where: { id: runId },
      data: { status: "cancelled", finishedAt: new Date() },
    }),
    prisma.runStep.updateMany({
      where: { runId, status: { in: ["pending", "running"] } },
      data: { status: "cancelled" },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
