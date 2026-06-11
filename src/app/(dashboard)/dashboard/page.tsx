import Link from "next/link";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [total, broken, districts, openIncidents] = await Promise.all([
    prisma.camera.count(),
    prisma.camera.count({ where: { isWorking: false } }),
    prisma.district.count(),
    prisma.incident.count({ where: { state: "open" } }),
  ]);
  const working = total - broken;

  const cards = [
    { label: "Камер всего", value: total, href: "/cameras", accent: "text-ink" },
    { label: "В работе", value: working, href: "/cameras?status=working", accent: "text-ok" },
    { label: "Не работает", value: broken, href: "/cameras?status=broken", accent: "text-fail" },
    { label: "Открытых инцидентов", value: openIncidents, href: null, accent: "text-warn" },
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
        {cards.map((c) => {
          const body = (
            <>
              <p className={`text-3xl font-semibold font-mono ${c.accent}`}>
                {c.value.toLocaleString("ru-RU")}
              </p>
              <p className="text-sm text-ink-soft mt-1">{c.label}</p>
            </>
          );
          return c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="bg-surface border border-line rounded-lg p-5 hover:border-accent transition-colors"
            >
              {body}
            </Link>
          ) : (
            <div key={c.label} className="bg-surface border border-line rounded-lg p-5">
              {body}
            </div>
          );
        })}
      </div>

      {total > 0 && (
        <div className="bg-surface border border-line rounded-lg p-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-ink-soft">Доля работающих камер</span>
            <span className="font-mono">{Math.round((working / total) * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-fail-soft overflow-hidden">
            <div
              className="h-full bg-ok rounded-full"
              style={{ width: `${(working / total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
