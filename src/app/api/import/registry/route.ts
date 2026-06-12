import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logAction } from "@/lib/log-action";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const norm = (s: string) =>
  s.toLowerCase().replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Импорт операционного реестра (лист «Реестр» из Видеокамеры *.xlsm).
 * Обновляет статусы существующих камер; при поломке создаёт инцидент,
 * при восстановлении закрывает открытые. Новые объекты/камеры не создаёт.
 */
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "только администратор" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "файл не передан" }, { status: 400 });
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return NextResponse.json({ error: "не удалось прочитать файл (.xlsx/.xlsm)" }, { status: 400 });
  }
  const ws = wb.getWorksheet("Реестр");
  if (!ws) {
    return NextResponse.json({ error: "лист «Реестр» не найден" }, { status: 400 });
  }

  // Все камеры с объектами — один запрос, lookup в памяти
  const objects = await prisma.object.findMany({
    include: {
      district: { select: { name: true } },
      cameras: { select: { id: true, cameraNumber: true, isWorking: true } },
    },
  });
  const byKey = new Map(objects.map((o) => [`${norm(o.district.name)}::${norm(o.name)}`, o]));

  let district = "", objectName = "";
  const stats = { rows: 0, broken: 0, fixed: 0, unchanged: 0, notFound: 0 };
  const toBreak: { id: string; reason: string | null; at: Date }[] = [];
  const toFix: { id: string; at: Date }[] = [];

  ws.eachRow((row, n) => {
    if (n === 1) return;
    const v = row.values as ExcelJS.CellValue[];
    const s = (i: number) => (v[i] == null ? "" : String(v[i]).trim());
    if (s(5)) district = s(5);
    if (s(9)) objectName = s(9);
    const num = Number(s(10));
    const isWorkingRaw = s(11);
    if (!district || !objectName || !num || isWorkingRaw === "") return;
    stats.rows++;

    const obj = byKey.get(`${norm(district)}::${norm(objectName)}`);
    const cam = obj?.cameras.find((c) => c.cameraNumber === num);
    if (!cam) return void stats.notFound++;

    const isWorking = Number(isWorkingRaw) === 1;
    if (cam.isWorking === isWorking) return void stats.unchanged++;

    const at = v[13] instanceof Date ? (v[13] as Date) : new Date();
    if (isWorking) {
      stats.fixed++;
      toFix.push({ id: cam.id, at });
    } else {
      stats.broken++;
      toBreak.push({ id: cam.id, reason: s(12) || null, at });
    }
  });

  for (const b of toBreak) {
    await prisma.$transaction([
      prisma.camera.update({
        where: { id: b.id },
        data: { isWorking: false, lastStatusChange: b.at },
      }),
      prisma.incident.create({
        data: {
          cameraId: b.id,
          reportedById: session.user.id,
          dispatcherReason: b.reason ?? "Импорт реестра",
          detectedAt: b.at,
          state: "open",
        },
      }),
    ]);
  }
  for (const f of toFix) {
    await prisma.$transaction([
      prisma.camera.update({
        where: { id: f.id },
        data: { isWorking: true, lastStatusChange: f.at },
      }),
      prisma.incident.updateMany({
        where: { cameraId: f.id, state: { not: "resolved" } },
        data: { state: "resolved", resolvedAt: f.at },
      }),
    ]);
  }

  await logAction({
    userId: session.user.id,
    action: "registry.import",
    entityType: "registry",
    details: { file: file.name, ...stats },
  });

  return NextResponse.json({ ok: true, ...stats });
}
