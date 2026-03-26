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
      <h1 className="text-2xl font-semibold text-zinc-900">Community</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Published workflows — open a style, like it, or remix into your studio.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {workflows.map((w) => (
          <li
            key={w.id}
            className="rounded-xl border border-zinc-200 bg-white p-4 shadow-[0_12px_40px_-20px_rgba(0,0,0,0.1)] transition-[border-color,box-shadow] duration-300 ease-out hover:border-zinc-300 hover:shadow-[0_16px_48px_-20px_rgba(0,0,0,0.12)]"
          >
            <Link href={`/w/${w.slug}`} className="block">
              <h2 className="font-semibold text-zinc-900">{w.title ?? "Untitled"}</h2>
              <p className="mt-1 line-clamp-2 text-sm text-zinc-600">
                {w.description ?? "No description"}
              </p>
              <p className="mt-3 text-xs text-zinc-500">
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
        <p className="mt-12 text-center text-zinc-600">
          Nothing published yet. Publish from the studio.
        </p>
      )}
    </div>
  );
}
