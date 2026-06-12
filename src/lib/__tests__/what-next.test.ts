import { describe, it, expect } from "vitest";
import { computeWhatNext, type WhatNextInput } from "../what-next";

const base: WhatNextInput = {
  role: "admin",
  usersCount: 10,
  geoPending: 0,
  lastImportDays: 1,
  oldestOpen: null,
};

describe("computeWhatNext", () => {
  it("админ один в системе → создать пользователей (высший приоритет)", () => {
    const r = computeWhatNext({ ...base, usersCount: 2, geoPending: 5 });
    expect(r?.href).toBe("/admin");
    expect(r?.cta).toBe("Создать пользователей");
  });

  it("есть объекты без координат → разметка", () => {
    const r = computeWhatNext({ ...base, geoPending: 78 });
    expect(r?.href).toBe("/admin/geo");
    expect(r?.text).toContain("78 объектов не видны");
  });

  it("реестр не обновлялся > 7 дней → импорт", () => {
    expect(computeWhatNext({ ...base, lastImportDays: 9 })?.cta).toBe("Импортировать");
    expect(computeWhatNext({ ...base, lastImportDays: null })?.text).toContain("ни разу");
    expect(computeWhatNext({ ...base, lastImportDays: 3 })).toBeNull();
  });

  it("инженеру — самый старый открытый инцидент", () => {
    const r = computeWhatNext({
      ...base,
      role: "engineer",
      oldestOpen: { id: "i1", name: "Мост", days: 12 },
    });
    expect(r?.href).toBe("/incidents/i1");
    expect(r?.text).toContain("12 дней");
  });

  it("админские подсказки не показываются диспетчеру", () => {
    expect(
      computeWhatNext({ ...base, role: "dispatcher", geoPending: 10, lastImportDays: null })
    ).toBeNull();
  });

  it("всё в порядке → null", () => {
    expect(computeWhatNext(base)).toBeNull();
  });
});
