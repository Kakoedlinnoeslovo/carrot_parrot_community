import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { assertAcyclic, safeParseWorkflowGraph } from "@/lib/workflow-graph";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const parent = await prisma.workflow.findFirst({
    where: { id, visibility: "published" },
  });
  if (!parent) {
    return NextResponse.json({ error: "Published workflow not found" }, { status: 404 });
  }

  const parsed = safeParseWorkflowGraph(parent.graphJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "Parent graph invalid" }, { status: 400 });
  }
  assertAcyclic(parsed.data);

  const child = await prisma.workflow.create({
    data: {
      userId: session.user.id,
      title: `Remix of ${parent.title ?? "workflow"}`,
      description: parent.description,
      graphJson: parent.graphJson,
      visibility: "private",
      parentWorkflowId: parent.id,
    },
  });

  return NextResponse.json({ workflow: child });
}
