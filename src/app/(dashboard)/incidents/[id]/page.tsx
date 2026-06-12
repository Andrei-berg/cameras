import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import IncidentStateBadge from "@/components/IncidentStateBadge";
import StatusBadge from "@/components/StatusBadge";
import { markVisitAction, resolveIncidentAction } from "../actions";
import IncidentPrint from "@/components/IncidentPrint";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-line last:border-0 text-sm">
      <span className="text-ink-soft shrink-0">{label}</span>
      <span className="text-right">{value ?? "—"}</span>
    </div>
  );
}

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const canWork = ["engineer", "admin"].includes(session?.user.role ?? "");

  const inc = await prisma.incident.findUnique({
    where: { id },
    include: {
      camera: { include: { object: { include: { district: true } } } },
      reportedBy: { select: { name: true } },
    },
  });
  if (!inc) notFound();

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href="/incidents" className="text-sm text-accent hover:underline">
          ← К инцидентам
        </Link>
        <IncidentPrint
          data={{
            objectName: inc.camera.object.name,
            district: inc.camera.object.district.name,
            cameraNumber: inc.camera.cameraNumber,
            controllerIp: inc.camera.controllerIp,
            port: inc.camera.port,
            model: inc.camera.model,
            dispatcherReason: inc.dispatcherReason,
            specialistReason: inc.specialistReason,
            repairNeeded: inc.repairNeeded,
            contractor: inc.contractor,
            detectedAt: inc.detectedAt.toISOString(),
            specialistVisit: inc.specialistVisit?.toISOString() ?? null,
            reportedBy: inc.reportedBy.name,
          }}
        />
      </div>

      <div className="bg-surface border border-line rounded-lg p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-1">
          <h1 className="text-lg font-semibold">
            <Link href={`/cameras/${inc.cameraId}`} className="text-accent hover:underline">
              {inc.camera.object.name}
            </Link>{" "}
            <span className="font-mono text-ink-soft">№{inc.camera.cameraNumber}</span>
          </h1>
          <div className="flex items-center gap-2">
            <IncidentStateBadge state={inc.state} />
            <StatusBadge isWorking={inc.camera.isWorking} />
          </div>
        </div>
        <p className="text-xs text-ink-faint mb-4">
          {inc.camera.object.district.name} · зарегистрировал {inc.reportedBy.name}
        </p>

        <Row label="Причина (диспетчер)" value={inc.dispatcherReason} />
        <Row label="Выявлен" value={dateFmt.format(inc.detectedAt)} />
        <Row label="Выезд специалиста" value={inc.specialistVisit && dateFmt.format(inc.specialistVisit)} />
        <Row label="Диагноз (специалист)" value={inc.specialistReason} />
        <Row label="Требуемый ремонт" value={inc.repairNeeded} />
        <Row label="Подрядчик" value={inc.contractor} />
        <Row label="Устранён" value={inc.resolvedAt && dateFmt.format(inc.resolvedAt)} />
        <Row label="Примечание" value={inc.notes} />
      </div>

      {canWork && inc.state === "open" && (
        <form action={markVisitAction} className="bg-surface border border-line rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Выезд специалиста
          </h2>
          <input type="hidden" name="id" value={inc.id} />
          <textarea
            name="specialistReason"
            required
            rows={2}
            placeholder="Диагноз: что выявлено на месте"
            className="w-full px-3 py-2 text-sm border border-line rounded focus:outline-none focus:border-accent"
          />
          <input
            name="repairNeeded"
            placeholder="Требуемый ремонт (необязательно)"
            className="w-full px-3 py-2 text-sm border border-line rounded focus:outline-none focus:border-accent"
          />
          <button className="px-4 py-1.5 text-sm font-medium text-white bg-warn rounded hover:opacity-90">
            Зафиксировать выезд → в ремонт
          </button>
        </form>
      )}

      {canWork && inc.state !== "resolved" && (
        <form action={resolveIncidentAction} className="bg-surface border border-line rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Закрытие инцидента
          </h2>
          <input type="hidden" name="id" value={inc.id} />
          <textarea
            name="notes"
            rows={2}
            placeholder="Что сделано (необязательно)"
            className="w-full px-3 py-2 text-sm border border-line rounded focus:outline-none focus:border-accent"
          />
          <button className="px-4 py-1.5 text-sm font-medium text-white bg-ok rounded hover:opacity-90">
            Устранено — закрыть
          </button>
          <p className="text-xs text-ink-faint">
            Камера автоматически вернётся в статус «работает», если на ней нет других открытых инцидентов.
          </p>
        </form>
      )}
    </div>
  );
}
