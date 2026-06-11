import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import candidatesJson from "@/data/geo-candidates.json";
import { setObjectCoordsAction } from "./actions";

export const dynamic = "force-dynamic";

interface Candidate {
  key: string;
  score: number;
  lat: number;
  lng: number;
}
interface GeoEntry {
  objectId: string;
  name: string;
  district: string;
  cameras: number;
  candidates: Candidate[];
}

export default async function GeoPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") redirect("/dashboard");

  // объекты, у которых до сих пор нет ни одной камеры с координатами
  const pending = await prisma.$queryRaw<{ id: string }[]>`
    SELECT o.id FROM "Object" o
    JOIN "Camera" c ON c."objectId" = o.id
    GROUP BY o.id
    HAVING count(c.lat) = 0`;
  const pendingIds = new Set(pending.map((p) => p.id));
  const entries = (candidatesJson as GeoEntry[]).filter((e) =>
    pendingIds.has(e.objectId)
  );

  return (
    <div className="space-y-4 max-w-4xl">
      <Link href="/admin" className="text-sm text-accent hover:underline">
        ← Администрирование
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Разметка координат</h1>
        <p className="text-sm text-ink-soft">
          {entries.length} объектов без координат — их камеры не видны на карте.
          Выберите адрес-кандидат из KSVD или введите широту/долготу вручную
          (например, из Яндекс-карт: ПКМ → «Что здесь?»).
        </p>
      </div>

      {entries.length === 0 && (
        <p className="px-4 py-8 bg-ok-soft text-ok border border-ok/20 rounded-lg text-sm text-center">
          Все объекты размечены — карта полная 🎉
        </p>
      )}

      <div className="space-y-3">
        {entries.map((e) => (
          <div key={e.objectId} className="bg-surface border border-line rounded-lg p-4">
            <p className="font-medium">
              {e.name}{" "}
              <span className="text-xs text-ink-faint font-normal">
                {e.district} · камер: {e.cameras}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {e.candidates.map((c, i) => (
                <form key={i} action={setObjectCoordsAction}>
                  <input type="hidden" name="objectId" value={e.objectId} />
                  <input type="hidden" name="lat" value={c.lat} />
                  <input type="hidden" name="lng" value={c.lng} />
                  <button
                    className="px-3 py-1.5 text-xs border border-line rounded hover:border-accent hover:bg-canvas transition-colors text-left max-w-xs"
                    title={`score ${c.score} · ${c.lat}, ${c.lng}`}
                  >
                    {c.key.length > 60 ? c.key.slice(0, 60) + "…" : c.key}
                  </button>
                </form>
              ))}
              <form action={setObjectCoordsAction} className="flex items-center gap-1.5">
                <input type="hidden" name="objectId" value={e.objectId} />
                <input
                  name="lat"
                  required
                  placeholder="широта 55.7…"
                  pattern="5[0-9][.,][0-9]+"
                  className="w-28 px-2 py-1.5 text-xs border border-line rounded font-mono focus:outline-none focus:border-accent"
                />
                <input
                  name="lng"
                  required
                  placeholder="долгота 37.6…"
                  pattern="3[0-9][.,][0-9]+"
                  className="w-28 px-2 py-1.5 text-xs border border-line rounded font-mono focus:outline-none focus:border-accent"
                />
                <button className="px-3 py-1.5 text-xs font-medium text-white bg-accent rounded hover:bg-accent-deep">
                  Задать
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
