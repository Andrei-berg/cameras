"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { MapObject } from "@/app/(dashboard)/map/page";

/* ymaps3 загружается с CDN Яндекса (по требованиям лицензии — не через npm) */
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ymaps3: any;
  }
}

let loader: Promise<void> | null = null;
function loadYmaps(apiKey: string): Promise<void> {
  if (window.ymaps3) return window.ymaps3.ready;
  if (!loader) {
    loader = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://api-maps.yandex.ru/v3/?apikey=${apiKey}&lang=ru_RU`;
      s.onload = () => window.ymaps3.ready.then(resolve);
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
  const router = useRouter();

  useEffect(() => {
    let map: { destroy: () => void } | null = null;
    let cancelled = false;

    loadYmaps(apiKey).then(() => {
      if (cancelled || !ref.current) return;
      const ymaps3 = window.ymaps3;
      const {
        YMap,
        YMapDefaultSchemeLayer,
        YMapDefaultFeaturesLayer,
        YMapMarker,
      } = ymaps3;

      map = new YMap(ref.current, {
        location: { center: [37.62, 55.75], zoom: 10 },
      });
      const m = map as InstanceType<typeof YMap>;
      m.addChild(new YMapDefaultSchemeLayer({}));
      m.addChild(new YMapDefaultFeaturesLayer({}));

      for (const o of objects) {
        const el = document.createElement("button");
        el.title = `${o.name}\n${o.district}\nкамер: ${o.total}, не работает: ${o.broken}`;
        el.style.cssText = `
          transform: translate(-50%, -50%);
          min-width: 22px; height: 22px; padding: 0 4px;
          border-radius: 11px; border: 2px solid #fff;
          background: ${o.broken > 0 ? "#c2333b" : "#15803d"};
          color: #fff; font: 600 10px/18px var(--font-jb-mono), monospace;
          cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,.35);
        `;
        el.textContent = o.broken > 0 ? String(o.broken) : "";
        el.onclick = () =>
          router.push(`/cameras?q=${encodeURIComponent(o.name.slice(0, 40))}`);
        m.addChild(
          new YMapMarker({ coordinates: [o.lng, o.lat], zIndex: o.broken > 0 ? 2 : 1 }, el)
        );
      }
    });

    return () => {
      cancelled = true;
      map?.destroy();
    };
  }, [objects, apiKey, router]);

  return (
    <div
      ref={ref}
      className="flex-1 rounded-lg border border-line overflow-hidden bg-canvas"
    />
  );
}
