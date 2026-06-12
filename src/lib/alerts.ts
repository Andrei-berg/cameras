import prisma from "@/lib/prisma";
import { plural } from "@/lib/plural";

export interface Alert {
  severity: "critical" | "warning";
  text: string;
  href: string;
}

export interface AlertsInput {
  role: string;
  /** сломанных камер без открытого инцидента */
  brokenNoIncident: number;
  /** открытых инцидентов старше 24 ч без выезда специалиста */
  openStale: number;
  /** в ремонте дольше 7 дней */
  repairOverdue: number;
  /** участки с долей работающих < 80% */
  badDistricts: { id: string; name: string; share: number }[];
}

/** Чистая функция правил — вычисляет тревоги по роли (тестируема без БД) */
export function computeAlerts(i: AlertsInput): Alert[] {
  const out: Alert[] = [];
  const forDispatcher = ["dispatcher", "admin"].includes(i.role);
  const forEngineer = ["engineer", "admin"].includes(i.role);
  const forManager = ["manager", "admin"].includes(i.role);

  if (forDispatcher && i.brokenNoIncident > 0) {
    out.push({
      severity: "critical",
      text: `${i.brokenNoIncident} ${plural(i.brokenNoIncident, ["камера сломана", "камеры сломаны", "камер сломано"])} — инцидент не заведён`,
      href: "/cameras?status=broken",
    });
  }
  if (forEngineer && i.repairOverdue > 0) {
    out.push({
      severity: "critical",
      text: `${i.repairOverdue} ${plural(i.repairOverdue, ["ремонт просрочен", "ремонта просрочены", "ремонтов просрочены"])} (в работе дольше 7 дней)`,
      href: "/incidents?state=in_repair",
    });
  }
  if ((forDispatcher || forEngineer) && i.openStale > 0) {
    out.push({
      severity: "warning",
      text: `${i.openStale} ${plural(i.openStale, ["инцидент ждёт", "инцидента ждут", "инцидентов ждут"])} выезда дольше суток`,
      href: "/incidents?state=open",
    });
  }
  if (forManager) {
    for (const d of i.badDistricts.slice(0, 3)) {
      out.push({
        severity: d.share < 0.6 ? "critical" : "warning",
        text: `${d.name}: работает только ${Math.round(d.share * 100)}% камер`,
        href: `/cameras?district=${d.id}&status=broken`,
      });
    }
    if (i.badDistricts.length > 3) {
      out.push({
        severity: "warning",
        text: `и ещё ${i.badDistricts.length - 3} ${plural(i.badDistricts.length - 3, ["участок", "участка", "участков"])} с долей работающих ниже 80%`,
        href: "/reports",
      });
    }
  }
  // critical первыми
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}

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
