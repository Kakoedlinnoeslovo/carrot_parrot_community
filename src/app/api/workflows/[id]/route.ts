import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { assertAcyclic, safeParseWorkflowGraph } from "@/lib/workflow-graph";

type RouteCtx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: RouteCtx) {
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
  return NextResponse.json({ workflow: wf });
}

export async function PATCH(req: Request, ctx: RouteCtx) {
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

  const body = (await req.json()) as {
    title?: string;
    description?: string;
    graphJson?: string;
  };

  if (body.graphJson !== undefined) {
    const parsed = safeParseWorkflowGraph(body.graphJson);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid graph", details: parsed.error }, { status: 400 });
    }
    assertAcyclic(parsed.data);
  }

  const updated = await prisma.workflow.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.graphJson !== undefined ? { graphJson: body.graphJson } : {}),
    },
  });

  return NextResponse.json({ workflow: updated });
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const deleted = await prisma.workflow.deleteMany({
    where: { id, userId: session.user.id },
  });
  if (deleted.count === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
