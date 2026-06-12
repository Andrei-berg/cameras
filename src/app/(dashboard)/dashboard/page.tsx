import Link from "next/link";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import IncidentStateBadge from "@/components/IncidentStateBadge";
import AlertBanners from "@/components/AlertBanners";
import WhatNextBanner from "@/components/WhatNextBanner";
import { getAlerts } from "@/lib/alerts";
import { computeWhatNext } from "@/lib/what-next";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

function Donut({ working, total }: { working: number; total: number }) {
  const pct = total ? working / total : 0;
  const C = 2 * Math.PI * 54;
  return (
    <div className="relative size-44 shrink-0">
      <svg viewBox="0 0 128 128" className="size-44 -rotate-90">
        <circle cx="64" cy="64" r="54" fill="none" stroke="var(--color-fail-soft)" strokeWidth="14" />
        <circle
          cx="64" cy="64" r="54" fill="none"
          stroke="var(--color-ok)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${C * pct} ${C}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold font-mono">{Math.round(pct * 100)}%</span>
        <span className="text-xs text-ink-soft">в работе</span>
      </div>
    </div>
  );
}

/** Цвет плитки участка: зелёный (всё работает) → красный (всё сломано);
 *  light-dark() переключается вместе с color-scheme темы */
function tileStyle(share: number) {
  const hue = Math.round(120 * share);
  return {
    background: `light-dark(hsl(${hue} 55% 94%), hsl(${hue} 45% 14%))`,
    borderColor: `light-dark(hsl(${hue} 45% 70%), hsl(${hue} 45% 32%))`,
    color: `light-dark(hsl(${hue} 70% 24%), hsl(${hue} 55% 68%))`,
  };
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const role = session?.user.role ?? "dispatcher";
  const showIncidents = ["dispatcher", "engineer", "admin"].includes(role);

  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const [alerts, total, broken, openIncidents, inRepair, recentOpen, districts, d24] =
    await Promise.all([
      getAlerts(role),
      prisma.camera.count(),
      prisma.camera.count({ where: { isWorking: false } }),
      prisma.incident.count({ where: { state: "open" } }),
      prisma.incident.count({ where: { state: "in_repair" } }),
      showIncidents
        ? prisma.incident.findMany({
            where: { state: role === "engineer" ? { in: ["open", "in_repair"] } : "open" },
            include: { camera: { include: { object: true } } },
            orderBy: { detectedAt: "desc" },
            take: 7,
          })
        : Promise.resolve([]),
      prisma.$queryRaw<{ id: string; name: string; total: number; broken: number }[]>`
        SELECT d.id, d.name, count(c.id)::int AS total,
               (count(c.id) FILTER (WHERE NOT c."isWorking"))::int AS broken
        FROM "District" d
        JOIN "Object" o ON o."districtId" = d.id
        JOIN "Camera" c ON c."objectId" = o.id
        GROUP BY d.id, d.name
        ORDER BY (count(c.id) FILTER (WHERE NOT c."isWorking"))::float / count(c.id) DESC`,
      Promise.all([
        prisma.camera.count({ where: { isWorking: false, lastStatusChange: { gt: dayAgo } } }),
        prisma.camera.count({ where: { isWorking: true, lastStatusChange: { gt: dayAgo } } }),
        prisma.incident.count({ where: { detectedAt: { gt: dayAgo } } }),
      ]),
    ]);
  const working = total - broken;
  const [brokeToday, fixedToday, newIncidents] = d24;

  // «что дальше» — мягкая подсказка по роли и состоянию данных (§9 gormost)
  const [usersCount, geoPendingRows, lastImport, oldestOpenInc] = await Promise.all([
    prisma.user.count(),
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM (
        SELECT o.id FROM "Object" o JOIN "Camera" c ON c."objectId" = o.id
        GROUP BY o.id HAVING count(c.lat) = 0
      ) t`,
    prisma.actionLog.findFirst({
      where: { action: "registry.import" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    role === "engineer" || role === "dispatcher"
      ? prisma.incident.findFirst({
          where: { state: "open" },
          orderBy: { detectedAt: "asc" },
          include: { camera: { include: { object: { select: { name: true } } } } },
        })
      : Promise.resolve(null),
  ]);
  const whatNext = computeWhatNext({
    role,
    usersCount,
    geoPending: geoPendingRows[0]?.n ?? 0,
    lastImportDays: lastImport
      ? Math.floor((Date.now() - lastImport.createdAt.getTime()) / 86_400_000)
      : null,
    oldestOpen: oldestOpenInc
      ? {
          id: oldestOpenInc.id,
          name: `${oldestOpenInc.camera.object.name} №${oldestOpenInc.camera.cameraNumber}`,
          days: Math.floor((Date.now() - oldestOpenInc.detectedAt.getTime()) / 86_400_000),
        }
      : null,
  });

  const stats = [
    { label: "Камер всего", value: total, href: "/cameras", cls: "border-l-accent" },
    { label: "В работе", value: working, href: "/cameras?status=working", cls: "border-l-ok text-ok" },
    { label: "Не работает", value: broken, href: "/cameras?status=broken", cls: "border-l-fail text-fail" },
    role === "engineer"
      ? { label: "В ремонте", value: inRepair, href: "/incidents?state=in_repair", cls: "border-l-warn text-warn" }
      : { label: "Открытых инцидентов", value: openIncidents, href: "/incidents?state=open", cls: "border-l-warn text-warn" },
  ];

  return (
    <div className="space-y-5">
      <AlertBanners alerts={alerts} />
      <WhatNextBanner next={whatNext} />

      {/* дельты за 24 ч (паттерн Datadog): движение, а не абсолюты */}
      <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
        <span className="text-ink-faint uppercase tracking-wider">за 24 ч:</span>
        <span className={`px-2.5 py-1 rounded border ${brokeToday > 0 ? "bg-fail-soft text-fail border-fail/20" : "bg-surface text-ink-faint border-line"}`}>
          +{brokeToday} сломалось
        </span>
        <span className={`px-2.5 py-1 rounded border ${fixedToday > 0 ? "bg-ok-soft text-ok border-ok/20" : "bg-surface text-ink-faint border-line"}`}>
          −{fixedToday} починили
        </span>
        <span className={`px-2.5 py-1 rounded border ${newIncidents > 0 ? "bg-warn-soft text-warn border-warn/20" : "bg-surface text-ink-faint border-line"}`}>
          {newIncidents} новых инцидентов
        </span>
      </div>

      <div className="bg-surface border border-line rounded-lg p-6 flex flex-wrap items-center gap-8">
        <Donut working={working} total={total} />
        <div className="flex-1 grid grid-cols-2 gap-3 min-w-64">
          {stats.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              className={`border border-line border-l-4 rounded-lg px-4 py-3 hover:border-accent transition-colors bg-canvas/40 ${s.cls}`}
            >
              <span className="block text-2xl font-semibold font-mono">
                {s.value.toLocaleString("ru-RU")}
              </span>
              <span className="text-xs text-ink-soft">{s.label}</span>
            </Link>
          ))}
        </div>
        {showIncidents && (
          <div className="flex-1 min-w-72">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
                {role === "engineer" ? "Инциденты в работе" : "Последние инциденты"}
              </h2>
              <Link href="/incidents?state=open" className="text-xs text-accent hover:underline">
                все →
              </Link>
            </div>
            <ul className="space-y-1.5">
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
          </div>
        )}
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-soft mb-2">
          Участки · доля работающих камер
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
          {districts.map((d) => {
            const share = d.total ? (d.total - d.broken) / d.total : 1;
            return (
              <Link
                key={d.id}
                href={`/cameras?district=${d.id}&status=broken`}
                className="border rounded-lg p-3 hover:scale-[1.03] transition-transform"
                style={tileStyle(share)}
                title={`${d.name}: не работает ${d.broken} из ${d.total}`}
              >
                <span className="block text-lg font-semibold font-mono">
                  {Math.round(share * 100)}%
                </span>
                <span className="block text-[11px] leading-tight truncate opacity-80">
                  {d.name}
                </span>
                <span className="block text-[10px] font-mono opacity-60">
                  {d.broken} / {d.total}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
