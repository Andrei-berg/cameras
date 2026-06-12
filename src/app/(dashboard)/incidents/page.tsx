import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import IncidentStateBadge from "@/components/IncidentStateBadge";
import KanbanBoard, { type KanbanCard } from "@/components/KanbanBoard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** Возраст инцидента: < 24ч зелёный, < 3д янтарный, дольше — красный */
function age(from: Date) {
  const h = (Date.now() - from.getTime()) / 3600_000;
  const label = h < 1 ? "< 1 ч" : h < 48 ? `${Math.round(h)} ч` : `${Math.round(h / 24)} д`;
  const cls = h < 24 ? "text-ok" : h < 72 ? "text-warn" : "text-fail";
  return { label, cls };
}

type SP = { state?: string; q?: string; district?: string; page?: string; view?: string };

const BOARD_LIMIT = 25;

async function boardCards(
  base: Prisma.IncidentWhereInput
): Promise<KanbanCard[]> {
  const fetch = (state: string, oldestFirst: boolean) =>
    prisma.incident.findMany({
      where: { ...base, state },
      include: { camera: { include: { object: { include: { district: true } } } } },
      orderBy: { detectedAt: oldestFirst ? "asc" : "desc" },
      take: BOARD_LIMIT,
    });
  const [open, repair, resolved] = await Promise.all([
    fetch("open", true),
    fetch("in_repair", true),
    fetch("resolved", false),
  ]);
  return [...open, ...repair, ...resolved].map((i) => ({
    id: i.id,
    objectName: i.camera.object.name,
    cameraNumber: i.camera.cameraNumber,
    district: i.camera.object.district.name,
    reason: i.dispatcherReason,
    detectedAt: i.detectedAt.toISOString(),
    state: i.state,
  }));
}

function href(sp: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  const merged = { ...sp, page: undefined, ...patch };
  for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
  const qs = p.toString();
  return qs ? `/incidents?${qs}` : "/incidents";
}

