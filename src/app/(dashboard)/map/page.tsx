import prisma from "@/lib/prisma";
import MapView from "@/components/MapView";

export const dynamic = "force-dynamic";

export interface MapObject {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  total: number;
  broken: number;
}

export default async function MapPage() {
  const objects = await prisma.$queryRaw<MapObject[]>`
    SELECT o.id, o.name, d.name AS district,
           avg(c.lat)::float AS lat, avg(c.lng)::float AS lng,
           count(*)::int AS total,
           (count(*) FILTER (WHERE NOT c."isWorking"))::int AS broken
    FROM "Object" o
    JOIN "Camera" c ON c."objectId" = o.id AND c.lat IS NOT NULL
    JOIN "District" d ON d.id = o."districtId"
    GROUP BY o.id, o.name, d.name
  `;

  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;

  return (
    <div className="space-y-3 h-[calc(100vh-7.5rem)] flex flex-col">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">Карта объектов</h1>
          <p className="text-sm text-ink-soft">
            {objects.length} объектов с координатами · цвет — есть ли неработающие камеры
          </p>
        </div>
        <div className="flex gap-3 text-xs text-ink-soft items-center">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-ok inline-block" /> все работают
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-fail inline-block" /> есть неисправные
          </span>
        </div>
      </div>

      {apiKey ? (
        <MapView objects={objects} apiKey={apiKey} />
      ) : (
        <div className="flex-1 bg-surface border border-line rounded-lg flex items-center justify-center">
          <div className="text-center max-w-md space-y-2 p-8">
            <p className="font-medium">Нужен ключ Yandex Maps API</p>
            <p className="text-sm text-ink-soft">
              Получите ключ JavaScript API в кабинете разработчика Яндекса и добавьте
              переменную окружения <code className="font-mono text-xs bg-canvas px-1 py-0.5 rounded">NEXT_PUBLIC_YANDEX_MAPS_API_KEY</code>
              {" "}локально в .env.local и в настройках Vercel.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
