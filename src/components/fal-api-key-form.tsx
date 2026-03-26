"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  variant: "onboarding" | "settings";
};

export function FalApiKeyForm({ variant }: Props) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cleared, setCleared] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCleared(null);
    setBusy(true);
    try {
      const res = await fetch("/api/me/fal-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      const data = (await res.json()) as { error?: string; detail?: string };
      if (!res.ok) {
        setError(data.detail ? `${data.error ?? "Error"}: ${data.detail}` : (data.error ?? "Failed to save key"));
        setBusy(false);
        return;
      }
      setKey("");
      router.push(variant === "onboarding" ? "/studio" : "/settings/fal-key");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function onClear() {
    setError(null);
    setCleared(null);
    setBusy(true);
    try {
      const res = await fetch("/api/me/fal-key", { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to remove key");
        setBusy(false);
        return;
      }
      setCleared("Saved fal.ai key removed. Add a new key below or set FAL_KEY on the server.");
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm leading-relaxed text-zinc-400">
        Runs and model search use your personal{" "}
        <a
          href="https://fal.ai"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-orange-400 underline-offset-4 hover:underline"
        >
          fal.ai
        </a>{" "}
        account. Create an API key in the{" "}
        <a
          href="https://fal.ai/dashboard/keys"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-orange-400 underline-offset-4 hover:underline"
        >
          fal dashboard
        </a>
        , paste it here, and it is stored encrypted on the server.
      </p>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="fal-key" className="text-xs font-medium text-zinc-400">
            fal.ai API key
          </label>
          <input
            id="fal-key"
            type="password"
            autoComplete="off"
            required
            className="mt-1 w-full rounded-lg border border-white/15 bg-zinc-900/50 px-3 py-2 font-mono text-sm text-zinc-100 shadow-sm placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/25"
            placeholder="Key …"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {cleared && <p className="text-sm text-zinc-400">{cleared}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-orange-600 py-2.5 font-medium text-white transition-colors duration-300 ease-out hover:bg-orange-500 disabled:opacity-50"
        >
          {variant === "onboarding" ? "Save and continue" : "Save key"}
        </button>
      </form>

      {variant === "settings" && (
        <div className="border-t border-white/10 pt-6">
          <p className="mb-3 text-xs font-medium text-zinc-500">Remove your key from this app</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onClear()}
            className="rounded-lg border border-white/15 bg-transparent px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
          >
            Remove stored key
          </button>
        </div>
      )}

      {variant === "onboarding" && (
        <p className="text-xs text-zinc-500">
          The app operator can still set <span className="font-mono">FAL_KEY</span> on the server as a fallback; your
          key is used first when present.
        </p>
      )}

      {variant === "settings" && (
        <p className="text-sm">
          <Link href="/studio" className="font-medium text-orange-400 underline-offset-4 hover:underline">
            ← Back to Studio
          </Link>
        </p>
      )}
    </div>
  );
}
