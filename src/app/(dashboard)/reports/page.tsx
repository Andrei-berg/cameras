import Link from "next/link";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" });

function ShareBar({ total, broken }: { total: number; broken: number }) {
  const okPct = total ? ((total - broken) / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 min-w-44">
      <div className="flex-1 h-2 rounded-full bg-fail-soft overflow-hidden">
        <div className="h-full bg-ok rounded-full" style={{ width: `${okPct}%` }} />
      </div>
      <span className="font-mono text-xs w-10 text-right">{Math.round(okPct)}%</span>
    </div>
  );
}

export default async function ReportsPage() {
  const [byDistrict, byProgram, worstObjects, snapshots] = await Promise.all([
    prisma.$queryRaw<{ name: string; total: number; broken: number }[]>`
      SELECT d.name, count(*)::int AS total,
             (count(*) FILTER (WHERE NOT c."isWorking"))::int AS broken
      FROM "Camera" c
      JOIN "Object" o ON o.id = c."objectId"
      JOIN "District" d ON d.id = o."districtId"
      GROUP BY d.name
      ORDER BY (count(*) FILTER (WHERE NOT c."isWorking"))::float / count(*) DESC`,
    prisma.$queryRaw<{ program: string; total: number; broken: number }[]>`
      SELECT o.program, count(*)::int AS total,
             (count(*) FILTER (WHERE NOT c."isWorking"))::int AS broken
      FROM "Camera" c JOIN "Object" o ON o.id = c."objectId"
      GROUP BY o.program ORDER BY count(*) DESC`,
    prisma.$queryRaw<{ id: string; name: string; district: string; total: number; broken: number }[]>`
      SELECT o.id, o.name, d.name AS district, count(*)::int AS total,
             (count(*) FILTER (WHERE NOT c."isWorking"))::int AS broken
      FROM "Camera" c
      JOIN "Object" o ON o.id = c."objectId"
      JOIN "District" d ON d.id = o."districtId"
      GROUP BY o.id, o.name, d.name
      HAVING count(*) FILTER (WHERE NOT c."isWorking") > 0
      ORDER BY (count(*) FILTER (WHERE NOT c."isWorking"))::int DESC
      LIMIT 10`,
    prisma.dailySnapshot.findMany({ orderBy: { snapshotDate: "asc" }, take: 30 }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Отчёты</h1>
        <p className="text-sm text-ink-soft">Состояние парка по участкам и программам</p>
      </div>

      {snapshots.length > 1 && (
        <section className="bg-surface border border-line rounded-lg p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-3">
            Динамика неработающих камер · {snapshots.length} дн.
          </h2>
          <div className="flex items-end gap-1 h-24">
            {snapshots.map((s) => {
              const maxBroken = Math.max(...snapshots.map((x) => x.notWorking), 1);
              return (
                <div
                  key={s.id}
                  className="flex-1 bg-fail/70 rounded-t hover:bg-fail transition-colors"
                  style={{ height: `${(s.notWorking / maxBroken) * 100}%` }}
                  title={`${dateFmt.format(s.snapshotDate)}: ${s.notWorking} не работает из ${s.total}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-ink-faint mt-1 font-mono">
            <span>{dateFmt.format(snapshots[0].snapshotDate)}</span>
            <span>{dateFmt.format(snapshots[snapshots.length - 1].snapshotDate)}</span>
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-4 items-start">
        <section className="bg-surface border border-line rounded-lg overflow-hidden">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft px-4 pt-4 pb-2">
            По участкам
          </h2>
          <table className="w-full text-sm">
            <tbody>
              {byDistrict.map((d) => (
                <tr key={d.name} className="border-t border-line">
                  <td className="px-4 py-2">{d.name}</td>
                  <td className="px-2 py-2 font-mono text-xs text-ink-soft whitespace-nowrap text-right">
                    <span className="text-fail">{d.broken}</span> / {d.total}
                  </td>
                  <td className="px-4 py-2 w-56"><ShareBar total={d.total} broken={d.broken} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="space-y-4">
          <section className="bg-surface border border-line rounded-lg overflow-hidden">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft px-4 pt-4 pb-2">
              По программам
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {byProgram.map((p) => (
                  <tr key={p.program} className="border-t border-line">
                    <td className="px-4 py-2">{p.program}</td>
                    <td className="px-2 py-2 font-mono text-xs text-ink-soft whitespace-nowrap text-right">
                      <span className="text-fail">{p.broken}</span> / {p.total}
                    </td>
                    <td className="px-4 py-2 w-56"><ShareBar total={p.total} broken={p.broken} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="bg-surface border border-line rounded-lg overflow-hidden">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft px-4 pt-4 pb-2">
              Проблемные объекты · топ-10
            </h2>
            <table className="w-full text-sm">
              <tbody>
                {worstObjects.map((o) => (
                  <tr key={o.id} className="border-t border-line">
                    <td className="px-4 py-2">
                      <Link
                        href={`/cameras?q=${encodeURIComponent(o.name.slice(0, 40))}&status=broken`}
                        className="text-accent hover:underline"
                      >
                        {o.name}
                      </Link>
                      <span className="block text-xs text-ink-faint">{o.district}</span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs whitespace-nowrap text-right">
                      <span className="text-fail font-semibold">{o.broken}</span>
                      <span className="text-ink-soft"> / {o.total}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
