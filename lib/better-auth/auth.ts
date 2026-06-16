import { any, betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { connectToDatabase } from "@/database/mongoose";
import { getAppUrl, getTrustedOrigins } from "@/lib/env";
import { transporter } from "@/lib/nodemailer";
import { nextCookies } from "better-auth/next-js";

let authInstance: ReturnType<typeof betterAuth> | null = null; // Singleton instance

export const getAuth = async () => {
  if (authInstance) return authInstance;

  const mongoose = await connectToDatabase();
  const db = mongoose.connection.db;

  if (!db) throw new Error("MongoDB connection not established");
  const baseURL = getAppUrl();

  if (process.env.NODE_ENV === "production" && baseURL.includes("localhost")) {
    console.warn(
      "BETTER_AUTH_URL is missing or points to localhost in production. " +
        "Set BETTER_AUTH_URL to your Vercel URL in project environment variables."
    );
  }

  authInstance = betterAuth({
    database: mongodbAdapter(db as any),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: getTrustedOrigins(),
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
        try {
          await transporter.sendMail({
            from: `"Signalist" <${process.env.NODEMAILER_EMAIL}>`,
            to: user.email,
            subject: "Verify your Signalist account",
            html: `
            <p>Hi ${user.name || "there"},</p>
            <p>Confirm your email to get started with Signalist.</p>
            <p><a href="${url}" style="color:#facc15;">Verify Email</a></p>
            <p>If you didn’t create this account, you can ignore this email.</p>
          `,
          });
          console.log("Verification email sent to", user.email);
        } catch (err) {
          console.error("verifyEmail mail error:", err);
          throw err;
        }
      },
    },
    plugins: [nextCookies()],
  });

  return authInstance;
}

export const auth = await getAuth();