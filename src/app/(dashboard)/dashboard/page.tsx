import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import IncidentStateBadge from "@/components/IncidentStateBadge";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = session?.user.role ?? "dispatcher";
  const showIncidents = ["dispatcher", "engineer", "admin"].includes(role);
  const showDistricts = ["manager", "admin"].includes(role);

  const [total, broken, districts, openIncidents, inRepair, recentOpen, worstDistricts] =
    await Promise.all([
      prisma.camera.count(),
      prisma.camera.count({ where: { isWorking: false } }),
      prisma.district.count(),
      prisma.incident.count({ where: { state: "open" } }),
      prisma.incident.count({ where: { state: "in_repair" } }),
      showIncidents
        ? prisma.incident.findMany({
            where: { state: role === "engineer" ? { in: ["open", "in_repair"] } : "open" },
            include: { camera: { include: { object: true } } },
            orderBy: { detectedAt: "desc" },
            take: 6,
          })
        : Promise.resolve([]),
      showDistricts
        ? prisma.$queryRaw<{ name: string; total: number; broken: number }[]>`
            SELECT d.name, count(*)::int AS total,
                   (count(*) FILTER (WHERE NOT c."isWorking"))::int AS broken
            FROM "Camera" c
            JOIN "Object" o ON o.id = c."objectId"
            JOIN "District" d ON d.id = o."districtId"
            GROUP BY d.name
            ORDER BY (count(*) FILTER (WHERE NOT c."isWorking"))::float / count(*) DESC
            LIMIT 5`
        : Promise.resolve([]),
    ]);
  const working = total - broken;

  const cards = [
    { label: "Камер всего", value: total, href: "/cameras", accent: "text-ink" },
    { label: "В работе", value: working, href: "/cameras?status=working", accent: "text-ok" },
    { label: "Не работает", value: broken, href: "/cameras?status=broken", accent: "text-fail" },
    role === "engineer"
      ? { label: "В ремонте", value: inRepair, href: "/incidents?state=in_repair", accent: "text-warn" }
      : { label: "Открытых инцидентов", value: openIncidents, href: "/incidents?state=open", accent: "text-warn" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Оперативная сводка</h1>
        <p className="text-sm text-ink-soft">
          {districts} участков · мониторинг видеокамер ГБУ «ГОРМОСТ»
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="bg-surface border border-line rounded-lg p-5 hover:border-accent transition-colors"
          >
            <p className={`text-3xl font-semibold font-mono ${c.accent}`}>
              {c.value.toLocaleString("ru-RU")}
            </p>
            <p className="text-sm text-ink-soft mt-1">{c.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        {showIncidents && (
          <section className="bg-surface border border-line rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
                {role === "engineer" ? "Инциденты в работе" : "Последние инциденты"}
              </h2>
              <Link href="/incidents?state=open" className="text-xs text-accent hover:underline">
                все →
              </Link>
            </div>
            <ul className="space-y-2">
              {recentOpen.map((inc) => (
                <li key={inc.id} className="flex items-center gap-2 text-sm">
                  <IncidentStateBadge state={inc.state} />
                  <Link
                    href={`/incidents/${inc.id}`}
                    className="flex-1 truncate text-accent hover:underline"
                  >
                    {inc.camera.object.name} №{inc.camera.cameraNumber}
                  </Link>
                  <span className="font-mono text-xs text-ink-faint whitespace-nowrap">
                    {dateFmt.format(inc.detectedAt)}
                  </span>
                </li>
              ))}
              {recentOpen.length === 0 && (
                <p className="text-sm text-ink-faint py-2">Открытых инцидентов нет</p>
              )}
            </ul>
          </section>
        )}

        {showDistricts && (
          <section className="bg-surface border border-line rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
                Проблемные участки
              </h2>
              <Link href="/reports" className="text-xs text-accent hover:underline">
                отчёты →
              </Link>
            </div>
            <ul className="space-y-2">
              {worstDistricts.map((d) => (
                <li key={d.name} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="font-mono text-xs">
                    <span className="text-fail">{d.broken}</span>
                    <span className="text-ink-soft"> / {d.total}</span>
                  </span>
                  <span className="font-mono text-xs w-10 text-right text-ink-soft">
                    {Math.round(((d.total - d.broken) / d.total) * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="bg-surface border border-line rounded-lg p-5 lg:col-span-2">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-ink-soft">Доля работающих камер</span>
            <span className="font-mono">{total ? Math.round((working / total) * 100) : 0}%</span>
          </div>
          <div className="h-2 rounded-full bg-fail-soft overflow-hidden">
            <div
              className="h-full bg-ok rounded-full"
              style={{ width: `${total ? (working / total) * 100 : 0}%` }}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
