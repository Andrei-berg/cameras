import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "dispatcher", input: false },
      districtId: { type: "string", required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true, // публичная регистрация закрыта — пользователей создаёт админ
    minPasswordLength: 8,
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev",
        to: user.email,
        subject: "Сброс пароля — ГОРМОСТ Камеры",
        html: `<p>Перейдите по ссылке для сброса пароля:</p><p><a href="${url}">${url}</a></p><p>Ссылка действительна 1 час.</p>`,
      });
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;
