"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { isRole } from "@/lib/roles";
import { createUserWithPassword } from "@/lib/create-user";

async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") {
    redirect("/dashboard");
  }
  return session;
}

function fail(message: string): never {
  redirect(`/admin?error=${encodeURIComponent(message)}`);
}

export async function updateUserAction(formData: FormData) {
  const session = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  const districtId = String(formData.get("districtId") ?? "");

  if (!id || !isRole(role)) fail("Некорректные данные");
  if (id === session.user.id && role !== "admin") {
    fail("Нельзя снять роль администратора с самого себя");
  }

  await prisma.user.update({
    where: { id },
    data: { role, districtId: districtId || null },
  });

  revalidatePath("/admin");
  redirect("/admin?ok=Сохранено");
}

export async function createUserAction(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "dispatcher");
  const districtId = String(formData.get("districtId") ?? "");

  if (!name || !email || password.length < 8 || !isRole(role)) {
    fail("Заполните имя, email и пароль (минимум 8 символов)");
  }

  try {
    await createUserWithPassword({
      name,
      email,
      password,
      role,
      districtId: districtId || null,
    });
  } catch {
    fail("Не удалось создать пользователя — возможно, email уже занят");
  }

  revalidatePath("/admin");
  redirect("/admin?ok=Пользователь создан");
}
