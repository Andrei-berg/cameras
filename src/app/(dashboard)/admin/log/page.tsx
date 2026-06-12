import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { actionLabel } from "@/lib/action-labels";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
});

const entityHref: Record<string, (id: string) => string> = {
  incident: (id) => `/incidents/${id}`,
  camera: (id) => `/cameras/${id}`,
};

export default async function LogPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") redirect("/dashboard");

  const entries = await prisma.actionLog.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="space-y-4 max-w-4xl">
      <Link href="/admin" className="text-sm text-accent hover:underline">
        ← Администрирование
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Журнал действий</h1>
        <p className="text-sm text-ink-soft">
          Кто, что и когда менял в системе · последние {entries.length}
        </p>
      </div>

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-strong bg-canvas/60 text-left text-xs uppercase tracking-wider text-ink-soft">
              <th className="px-4 py-2.5 font-medium">Когда</th>
              <th className="px-3 py-2.5 font-medium">Кто</th>
              <th className="px-3 py-2.5 font-medium">Действие</th>
              <th className="px-3 py-2.5 font-medium">Детали</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const href = e.entityId ? entityHref[e.entityType]?.(e.entityId) : undefined;
              return (
                <tr key={e.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-ink-soft whitespace-nowrap">
                    {dateFmt.format(e.createdAt)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{e.user.name}</td>
                  <td className="px-3 py-2">
                    {href ? (
                      <Link href={href} className="text-accent hover:underline">
                        {actionLabel(e.action)}
                      </Link>
                    ) : (
                      actionLabel(e.action)
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-ink-faint break-all">
                    {e.details ? JSON.stringify(e.details).slice(0, 120) : "—"}
                  </td>
                </tr>
              );
            })}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-faint">
                  Журнал пуст — записи появятся при первых действиях в системе
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
