import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

/** Экспорт реестра камер в Excel с учётом фильтров страницы /cameras */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const where: Prisma.CameraWhereInput = {};
  const objectFilter: Prisma.ObjectWhereInput = {};
  if (sp.get("district")) objectFilter.districtId = sp.get("district")!;
  if (sp.get("program")) objectFilter.program = sp.get("program")!;
  if (sp.get("status") === "working") where.isWorking = true;
  if (sp.get("status") === "broken") where.isWorking = false;
  const q = sp.get("q")?.trim();
  if (q) {
    objectFilter.name = { contains: q, mode: "insensitive" };
  }
  if (Object.keys(objectFilter).length) where.object = objectFilter;

  const cameras = await prisma.camera.findMany({
    where,
    include: { object: { include: { district: true } } },
    orderBy: [{ object: { name: "asc" } }, { cameraNumber: "asc" }],
  });

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const ws = wb.addWorksheet("Камеры");
  ws.columns = [
    { header: "Объект", key: "object", width: 50 },
    { header: "Участок", key: "district", width: 22 },
    { header: "№ камеры", key: "num", width: 10 },
    { header: "Программа", key: "program", width: 12 },
    { header: "ДДП", key: "ddp", width: 14 },
    { header: "IP контроллера", key: "ip", width: 16 },
    { header: "Порт", key: "port", width: 7 },
    { header: "Модель", key: "model", width: 18 },
    { header: "Имя KSVD", key: "ksvd", width: 24 },
    { header: "Статус", key: "status", width: 13 },
    { header: "Изменён", key: "changed", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.autoFilter = "A1:K1";
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const c of cameras) {
    const row = ws.addRow({
      object: c.object.name,
      district: c.object.district.name,
      num: c.cameraNumber,
      program: c.object.program,
      ddp: c.ddpGroup ?? "",
      ip: c.controllerIp ?? "",
      port: c.port ?? "",
      model: c.model ?? "",
      ksvd: c.ksvdName ?? "",
      status: c.isWorking ? "Работает" : "Не работает",
      changed: c.lastStatusChange ?? "",
    });
    if (!c.isWorking) {
      row.getCell("status").font = { color: { argb: "FFC2333B" }, bold: true };
    }
  }

  const ws2 = wb.addWorksheet("По участкам");
  ws2.columns = [
    { header: "Участок", key: "d", width: 26 },
    { header: "Камер", key: "t", width: 10 },
    { header: "Работает", key: "w", width: 10 },
    { header: "Не работает", key: "b", width: 12 },
    { header: "Доля работающих", key: "p", width: 16 },
  ];
  ws2.getRow(1).font = { bold: true };
  const agg = new Map<string, { t: number; b: number }>();
  for (const c of cameras) {
    const k = c.object.district.name;
    const a = agg.get(k) ?? { t: 0, b: 0 };
    a.t++;
    if (!c.isWorking) a.b++;
    agg.set(k, a);
  }
  for (const [d, a] of [...agg].sort((x, y) => x[0].localeCompare(y[0], "ru"))) {
    ws2.addRow({ d, t: a.t, w: a.t - a.b, b: a.b, p: a.t ? (a.t - a.b) / a.t : 0 });
  }
  ws2.getColumn("p").numFmt = "0%";

  const buf = await wb.xlsx.writeBuffer();
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(buf as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cameras_${date}.xlsx"`,
    },
  });
}