export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const isBoard = sp.view === "board";
  const session = await auth.api.getSession({ headers: await headers() });
  const canWork = ["engineer", "admin"].includes(session?.user.role ?? "");

  const where: Prisma.IncidentWhereInput = {};
  if (sp.state) where.state = sp.state;
  const objFilter: Prisma.ObjectWhereInput = {};
  if (sp.q?.trim()) objFilter.name = { contains: sp.q.trim(), mode: "insensitive" };
  if (sp.district) objFilter.districtId = sp.district;
  const baseWhere: Prisma.IncidentWhereInput = {};
  if (Object.keys(objFilter).length) {
    where.camera = { object: objFilter };
    baseWhere.camera = { object: objFilter };
  }

  const [districts, counts, total, incidents, cards] = await Promise.all([
    prisma.district.findMany({ orderBy: { name: "asc" } }),
    prisma.incident.groupBy({ by: ["state"], _count: true, where: baseWhere }),
    prisma.incident.count({ where }),
    prisma.incident.findMany({
      where,
      include: {
        camera: { include: { object: { include: { district: true } } } },
        reportedBy: { select: { name: true } },
      },
      // активные — старые сверху (приоритет на просроченное), закрытые — свежие
      orderBy: { detectedAt: sp.state && sp.state !== "resolved" ? "asc" : "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: isBoard ? 1 : PAGE_SIZE,
    }),
    isBoard ? boardCards(baseWhere) : Promise.resolve([]),
  ]);

  const countBy = Object.fromEntries(counts.map((c) => [c.state, c._count]));
  const totalAll = counts.reduce((s, c) => s + c._count, 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tabs = [
    { key: "", label: `Все ${totalAll.toLocaleString("ru-RU")}` },
    { key: "open", label: `Открытые ${(countBy.open ?? 0).toLocaleString("ru-RU")}` },
    { key: "in_repair", label: `В ремонте ${(countBy.in_repair ?? 0).toLocaleString("ru-RU")}` },
    { key: "resolved", label: `Закрытые ${(countBy.resolved ?? 0).toLocaleString("ru-RU")}` },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Инциденты</h1>
        <p className="text-sm text-ink-soft">Неисправности камер и ход их устранения</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-surface border border-line rounded-lg p-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={href(sp, { state: t.key || undefined })}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                (sp.state ?? "") === t.key
                  ? "bg-accent text-white font-medium"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <form action="/incidents" className="flex gap-2 flex-1 min-w-52">
          {sp.state && <input type="hidden" name="state" value={sp.state} />}
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Поиск по объекту…"
            className="flex-1 px-3 py-1.5 text-sm bg-surface border border-line rounded focus:outline-none focus:border-accent"
          />
          <select
            name="district"
            defaultValue={sp.district ?? ""}
            className="px-2 py-1.5 text-sm border border-line rounded bg-surface"
          >
            <option value="">Все участки</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <button className="px-3 py-1.5 text-sm border border-line bg-surface rounded hover:border-accent">
            Найти
          </button>
        </form>
        <div className="flex gap-1 bg-surface border border-line rounded-lg p-1">
          {[
            { v: undefined, label: "Список" },
            { v: "board", label: "Доска" },
          ].map((t) => (
            <Link
              key={t.label}
              href={href(sp, { view: t.v })}
              className={`px-3 py-1.5 text-sm rounded transition-colors ${
                isBoard === (t.v === "board")
                  ? "bg-accent text-white font-medium"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {isBoard && (
        <KanbanBoard
          cards={cards}
          totals={{
            open: countBy.open ?? 0,
            in_repair: countBy.in_repair ?? 0,
            resolved: countBy.resolved ?? 0,
          }}
          canWork={canWork}
        />
      )}

      {!isBoard && (
      <>

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-strong bg-canvas/60 text-left text-xs uppercase tracking-wider text-ink-soft">
              <th className="px-4 py-2.5 font-medium">Объект · камера</th>
              <th className="px-3 py-2.5 font-medium">Участок</th>
              <th className="px-3 py-2.5 font-medium">Причина (диспетчер)</th>
              <th className="px-3 py-2.5 font-medium">Давность</th>
              <th className="px-3 py-2.5 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((inc) => (
              <tr key={inc.id} className="border-b border-line last:border-0 hover:bg-canvas/50">
                <td className="px-4 py-2">
                  <Link href={`/incidents/${inc.id}`} className="text-accent hover:underline font-medium">
                    {inc.camera.object.name}
                  </Link>{" "}
                  <span className="font-mono text-ink-soft">№{inc.camera.cameraNumber}</span>
                </td>
                <td className="px-3 py-2 text-ink-soft whitespace-nowrap">
                  {inc.camera.object.district.name}
                </td>
                <td className="px-3 py-2 text-ink-soft max-w-md truncate">
                  {inc.dispatcherReason ?? "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {inc.state === "resolved" ? (
                    <span className="font-mono text-xs text-ink-faint">
                      {dateFmt.format(inc.detectedAt)}
                    </span>
                  ) : (
                    <>
                      <span className={`font-mono font-semibold ${age(inc.detectedAt).cls}`}>
                        {age(inc.detectedAt).label}
                      </span>
                      <span className="block font-mono text-[10px] text-ink-faint">
                        {dateFmt.format(inc.detectedAt)}
                      </span>
                    </>
                  )}
                </td>
                <td className="px-3 py-2">
                  <IncidentStateBadge state={inc.state} />
                </td>
              </tr>
            ))}
            {incidents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-ink-faint">
                  Инцидентов не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-soft">Страница {page} из {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={href(sp, { page: String(page - 1) })} className="px-3 py-1.5 bg-surface border border-line rounded hover:border-accent">← Назад</Link>
            )}
            {page < totalPages && (
              <Link href={href(sp, { page: String(page + 1) })} className="px-3 py-1.5 bg-surface border border-line rounded hover:border-accent">Вперёд →</Link>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
