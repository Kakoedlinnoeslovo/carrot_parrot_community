import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") ?? "recent";
  const take = Math.min(parseInt(searchParams.get("limit") ?? "24", 10) || 24, 50);

  const workflows = await prisma.workflow.findMany({
    where: { visibility: "published" },
    take,
    orderBy:
      sort === "trending"
        ? undefined
        : { updatedAt: "desc" },
    include: {
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { likes: true } },
    },
  });

  let sorted = workflows;
  if (sort === "trending") {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const withRecentLikes = await Promise.all(
      workflows.map(async (w) => {
        const recent = await prisma.like.count({
          where: { workflowId: w.id, createdAt: { gte: weekAgo } },
        });
        return { w, recent };
      }),
    );
    sorted = withRecentLikes
      .sort((a, b) => b.recent - a.recent || b.w.updatedAt.getTime() - a.w.updatedAt.getTime())
      .map((x) => x.w);
  }

  const likedIds = new Set<string>();
  if (session?.user?.id) {
    const likes = await prisma.like.findMany({
      where: {
        userId: session.user.id,
        workflowId: { in: sorted.map((w) => w.id) },
      },
      select: { workflowId: true },
    });
    for (const l of likes) likedIds.add(l.workflowId);
  }

  return NextResponse.json({
    items: sorted.map((w) => ({
      id: w.id,
      title: w.title,
      description: w.description,
      slug: w.slug,
      coverImageUrl: w.coverImageUrl,
      updatedAt: w.updatedAt,
      author: {
        name: w.user.name ?? w.user.email?.split("@")[0] ?? "Creator",
      },
      likeCount: w._count.likes,
      likedByMe: likedIds.has(w.id),
    })),
  });
}
