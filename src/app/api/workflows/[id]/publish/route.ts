import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { safeParseWorkflowGraph } from "@/lib/workflow-graph";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const wf = await prisma.workflow.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!wf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = safeParseWorkflowGraph(wf.graphJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid graph" }, { status: 400 });
  }

  let slug = wf.slug;
  if (!slug) {
    for (let i = 0; i < 5; i++) {
      const candidate = nanoid(10);
      const clash = await prisma.workflow.findUnique({ where: { slug: candidate } });
      if (!clash) {
        slug = candidate;
        break;
      }
    }
    if (!slug) {
      return NextResponse.json({ error: "Could not allocate slug" }, { status: 500 });
    }
  }

  await prisma.$transaction([
    prisma.workflowVersion.create({
      data: {
        workflowId: wf.id,
        graphJson: wf.graphJson,
        label: "publish",
      },
    }),
    prisma.workflow.update({
      where: { id: wf.id },
      data: {
        visibility: "published",
        slug,
      },
    }),
  ]);

  const updated = await prisma.workflow.findUnique({ where: { id: wf.id } });
  return NextResponse.json({ workflow: updated });
}
