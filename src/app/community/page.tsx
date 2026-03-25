import Link from "next/link";
import { auth } from "@/auth";
import { LikeButton } from "@/components/like-button";
import { prisma } from "@/lib/db";

export default async function CommunityPage() {
  const session = await auth();

  const workflows = await prisma.workflow.findMany({
    where: { visibility: "published", slug: { not: null } },
    orderBy: { updatedAt: "desc" },
    take: 36,
    include: {
      user: { select: { name: true, email: true } },
      _count: { select: { likes: true } },
    },
  });

  const likedIds = new Set<string>();
  if (session?.user?.id) {
    const likes = await prisma.like.findMany({
      where: {
        userId: session.user.id,
        workflowId: { in: workflows.map((w) => w.id) },
      },
      select: { workflowId: true },
    });
    for (const l of likes) likedIds.add(l.workflowId);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold text-zinc-50">Community</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Published workflows — open a style, like it, or remix into your studio.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {workflows.map((w) => (
          <li
            key={w.id}
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:border-zinc-700"
          >
            <Link href={`/w/${w.slug}`} className="block">
              <h2 className="font-medium text-zinc-100">{w.title ?? "Untitled"}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-500">
                {w.description ?? "No description"}
              </p>
              <p className="mt-3 text-xs text-zinc-600">
                {w.user.name ?? w.user.email?.split("@")[0] ?? "Creator"}
              </p>
            </Link>
            <div className="mt-3 flex items-center gap-2">
              <LikeButton
                workflowId={w.id}
                initialLiked={likedIds.has(w.id)}
                initialCount={w._count.likes}
              />
            </div>
          </li>
        ))}
      </ul>

      {workflows.length === 0 && (
        <p className="mt-12 text-center text-zinc-500">
          Nothing published yet. Publish from the studio.
        </p>
      )}
    </div>
  );
}
