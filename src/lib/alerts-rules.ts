import { plural } from "@/lib/plural";

/** Чистые правила тревог — без БД и окружения, тестируются Vitest */

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
