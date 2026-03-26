"use client";

import { signOut } from "next-auth/react";
import { AnalyticsEvent, track } from "@/lib/analytics";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => {
        track(AnalyticsEvent.authSignOutClick);
        void signOut({ callbackUrl: "/" });
      }}
      className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-sm font-medium text-zinc-200 transition-[background-color,border-color] duration-300 ease-out hover:border-white/25 hover:bg-white/10"
    >
      Sign out
    </button>
  );
}
