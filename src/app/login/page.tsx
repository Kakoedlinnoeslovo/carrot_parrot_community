"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
      setError("Invalid email or password.");
      return;
    }
    router.push("/studio");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-20">
      <h1 className="text-2xl font-semibold text-zinc-50">Log in</h1>
      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <div>
          <label className="text-xs text-zinc-500">Email</label>
          <input
            type="email"
            required
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500">Password</label>
          <input
            type="password"
            required
            className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          className="rounded-lg bg-orange-500 py-2.5 font-medium text-white hover:bg-orange-400"
        >
          Continue
        </button>
      </form>
      <p className="mt-6 text-sm text-zinc-500">
        No account?{" "}
        <Link href="/register" className="text-orange-400 hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
