import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Журнал действий (кто/что/когда). Вызывается из каждой мутации.
 * Никогда не валит основную операцию — ошибки записи только в консоль.
 */
export async function logAction(entry: {
  userId: string;
  action: string; // incident.create / user.update / registry.import …
  entityType: "incident" | "camera" | "user" | "object" | "registry";
  entityId?: string;
  details?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.actionLog.create({ data: entry });
  } catch (e) {
    console.error("logAction failed:", e);
  }
}
