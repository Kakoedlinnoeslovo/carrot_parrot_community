import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { auth } from "@/auth";
import { Providers } from "@/components/providers";
import { SignOutButton } from "@/components/sign-out-button";
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
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <Providers session={session}>
          <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight text-orange-400">
              Carrot Parrot
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/community" className="text-zinc-400 hover:text-zinc-200">
                Community
              </Link>
              {session?.user ? (
                <>
                  <Link href="/studio" className="text-zinc-400 hover:text-zinc-200">
                    Studio
                  </Link>
                  <span className="text-zinc-500">{session.user.email}</span>
                  <SignOutButton />
                </>
              ) : (
                <>
                  <Link href="/login" className="text-zinc-400 hover:text-zinc-200">
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    className="rounded-md bg-orange-500 px-3 py-1.5 font-medium text-white hover:bg-orange-400"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </nav>
          </header>
          <div className="flex-1">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
