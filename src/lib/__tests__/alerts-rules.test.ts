import { describe, it, expect } from "vitest";
import { computeAlerts, type AlertsInput } from "../alerts-rules";

const empty: AlertsInput = {
  role: "admin",
  brokenNoIncident: 0,
  openStale: 0,
  repairOverdue: 0,
  badDistricts: [],
};

describe("computeAlerts", () => {
  it("без проблем — без тревог", () => {
    expect(computeAlerts(empty)).toEqual([]);
  });

  it("сломанные без инцидента — critical для диспетчера, не для инженера", () => {
    const input = { ...empty, brokenNoIncident: 5 };
    expect(computeAlerts({ ...input, role: "dispatcher" })).toMatchObject([
      { severity: "critical", href: "/cameras?status=broken" },
    ]);
    expect(computeAlerts({ ...input, role: "engineer" })).toEqual([]);
  });

  it("просроченный ремонт — critical для инженера, не для диспетчера", () => {
    const input = { ...empty, repairOverdue: 2 };
    expect(computeAlerts({ ...input, role: "engineer" })).toMatchObject([
      { severity: "critical", href: "/incidents?state=in_repair" },
    ]);
    expect(computeAlerts({ ...input, role: "dispatcher" })).toEqual([]);
  });

  it("open>24ч — warning и диспетчеру, и инженеру", () => {
    const input = { ...empty, openStale: 3 };
    for (const role of ["dispatcher", "engineer"]) {
      expect(computeAlerts({ ...input, role })).toMatchObject([
        { severity: "warning", href: "/incidents?state=open" },
      ]);
    }
  });

  it("плохие участки — только руководителю/админу; <60% это critical", () => {
    const input = {
      ...empty,
      badDistricts: [{ id: "x", name: "Юг", share: 0.55 }],
    };
    expect(computeAlerts({ ...input, role: "dispatcher" })).toEqual([]);
    expect(computeAlerts({ ...input, role: "manager" })).toMatchObject([
      { severity: "critical", text: "Юг: работает только 55% камер" },
    ]);
  });

  it("больше 3 участков сворачиваются в «и ещё N»", () => {
    const ds = ["А", "Б", "В", "Г", "Д"].map((name, i) => ({
      id: String(i),
      name,
      share: 0.7,
    }));
    const alerts = computeAlerts({ ...empty, role: "manager", badDistricts: ds });
    expect(alerts).toHaveLength(4);
    expect(alerts[3].text).toContain("ещё 2 участка");
  });

  it("critical сортируются раньше warning", () => {
    const alerts = computeAlerts({
      ...empty,
      role: "admin",
      openStale: 1,
      repairOverdue: 1,
    });
    expect(alerts.map((a) => a.severity)).toEqual(["critical", "warning"]);
  });

  it("русская плюрализация в текстах", () => {
    const t = (n: number) =>
      computeAlerts({ ...empty, role: "dispatcher", brokenNoIncident: n })[0].text;
    expect(t(1)).toContain("1 камера сломана");
    expect(t(3)).toContain("3 камеры сломаны");
    expect(t(15)).toContain("15 камер сломано");
    expect(t(21)).toContain("21 камера сломана");
  });
});
