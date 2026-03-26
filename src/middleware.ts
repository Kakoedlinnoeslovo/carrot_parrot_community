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
