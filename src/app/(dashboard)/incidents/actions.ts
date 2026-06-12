"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

async function requireRole(roles: string[]) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !roles.includes(session.user.role)) redirect("/dashboard");
  return session;
}

/** Диспетчер фиксирует неисправность с карточки камеры */
export async function createIncidentAction(formData: FormData) {
  const session = await requireRole(["dispatcher", "engineer", "admin"]);
  const cameraId = String(formData.get("cameraId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!cameraId || !reason) redirect(`/cameras/${cameraId}?error=1`);

  const incident = await prisma.$transaction(async (tx) => {
    const inc = await tx.incident.create({
      data: {
        cameraId,
        reportedById: session.user.id,
        dispatcherReason: reason,
        state: "open",
      },
    });
    await tx.camera.update({
      where: { id: cameraId },
      data: { isWorking: false, lastStatusChange: new Date() },
    });
    return inc;
  });

  revalidatePath(`/cameras/${cameraId}`);
  revalidatePath("/incidents");
  redirect(`/incidents/${incident.id}`);
}

/** Инженер отмечает выезд и диагноз */
export async function markVisitAction(formData: FormData) {
  await requireRole(["engineer", "admin"]);
  const id = String(formData.get("id") ?? "");
  const specialistReason = String(formData.get("specialistReason") ?? "").trim();
  const repairNeeded = String(formData.get("repairNeeded") ?? "").trim();

  await prisma.incident.update({
    where: { id },
    data: {
      state: "in_repair",
      specialistVisit: new Date(),
      specialistReason: specialistReason || null,
      repairNeeded: repairNeeded || null,
    },
  });
  revalidatePath(`/incidents/${id}`);
  redirect(`/incidents/${id}`);
}

/** Перемещение карточки на канбан-доске (drag-and-drop) */
export async function moveIncidentAction(id: string, toState: string) {
  await requireRole(["engineer", "admin"]);
  if (!["open", "in_repair", "resolved"].includes(toState)) return;

  const inc = await prisma.incident.findUnique({ where: { id } });
  if (!inc || inc.state === toState) return;
  // из resolved не возвращаем — только вперёд по потоку и in_repair → open
  if (inc.state === "resolved") return;

  if (toState === "resolved") {
    await prisma.$transaction(async (tx) => {
      await tx.incident.update({
        where: { id },
        data: { state: "resolved", resolvedAt: new Date() },
      });
      const otherOpen = await tx.incident.count({
        where: { cameraId: inc.cameraId, state: { not: "resolved" }, id: { not: id } },
      });
      if (otherOpen === 0) {
        await tx.camera.update({
          where: { id: inc.cameraId },
          data: { isWorking: true, lastStatusChange: new Date() },
        });
      }
    });
  } else {
    await prisma.incident.update({
      where: { id },
      data:
        toState === "in_repair"
          ? { state: "in_repair", specialistVisit: inc.specialistVisit ?? new Date() }
          : { state: "open" },
    });
  }
  revalidatePath("/incidents");
}

/** Инженер закрывает инцидент; камера возвращается в строй, если нет других открытых */
export async function resolveIncidentAction(formData: FormData) {
  await requireRole(["engineer", "admin"]);
  const id = String(formData.get("id") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  await prisma.$transaction(async (tx) => {
    const inc = await tx.incident.update({
      where: { id },
      data: { state: "resolved", resolvedAt: new Date(), notes: notes || undefined },
    });
    const otherOpen = await tx.incident.count({
      where: { cameraId: inc.cameraId, state: { not: "resolved" }, id: { not: id } },
    });
    if (otherOpen === 0) {
      await tx.camera.update({
        where: { id: inc.cameraId },
        data: { isWorking: true, lastStatusChange: new Date() },
      });
    }
  });
  revalidatePath(`/incidents/${id}`);
  revalidatePath("/incidents");
  redirect(`/incidents/${id}`);
}
