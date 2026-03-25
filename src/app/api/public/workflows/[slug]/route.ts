import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type RouteCtx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  const { slug } = await ctx.params;

  const wf = await prisma.workflow.findFirst({
    where: { slug, visibility: "published" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { likes: true } },
    },
  });

  if (!wf) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let likedByMe = false;
  if (session?.user?.id) {
    const like = await prisma.like.findUnique({
      where: {
        userId_workflowId: { userId: session.user.id, workflowId: wf.id },
      },
    });
    likedByMe = !!like;
  }

  return NextResponse.json({
    workflow: {
      id: wf.id,
      title: wf.title,
      description: wf.description,
      slug: wf.slug,
      graphJson: wf.graphJson,
      coverImageUrl: wf.coverImageUrl,
      updatedAt: wf.updatedAt,
      author: {
        name: wf.user.name ?? wf.user.email?.split("@")[0] ?? "Creator",
      },
      likeCount: wf._count.likes,
      likedByMe,
    },
  });
}
