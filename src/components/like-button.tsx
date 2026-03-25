"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LikeButton({
  workflowId,
  initialLiked,
  initialCount,
}: {
  workflowId: string;
  initialLiked: boolean;
  initialCount: number;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);

  async function toggle() {
    const method = liked ? "DELETE" : "POST";
    const res = await fetch(`/api/workflows/${workflowId}/like`, { method });
    if (!res.ok) return;
    const j = (await res.json()) as { liked: boolean; likeCount: number };
    setLiked(j.liked);
    setCount(j.likeCount);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      className="rounded-md border border-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
    >
      {liked ? "♥" : "♡"} {count}
    </button>
  );
}
