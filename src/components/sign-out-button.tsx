"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-medium text-zinc-800 transition-colors duration-300 ease-out hover:bg-zinc-100"
    >
      Sign out
    </button>
  );
}
