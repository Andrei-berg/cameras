import Link from "next/link";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

type SearchParams = {
  q?: string;
  district?: string;
  program?: string;
  status?: string;
  page?: string;
};

function buildWhere(sp: SearchParams): Prisma.CameraWhereInput {
  const where: Prisma.CameraWhereInput = {};

  const objectFilter: Prisma.ObjectWhereInput = {};
  if (sp.district) objectFilter.districtId = sp.district;
  if (sp.program) objectFilter.program = sp.program;

  if (sp.status === "working") where.isWorking = true;
  if (sp.status === "broken") where.isWorking = false;

  const q = sp.q?.trim();
  if (q) {
    where.OR = [
      { object: { ...objectFilter, name: { contains: q, mode: "insensitive" } } },
      { ksvdName: { contains: q, mode: "insensitive" } },
      { controllerIp: { contains: q } },
      { ipAddress: { contains: q } },
    ];
    // объектные фильтры должны действовать и на не-именные ветки OR
    if (sp.district || sp.program) {
      where.OR = where.OR.map((branch) =>
        "object" in branch ? branch : { ...branch, object: objectFilter }
      );
    }
  } else if (sp.district || sp.program) {
    where.object = objectFilter;
  }

  return where;
}

function pageHref(sp: SearchParams, page: number) {
  const params = new URLSearchParams();
  if (sp.q) params.set("q", sp.q);
  if (sp.district) params.set("district", sp.district);
  if (sp.program) params.set("program", sp.program);
  if (sp.status) params.set("status", sp.status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/cameras?${qs}` : "/cameras";
}

export default async function CamerasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const where = buildWhere(sp);
  const page = Math.max(1, Number(sp.page) || 1);

  const [total, working, districts, programs, cameras] = await Promise.all([
    prisma.camera.count({ where }),
    prisma.camera.count({ where: { AND: [where, { isWorking: true }] } }),
    prisma.district.findMany({ orderBy: { name: "asc" } }),
    prisma.object.findMany({
      select: { program: true },
      distinct: ["program"],
      orderBy: { program: "asc" },
    }),
    prisma.camera.findMany({
      where,
      include: { object: { include: { district: true } } },
      orderBy: [{ object: { name: "asc" } }, { cameraNumber: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const broken = total - working;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Реестр камер</h1>
          <p className="text-sm text-ink-soft">
            Видеокамеры на объектах ГБУ «ГОРМОСТ»
          </p>
        </div>
        <div className="flex gap-2 font-mono text-sm">
          <div className="px-3 py-1.5 bg-surface border border-line rounded">
            всего <strong>{total.toLocaleString("ru-RU")}</strong>
          </div>
          <div className="px-3 py-1.5 bg-ok-soft text-ok border border-ok/20 rounded">
            в работе <strong>{working.toLocaleString("ru-RU")}</strong>
          </div>
          <div className="px-3 py-1.5 bg-fail-soft text-fail border border-fail/20 rounded">
            не работает <strong>{broken.toLocaleString("ru-RU")}</strong>
            {total > 0 && (
              <span className="opacity-70"> · {Math.round((broken / total) * 100)}%</span>
            )}
          </div>
        </div>
      </div>

      <form
        action="/cameras"
        className="bg-surface border border-line rounded-lg p-3 flex flex-wrap items-center gap-2"
      >
        <input
          type="search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Объект, имя KSVD или IP…"
          className="flex-1 min-w-56 px-3 py-1.5 text-sm border border-line rounded focus:outline-none focus:border-accent"
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
        <select
          name="program"
          defaultValue={sp.program ?? ""}
          className="px-2 py-1.5 text-sm border border-line rounded bg-surface"
        >
          <option value="">Все программы</option>
          {programs.map((p) => (
            <option key={p.program} value={p.program}>
              {p.program}
            </option>
          ))}
        </select>
        <select
          name="status"
          defaultValue={sp.status ?? ""}
          className="px-2 py-1.5 text-sm border border-line rounded bg-surface"
        >
          <option value="">Любой статус</option>
          <option value="working">Работает</option>
          <option value="broken">Не работает</option>
        </select>
        <button
          type="submit"
          className="px-4 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-deep rounded transition-colors"
        >
          Найти
        </button>
        {(sp.q || sp.district || sp.program || sp.status) && (
          <Link href="/cameras" className="px-2 py-1.5 text-sm text-ink-soft hover:text-ink">
            Сбросить
          </Link>
        )}
      </form>

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-strong bg-canvas/60 text-left text-xs uppercase tracking-wider text-ink-soft">
              <th className="px-4 py-2.5 font-medium">Объект</th>
              <th className="px-3 py-2.5 font-medium">Участок</th>
              <th className="px-3 py-2.5 font-medium text-right">№</th>
              <th className="px-3 py-2.5 font-medium">Программа</th>
              <th className="px-3 py-2.5 font-medium">ДДП</th>
              <th className="px-3 py-2.5 font-medium">Контроллер</th>
              <th className="px-3 py-2.5 font-medium">Статус</th>
            </tr>
          </thead>
          <tbody>
            {cameras.map((cam) => (
              <tr
                key={cam.id}
                className="border-b border-line last:border-0 hover:bg-canvas/50 transition-colors"
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/cameras/${cam.id}`}
                    className="text-accent hover:underline font-medium"
                  >
                    {cam.object.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-ink-soft whitespace-nowrap">
                  {cam.object.district.name}
                </td>
                <td className="px-3 py-2 text-right font-mono">{cam.cameraNumber}</td>
                <td className="px-3 py-2 text-ink-soft">{cam.object.program}</td>
                <td className="px-3 py-2 text-ink-soft whitespace-nowrap">
                  {cam.ddpGroup ?? "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink-soft whitespace-nowrap">
                  {cam.controllerIp
                    ? `${cam.controllerIp}${cam.port != null ? `:${cam.port}` : ""}`
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge isWorking={cam.isWorking} />
                </td>
              </tr>
            ))}
            {cameras.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-ink-faint">
                  Камеры не найдены — измените условия фильтра
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-soft">
            Страница {page} из {totalPages.toLocaleString("ru-RU")}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={pageHref(sp, page - 1)}
                className="px-3 py-1.5 bg-surface border border-line rounded hover:border-accent transition-colors"
              >
                ← Назад
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={pageHref(sp, page + 1)}
                className="px-3 py-1.5 bg-surface border border-line rounded hover:border-accent transition-colors"
              >
                Вперёд →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
