import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type PublishedFeedSort = "recent" | "trending";

const userFeedSelect = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

/** Narrow columns for community grid + public feed API (avoids large unused fields). */
export const publishedFeedSelect = {
  id: true,
  slug: true,
  title: true,
  description: true,
  graphJson: true,
  coverImageUrl: true,
  coverPreviewKind: true,
  updatedAt: true,
  publishedFeedMetaJson: true,
  user: { select: userFeedSelect },
  _count: { select: { likes: true } },
} satisfies Prisma.WorkflowSelect;

export type PublishedFeedWorkflow = Prisma.WorkflowGetPayload<{
  select: typeof publishedFeedSelect;
}>;

/** Published workflows for community grid and public feed API (shared sort + filters). */
export async function listPublishedWorkflowsForFeed(options: {
  sort: PublishedFeedSort;
  take: number;
  requireSlug?: boolean;
}): Promise<PublishedFeedWorkflow[]> {
  const { sort, take, requireSlug = false } = options;

  const workflows = await prisma.workflow.findMany({
    where: {
      visibility: "published",
      ...(requireSlug ? { slug: { not: null } } : {}),
    },
    take,
    orderBy: sort === "trending" ? undefined : { updatedAt: "desc" },
    select: publishedFeedSelect,
  });

  if (sort !== "trending") {
    return workflows;
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const ids = workflows.map((w) => w.id);
  if (ids.length === 0) {
    return workflows;
  }

  const grouped = await prisma.like.groupBy({
    by: ["workflowId"],
    where: {
      workflowId: { in: ids },
      createdAt: { gte: weekAgo },
    },
    _count: { _all: true },
  });

  const recentById = new Map(grouped.map((g) => [g.workflowId, g._count._all]));

  return [...workflows].sort(
    (a, b) =>
      (recentById.get(b.id) ?? 0) - (recentById.get(a.id) ?? 0) ||
      b.updatedAt.getTime() - a.updatedAt.getTime(),
  );
}
