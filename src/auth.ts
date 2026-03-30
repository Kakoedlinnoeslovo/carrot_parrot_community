/**
 * NextAuth.js (Auth.js) configuration — session cookies, sign-in routes, and `auth()`.
 *
 * Python analogy: conceptually between Flask-Login + a custom user store and something like
 * `python-jose` for JWTs, but wired for Next.js App Router (`handlers` go in
 * `app/api/auth/[...nextauth]/route.ts`).
 *
 * - **`auth()`** — async function you `await` in Server Components and Route Handlers to read
 *   the current user (like `current_user` in Flask-Login if it were async).
 * - **JWT session** — server stores a signed token in a cookie instead of a DB session row
 *   (see `session: { strategy: "jwt" }`).
 *
 * `authorize` is the credential check (same idea as validating username/password in a Django
 * view or FastAPI dependency, then returning a minimal user object or `null`).
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      /** Validate email/password against Postgres; return user shape or `null` (failed login). */
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) return null;
        const email = String(credentials.email).toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        const ok = await bcrypt.compare(String(credentials.password), user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    /**
     * Called when a JWT is created/updated. `user` is only present right after sign-in;
     * afterwards we merge `id`/`email` into the token payload (cookie-sized claims).
     */
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.email = user.email;
      }
      return token;
    },
    /**
     * Shapes what `auth()` exposes as `session` to the app — copy claims from JWT into
     * `session.user` so Server Components get `session.user.id` / `.email`.
     */
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.email = token.email as string;
      }
      return session;
    },
  },
});
