"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-md bg-zinc-800 px-2 py-1 text-zinc-200 hover:bg-zinc-700"
    >
      Sign out
    </button>
  );
}
