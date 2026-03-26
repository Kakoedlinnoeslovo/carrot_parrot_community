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
  description: "Build and share fal.ai workflows on a node canvas.",
};

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
      <body className="font-sans min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <Providers session={session}>
          <header className="flex items-center justify-between border-b border-zinc-200/90 bg-white/80 px-4 py-3 backdrop-blur-md">
            <TrackedLink
              href="/"
              eventLabel="nav_logo"
              className="text-lg font-semibold tracking-tight text-orange-600"
            >
              Carrot Parrot
            </TrackedLink>
            <nav className="flex items-center gap-4 text-sm font-medium">
              <TrackedLink
                href="/community"
                eventLabel="nav_community"
                className="text-zinc-700 transition-colors duration-300 ease-out hover:text-zinc-900"
              >
                Community
              </TrackedLink>
              {session?.user ? (
                <>
                  <TrackedLink
                    href="/studio"
                    eventLabel="nav_studio"
                    className="text-zinc-700 transition-colors duration-300 ease-out hover:text-zinc-900"
                  >
                    Studio
                  </TrackedLink>
                  <span className="max-w-[12rem] truncate text-zinc-500">{session.user.email}</span>
                  <SignOutButton />
                </>
              ) : (
                <>
                  <TrackedLink
                    href="/login"
                    eventLabel="nav_login"
                    className="text-zinc-700 transition-colors duration-300 ease-out hover:text-zinc-900"
                  >
                    Log in
                  </TrackedLink>
                  <TrackedLink
                    href="/register"
                    eventLabel="nav_signup"
                    className="rounded-md bg-orange-500 px-3 py-1.5 font-medium text-white hover:bg-orange-400"
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
