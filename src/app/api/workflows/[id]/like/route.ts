import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const wf = await prisma.workflow.findFirst({
    where: { id, visibility: "published" },
  });
  if (!wf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.like.upsert({
    where: {
      userId_workflowId: { userId: session.user.id, workflowId: wf.id },
    },
    create: { userId: session.user.id, workflowId: wf.id },
    update: {},
  });

  const count = await prisma.like.count({ where: { workflowId: wf.id } });
  return NextResponse.json({ liked: true, likeCount: count });
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const wf = await prisma.workflow.findFirst({
    where: { id, visibility: "published" },
  });
  if (!wf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.like.deleteMany({
    where: { userId: session.user.id, workflowId: wf.id },
  });

  const count = await prisma.like.count({ where: { workflowId: wf.id } });
  return NextResponse.json({ liked: false, likeCount: count });
}
