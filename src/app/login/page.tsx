"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnalyticsEvent, track } from "@/lib/analytics";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    if (res?.error) {
      track(AnalyticsEvent.authLoginFailure);
      setError("Invalid email or password.");
      return;
    }
    track(AnalyticsEvent.authLoginSuccess);
    router.push("/studio");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-20">
      <h1 className="text-2xl font-semibold text-zinc-100">Log in</h1>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-zinc-400">Email</label>
          <input
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-white/15 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-100 shadow-sm placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/25"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-zinc-400">Password</label>
          <input
            type="password"
            required
            className="mt-1 w-full rounded-lg border border-white/15 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-100 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/25"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          className="rounded-lg bg-orange-600 py-2.5 font-medium text-white transition-colors duration-300 ease-out hover:bg-orange-500"
        >
          Continue
        </button>
      </form>
      <p className="mt-6 text-sm text-zinc-400">
        No account?{" "}
        <Link href="/register" className="font-medium text-orange-400 underline-offset-4 hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
