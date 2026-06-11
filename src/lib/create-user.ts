import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * Создаёт пользователя с паролем напрямую (минуя sign-up endpoint —
 * публичная регистрация отключена, disableSignUp в auth.ts).
 * Пароль хэшируется штатным механизмом Better Auth (scrypt),
 * поэтому обычный sign-in работает без оговорок.
 */
export async function createUserWithPassword(opts: {
  name: string;
  email: string;
  password: string;
  role: string;
  districtId?: string | null;
}) {
  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(opts.password);
  const now = new Date();

  const user = await prisma.user.create({
    data: {
      name: opts.name,
      email: opts.email,
      emailVerified: true,
      role: opts.role,
      districtId: opts.districtId ?? null,
    },
  });

  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    },
  });

  return user;
}
