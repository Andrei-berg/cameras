import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import StatusBadge from "@/components/StatusBadge";
import IncidentStateBadge from "@/components/IncidentStateBadge";
import { createIncidentAction } from "../../incidents/actions";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function TechRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-line last:border-0">
      <span className="text-ink-soft text-sm">{label}</span>
      <span className="font-mono text-sm text-right break-all">{value ?? "—"}</span>
    </div>
  );
}

export default async function CameraPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const canReport = ["dispatcher", "engineer", "admin"].includes(session?.user.role ?? "");

  const camera = await prisma.camera.findUnique({
    where: { id },
    include: {
      object: { include: { district: true } },
      incidents: { orderBy: { detectedAt: "desc" }, take: 30 },
    },
  });

  if (!camera) notFound();

  return (
    <div className="space-y-4 max-w-5xl">
      <Link href="/cameras" className="text-sm text-accent hover:underline">
        ← К реестру камер
      </Link>

      <div className="bg-surface border border-line rounded-lg p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-widest text-ink-faint mb-1">
            {camera.object.district.name} · {camera.object.structureType}
          </p>
          <h1 className="text-xl font-semibold">
            {camera.object.name}{" "}
            <span className="font-mono text-ink-soft">№{camera.cameraNumber}</span>
          </h1>
          <p className="text-sm text-ink-soft mt-1">
            Программа: {camera.object.program}
            {camera.ddpGroup ? ` · ${camera.ddpGroup}` : ""}
            {!camera.object.isCommissioned && (
              <span className="ml-2 px-2 py-0.5 rounded-full text-xs bg-warn-soft text-warn">
                не принят в эксплуатацию
              </span>
            )}
          </p>
        </div>
        <div className="text-right space-y-1">
          <StatusBadge isWorking={camera.isWorking} />
          {camera.lastStatusChange && (
            <p className="text-xs text-ink-faint">
              статус изменён {dateFmt.format(camera.lastStatusChange)}
            </p>
          )}
        </div>
      </div>

      {canReport && camera.isWorking && (
        <form
          action={createIncidentAction}
          className="bg-surface border border-line rounded-lg p-4 flex gap-2 items-start"
        >
          <input type="hidden" name="cameraId" value={camera.id} />
          <input
            name="reason"
            required
            placeholder="Что случилось? (нет сигнала, разбита, помехи…)"
            className="flex-1 px-3 py-2 text-sm border border-line rounded focus:outline-none focus:border-accent"
          />
          <button className="px-4 py-2 text-sm font-medium text-white bg-fail rounded hover:opacity-90 whitespace-nowrap">
            Зарегистрировать инцидент
          </button>
        </form>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <section className="bg-surface border border-line rounded-lg p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-3">
            Технические данные
          </h2>
          <TechRow label="IP контроллера" value={camera.controllerIp} />
          <TechRow label="Канал (порт)" value={camera.port} />
          <TechRow label="IP камеры" value={camera.ipAddress} />
          <TechRow label="Модель" value={camera.model} />
          <TechRow label="Имя KSVD" value={camera.ksvdName} />
          <TechRow label="Ключ KSVD" value={camera.ksvdKey} />
          <TechRow
            label="Координаты"
            value={
              camera.lat != null && camera.lng != null
                ? `${camera.lat.toFixed(6)}, ${camera.lng.toFixed(6)}`
                : "нет координат"
            }
          />
          <TechRow
            label="RTSP"
            value={
              camera.rtspUrl ? (
                <span className="text-xs">{camera.rtspUrl}</span>
              ) : (
                "—"
              )
            }
          />
        </section>

        <section className="bg-surface border border-line rounded-lg p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-3">
            Инциденты{" "}
            <span className="font-mono text-ink-faint">{camera.incidents.length}</span>
          </h2>
          {camera.incidents.length === 0 ? (
            <p className="text-sm text-ink-faint py-4 text-center">
              Инцидентов не зарегистрировано
            </p>
          ) : (
            <ul className="space-y-3">
              {camera.incidents.map((inc) => {
                return (
                  <li key={inc.id} className="border-l-2 border-line-strong pl-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/incidents/${inc.id}`}>
                        <IncidentStateBadge state={inc.state} />
                      </Link>
                      <span className="text-xs font-mono text-ink-faint">
                        {dateFmt.format(inc.detectedAt)}
                      </span>
                    </div>
                    {inc.dispatcherReason && (
                      <p className="text-sm mt-1">{inc.dispatcherReason}</p>
                    )}
                    {inc.specialistReason && (
                      <p className="text-xs text-ink-soft mt-0.5">
                        Специалист: {inc.specialistReason}
                      </p>
                    )}
                    {inc.resolvedAt && (
                      <p className="text-xs text-ink-faint mt-0.5">
                        закрыт {dateFmt.format(inc.resolvedAt)}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
