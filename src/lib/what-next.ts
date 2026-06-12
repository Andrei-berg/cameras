import { plural } from "@/lib/plural";

/** Контекстная подсказка «что сделать дальше» — по роли и состоянию данных.
 *  В отличие от тревог (что горит) — это мягкая навигация к следующему шагу. */

export interface WhatNext {
  text: string;
  cta: string;
  href: string;
}

export interface WhatNextInput {
  role: string;
  /** всего пользователей в системе (включая системного и себя) */
  usersCount: number;
  /** объектов без координат (не видны на карте) */
  geoPending: number;
  /** дней с последнего импорта реестра; null — не импортировали ни разу через UI */
  lastImportDays: number | null;
  /** самый старый открытый инцидент */
  oldestOpen: { id: string; name: string; days: number } | null;
}

export function computeWhatNext(i: WhatNextInput): WhatNext | null {
  const isAdmin = i.role === "admin";

  if (isAdmin && i.usersCount <= 2) {
    return {
      text: "В системе пока только вы. Создайте учётки диспетчерам и инженерам — у каждой роли свой рабочий экран.",
      cta: "Создать пользователей",
      href: "/admin",
    };
  }
  if (isAdmin && i.geoPending > 0) {
    return {
      text: `${i.geoPending} ${plural(i.geoPending, ["объект не виден", "объекта не видны", "объектов не видны"])} на карте — назначьте им координаты.`,
      cta: "Разметить",
      href: "/admin/geo",
    };
  }
  if (isAdmin && (i.lastImportDays === null || i.lastImportDays > 7)) {
    return {
      text:
        i.lastImportDays === null
          ? "Реестр ещё ни разу не обновлялся через систему. Загрузите свежий Excel — статусы и инциденты обновятся автоматически."
          : `Реестр не обновлялся ${i.lastImportDays} ${plural(i.lastImportDays, ["день", "дня", "дней"])}. Загрузите свежий Excel.`,
      cta: "Импортировать",
      href: "/admin",
    };
  }
  if (["engineer", "dispatcher"].includes(i.role) && i.oldestOpen) {
    return {
      text: `Самый старый открытый инцидент — «${i.oldestOpen.name}», висит ${i.oldestOpen.days} ${plural(i.oldestOpen.days, ["день", "дня", "дней"])}. Начните с него.`,
      cta: "Открыть",
      href: `/incidents/${i.oldestOpen.id}`,
    };
  }
  return null;
}
