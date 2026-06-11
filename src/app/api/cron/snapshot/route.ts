import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Ежедневный снапшот состояния парка камер (для трендов в отчётах).
 * Вызывается Vercel Cron (vercel.json); защита — заголовок Authorization
 * с CRON_SECRET (Vercel подставляет его автоматически).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [total, notWorking, inRepair, byDistrict, byProgram] = await Promise.all([
    prisma.camera.count(),
    prisma.camera.count({ where: { isWorking: false } }),
    prisma.incident.count({ where: { state: "in_repair" } }),
    prisma.$queryRaw<{ name: string; total: number; broken: number }[]>`
      SELECT d.name, count(*)::int AS total,
             (count(*) FILTER (WHERE NOT c."isWorking"))::int AS broken
      FROM "Camera" c
      JOIN "Object" o ON o.id = c."objectId"
      JOIN "District" d ON d.id = o."districtId"
      GROUP BY d.name`,
    prisma.$queryRaw<{ program: string; total: number; broken: number }[]>`
      SELECT o.program, count(*)::int AS total,
             (count(*) FILTER (WHERE NOT c."isWorking"))::int AS broken
      FROM "Camera" c JOIN "Object" o ON o.id = c."objectId"
      GROUP BY o.program`,
  ]);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const snapshot = await prisma.dailySnapshot.upsert({
    where: { snapshotDate: today },
    create: {
      snapshotDate: today,
      total,
      working: total - notWorking,
      notWorking,
      inRepair,
      byDistrict: byDistrict as object[],
      byProgram: byProgram as object[],
    },
    update: {
      total,
      working: total - notWorking,
      notWorking,
      inRepair,
      byDistrict: byDistrict as object[],
      byProgram: byProgram as object[],
    },
  });

  return NextResponse.json({ ok: true, date: snapshot.snapshotDate, total, notWorking });
}
