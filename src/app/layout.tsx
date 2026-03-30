/**
 * Root **Server Component** layout — wraps every page. Default export must be a React
 * component; `async` is allowed so we can `await auth()` on the server.
 *
 * Python analogy: like a Jinja `base.html` that every template extends, but this *is* React
 * output — there is no separate template language. `"use client"` is **not** here, so this
 * file runs only on the server (no browser hooks like `useState` at top level).
 *
 * - **`metadata`** — static SEO fields (like `<title>` / meta tags) for this segment.
 * - **`children`** — the matched page (`page.tsx`) nested inside this shell.
 */
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { Geist, Geist_Mono } from "next/font/google";
import { auth } from "@/auth";
import { Providers } from "@/components/providers";
import { SignOutButton } from "@/components/sign-out-button";
import { TrackedLink } from "@/components/tracked-link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Carrot Parrot — AI workflows",
  description:
    "Visual editor for multi-step AI pipelines powered by fal.ai—connect model nodes, run with your API key, publish and remix with the community.",
};

/** App shell: fonts, nav, session-aware links. `children` is the active route’s `page.tsx`. */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="font-sans flex min-h-full flex-col bg-zinc-950 text-zinc-100">
        <Providers session={session}>
          <header className="flex items-center justify-between border-b border-white/10 bg-zinc-950/80 px-4 py-3 backdrop-blur-xl">
            <TrackedLink
              href="/"
              eventLabel="nav_logo"
              className="text-lg font-semibold tracking-tight text-orange-400 transition-colors duration-300 ease-out hover:text-orange-300"
            >
              Carrot Parrot
            </TrackedLink>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <TrackedLink
                href="/community"
                eventLabel="nav_community"
                className="text-zinc-300 transition-colors duration-300 ease-out hover:text-white"
              >
                Community
              </TrackedLink>
              {session?.user ? (
                <>
                  <TrackedLink
                    href="/studio"
                    eventLabel="nav_studio"
                    className="text-zinc-300 transition-colors duration-300 ease-out hover:text-white"
                  >
                    Studio
                  </TrackedLink>
                  <TrackedLink
                    href="/settings/fal-key"
                    eventLabel="nav_settings_fal"
                    className="text-zinc-300 transition-colors duration-300 ease-out hover:text-white"
                  >
                    fal key
                  </TrackedLink>
                  <span className="max-w-[12rem] truncate text-zinc-500">{session.user.email}</span>
                  <SignOutButton />
                </>
              ) : (
                <>
                  <TrackedLink
                    href="/login"
                    eventLabel="nav_login"
                    className="text-zinc-300 transition-colors duration-300 ease-out hover:text-white"
                  >
                    Log in
                  </TrackedLink>
                  <TrackedLink
                    href="/register"
                    eventLabel="nav_signup"
                    className="rounded-md bg-orange-500 px-3 py-1.5 font-medium text-white shadow-[0_8px_24px_-8px_rgba(234,88,12,0.5)] transition-[background-color,box-shadow] duration-300 ease-out hover:bg-orange-400 hover:shadow-[0_12px_28px_-8px_rgba(234,88,12,0.55)]"
                  >
                    Sign up
                  </TrackedLink>
                </>
              )}
            </nav>
          </header>
          <div className="flex-1">{children}</div>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
