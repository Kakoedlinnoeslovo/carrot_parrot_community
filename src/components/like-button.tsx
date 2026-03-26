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
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 transition-colors duration-300 ease-out hover:bg-zinc-100"
    >
      {liked ? "♥" : "♡"} {count}
    </button>
  );
}
