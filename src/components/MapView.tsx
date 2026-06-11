"use client";

import { useEffect, useRef } from "react";
import type { MapObject } from "@/app/(dashboard)/map/page";

/* Yandex Maps JavaScript API 2.1 (ключ пользователя выдан для v2.1, не v3).
   Грузится с CDN Яндекса по требованиям лицензии. Кластеризация — ObjectManager. */
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ymaps: any;
  }
}

let loader: Promise<void> | null = null;
function loadYmaps(apiKey: string): Promise<void> {
  if (window.ymaps?.ready) {
    return new Promise((r) => window.ymaps.ready(r));
  }
  if (!loader) {
    loader = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`;
      s.onload = () => window.ymaps.ready(() => resolve());
      s.onerror = () => reject(new Error("Не удалось загрузить Yandex Maps"));
      document.head.appendChild(s);
    });
  }
  return loader;
}

export default function MapView({
  objects,
  apiKey,
}: {
  objects: MapObject[];
  apiKey: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: { destroy: () => void } | null = null;
    let cancelled = false;

    loadYmaps(apiKey).then(() => {
      if (cancelled || !ref.current) return;
      const ymaps = window.ymaps;

      map = new ymaps.Map(ref.current, {
        center: [55.75, 37.62],
        zoom: 10,
        controls: ["zoomControl", "searchControl"],
      });

      const om = new ymaps.ObjectManager({
        clusterize: true,
        gridSize: 96,
        clusterIconLayout: "default.imageWithContent",
      });
      om.objects.options.set("preset", "islands#greenDotIcon");
      om.clusters.options.set("preset", "islands#invertedDarkBlueClusterIcons");

      om.add(
        objects.map((o) => ({
          type: "Feature",
          id: o.id,
          geometry: { type: "Point", coordinates: [o.lat, o.lng] },
          properties: {
            iconContent: o.broken > 0 ? String(o.broken) : undefined,
            hintContent: `${o.name} — камер: ${o.total}, не работает: ${o.broken}`,
            balloonContentHeader: o.name,
            balloonContentBody: `
              <div style="font: 13px/1.5 sans-serif">
                ${o.district}<br/>
                Камер: <b>${o.total}</b> · не работает: <b style="color:#c2333b">${o.broken}</b><br/>
                <a href="/cameras?q=${encodeURIComponent(o.name.slice(0, 40))}">Открыть в реестре →</a>
              </div>`,
          },
          options:
            o.broken > 0
              ? { preset: "islands#redCircleIcon" }
              : { preset: "islands#greenDotIcon" },
        }))
      );

      (map as unknown as { geoObjects: { add: (o: unknown) => void } }).geoObjects.add(om);
    });

    return () => {
      cancelled = true;
      map?.destroy();
    };
  }, [objects, apiKey]);

  return (
    <div
      ref={ref}
      className="flex-1 rounded-lg border border-line overflow-hidden bg-canvas"
    />
  );
}
