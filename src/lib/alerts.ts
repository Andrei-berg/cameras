import prisma from "@/lib/prisma";
import { computeAlerts, type Alert } from "@/lib/alerts-rules";

export type { Alert, AlertsInput } from "@/lib/alerts-rules";
export { computeAlerts } from "@/lib/alerts-rules";

/** Серверная обёртка: собирает данные и прогоняет через правила */
export async function getAlerts(role: string): Promise<Alert[]> {
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600_000);

  const [brokenNoIncident, openStale, repairOverdue, districts] = await Promise.all([
    prisma.camera.count({
      where: {
        isWorking: false,
        object: { isCommissioned: true }, // «Не принят» — не зона действий диспетчера
        incidents: { none: { state: { not: "resolved" } } },
      },
    }),
    prisma.incident.count({
      where: { state: "open", specialistVisit: null, detectedAt: { lt: dayAgo } },
    }),
    prisma.incident.count({
      where: { state: "in_repair", specialistVisit: { lt: weekAgo } },
    }),
    prisma.$queryRaw<{ id: string; name: string; share: number }[]>`
      SELECT d.id, d.name,
             (count(*) FILTER (WHERE c."isWorking"))::float / count(*) AS share
      FROM "Camera" c
      JOIN "Object" o ON o.id = c."objectId" AND o."isCommissioned"
      JOIN "District" d ON d.id = o."districtId"
      GROUP BY d.id, d.name
      HAVING (count(*) FILTER (WHERE c."isWorking"))::float / count(*) < 0.8
      ORDER BY share ASC`,
  ]);

  return computeAlerts({
    role,
    brokenNoIncident,
    openStale,
    repairOverdue,
    badDistricts: districts,
  });
}
