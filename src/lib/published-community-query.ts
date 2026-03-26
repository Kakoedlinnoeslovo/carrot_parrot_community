import { prisma } from "@/lib/db";

export type PublishedFeedSort = "recent" | "trending";

const userFeedSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

/** Published workflows for community grid and public feed API (shared sort + filters). */
export async function listPublishedWorkflowsForFeed(options: {
  sort: PublishedFeedSort;
  take: number;
  requireSlug?: boolean;
}) {
  const { sort, take, requireSlug = false } = options;

  const workflows = await prisma.workflow.findMany({
    where: {
      visibility: "published",
      ...(requireSlug ? { slug: { not: null } } : {}),
    },
    take,
    orderBy: sort === "trending" ? undefined : { updatedAt: "desc" },
    include: {
      user: { select: userFeedSelect },
      _count: { select: { likes: true } },
    },
  });

  if (sort !== "trending") {
    return workflows;
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const withRecentLikes = await Promise.all(
    workflows.map(async (w) => {
      const recent = await prisma.like.count({
        where: { workflowId: w.id, createdAt: { gte: weekAgo } },
      });
      return { w, recent };
    }),
  );
  return withRecentLikes
    .sort((a, b) => b.recent - a.recent || b.w.updatedAt.getTime() - a.w.updatedAt.getTime())
    .map((x) => x.w);
}
