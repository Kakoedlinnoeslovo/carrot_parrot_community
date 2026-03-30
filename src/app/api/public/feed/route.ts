import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { communityFeedCardFromWorkflowRow } from "@/lib/published-feed-meta";
import { listPublishedWorkflowsForFeed } from "@/lib/published-community-query";

export async function GET(req: Request) {
  const session = await auth();
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") === "trending" ? "trending" : "recent";
  const take = Math.min(parseInt(searchParams.get("limit") ?? "24", 10) || 24, 50);

  const sorted = await listPublishedWorkflowsForFeed({ sort, take, requireSlug: false });

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
    items: sorted.map((w) => {
      const { modelsUsed } = communityFeedCardFromWorkflowRow({
        coverImageUrl: w.coverImageUrl,
        coverPreviewKind: w.coverPreviewKind,
        graphJson: w.graphJson,
        publishedFeedMetaJson: w.publishedFeedMetaJson,
      });
      return {
        id: w.id,
        title: w.title,
        description: w.description,
        slug: w.slug,
        coverImageUrl: w.coverImageUrl,
        coverPreviewKind: w.coverPreviewKind,
        modelsUsed,
        updatedAt: w.updatedAt,
        author: {
          name: w.user.name ?? w.user.email?.split("@")[0] ?? "Creator",
        },
        likeCount: w._count.likes,
        likedByMe: likedIds.has(w.id),
      };
    }),
  });
}
