import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Быстрый поиск объектов для ⌘K-палитры */
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ objects: [] });

  const objects = await prisma.$queryRaw<
    { id: string; name: string; district: string; total: number; broken: number }[]
  >`
    SELECT o.id, o.name, d.name AS district, count(c.id)::int AS total,
           (count(c.id) FILTER (WHERE NOT c."isWorking"))::int AS broken
    FROM "Object" o
    JOIN "District" d ON d.id = o."districtId"
    LEFT JOIN "Camera" c ON c."objectId" = o.id
    WHERE o.name ILIKE ${"%" + q + "%"}
    GROUP BY o.id, o.name, d.name
    ORDER BY o.name
    LIMIT 8`;

  return NextResponse.json({ objects });
}
