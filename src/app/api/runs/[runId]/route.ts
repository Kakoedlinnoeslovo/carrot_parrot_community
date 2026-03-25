import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type RouteCtx = { params: Promise<{ runId: string }> };

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
