import type { NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";

import prisma from "@/lib/db";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,

  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
    }),
  ],

  pages: {
    signIn: "/login",
    error: "/login",
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google" && profile) {
        const googleProfile = profile as {
          name?: string;
          given_name?: string;
          family_name?: string;
          picture?: string;
          email?: string;
          sub?: string;
        };

        // Construct legitimate name from Google profile if user.name is empty or placeholder
        const genuineName =
          googleProfile.name?.trim() ||
          [googleProfile.given_name, googleProfile.family_name].filter(Boolean).join(" ").trim() ||
          user.name?.trim();

        if (genuineName && genuineName !== user.name) {
          user.name = genuineName;
        }

        if (googleProfile.picture && !user.image) {
          user.image = googleProfile.picture;
        }
      }
      return true;
    },

    async jwt({ token, user, account, profile }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.email = user.email;
        token.picture = user.image;
      }

      if (!token.id && token.sub) {
        token.id = token.sub;
      }

      if (account?.provider === "google" && profile) {
        const googleProfile = profile as { name?: string; picture?: string };
        if (googleProfile.name) token.name = googleProfile.name;
        if (googleProfile.picture) token.picture = googleProfile.picture;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) || (token.sub as string) || "";
        if (token.name) session.user.name = token.name;
        if (token.email) session.user.email = token.email;
        if (token.picture) session.user.image = token.picture;
      }

      return session;
    },
  },

  events: {
    async signIn({ user, account, profile }) {
      // Sync Google profile data directly to MySQL User record to ensure
      // real name, avatar, and verification are stored accurately
      if (account?.provider === "google" && user?.id) {
        try {
          const googleProfile = profile as { name?: string; picture?: string; email_verified?: boolean } | undefined;
          const genuineName = googleProfile?.name?.trim() || user.name?.trim();
          const avatarUrl = googleProfile?.picture || user.image;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              ...(genuineName ? { name: genuineName } : {}),
              ...(avatarUrl ? { image: avatarUrl } : {}),
              ...(googleProfile?.email_verified ? { emailVerified: new Date() } : {}),
            },
          });
        } catch (error) {
          console.error("[NextAuth][events.signIn] Failed to update user profile in MySQL:", error);
        }
      }
    },
  },
};