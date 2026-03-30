/**
 * GET `/api/runs/[runId]` — load one run (with steps + workflow title) for the signed-in owner.
 *
 * Python/Flask analogy: a view that reads `runId` from the URL, checks the session user id,
 * then returns JSON or 404. In App Router, dynamic segments use `[runId]` folders; `ctx.params`
 * is async (`Promise`) in recent Next — `await ctx.params` like awaiting a coroutine that
 * resolves to `{ runId: string }`.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type RouteCtx = { params: Promise<{ runId: string }> };

/** Returns the run row + steps + minimal workflow info, or 401/404. */
export async function GET(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { runId } = await ctx.params;

  const run = await prisma.run.findFirst({
    where: {
      id: runId,
      userId: session.user.id,
    },
    include: {
      steps: { orderBy: { createdAt: "asc" } },
      workflow: { select: { id: true, title: true } },
    },
  });

  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ run });
}
