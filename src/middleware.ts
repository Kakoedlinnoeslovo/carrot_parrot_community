/**
 * Next.js middleware — runs on the Edge *before* a request hits a page or API route.
 *
 * Python mental model: like a thin WSGI/ASGI middleware or Starlette/FastAPI dependency
 * that runs first on matching paths. It can redirect, rewrite, or short-circuit with JSON.
 *
 * Here `auth(...)` wraps our handler with NextAuth v5: `req.auth` is populated when the
 * session cookie is valid (similar in spirit to reading a signed session in Flask-Login,
 * but implemented as JWT/session cookies handled by NextAuth).
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/middleware
 */
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const loggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/studio") && !loggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (
    (pathname.startsWith("/onboarding") || pathname.startsWith("/settings")) &&
    !loggedIn
  ) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (
    (pathname.startsWith("/api/workflows") ||
      pathname.startsWith("/api/runs") ||
      pathname.startsWith("/api/fal/storage") ||
      pathname.startsWith("/api/fal/models") ||
      pathname.startsWith("/api/me")) &&
    !loggedIn
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
});

/** Limits which URL patterns run this file — everything else skips middleware entirely. */
export const config = {
  matcher: [
    "/studio/:path*",
    "/onboarding/:path*",
    "/settings/:path*",
    "/api/workflows/:path*",
    "/api/runs/:path*",
    "/api/fal/storage/:path*",
    "/api/fal/models/:path*",
    "/api/me",
    "/api/me/:path*",
  ],
};
