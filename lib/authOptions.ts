import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { isAdminEmail, isAllowedEmail } from "./auth";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      // Same domain gate as UTM Studio (slash.digital), narrowed further to
      // the admin allowlist until ALLOW_ALL_SLASH_DIGITAL is turned on.
      if (!isAllowedEmail(user.email)) return false;
      return true;
    },
    async jwt({ token }) {
      token.role = isAdminEmail(token.email as string | undefined) ? "admin" : "editor";
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
};
