"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAction } from "@/lib/log-action";

/** Назначает координаты всем камерам объекта (ручная разметка карты) */
export async function setObjectCoordsAction(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") redirect("/dashboard");

  const objectId = String(formData.get("objectId") ?? "");
  const lat = parseFloat(String(formData.get("lat") ?? "").replace(",", "."));
  const lng = parseFloat(String(formData.get("lng") ?? "").replace(",", "."));

  // Москва и ТиНАО: широта 54.5–56.5, долгота 36–38.5
  if (!objectId || isNaN(lat) || isNaN(lng) || lat < 54.5 || lat > 56.5 || lng < 36 || lng > 38.5) {
    redirect("/admin/geo");
  }

  await prisma.camera.updateMany({
    where: { objectId },
    data: { lat, lng },
  });
  await logAction({
    userId: session.user.id,
    action: "object.set_coords",
    entityType: "object",
    entityId: objectId,
    details: { lat, lng },
  });

  revalidatePath("/admin/geo");
  redirect("/admin/geo");
}
