"use client";

import { useEffect, useState } from "react";

/** Monospace-полоска внизу — атмосфера диспетчерского пульта (gormost §8) */
export default function StatusBar({
  online,
  total,
}: {
  online: number;
  total: number;
}) {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setTime(
        new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <footer className="fixed bottom-0 inset-x-0 z-10 bg-surface/95 border-t border-line px-4 py-1 flex items-center gap-3 font-mono text-[11px] text-ink-soft backdrop-blur-sm">
      <span className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-ok animate-pulse" />
        ГОРМОСТ·Мониторинг
      </span>
      <span className="text-ink-faint">|</span>
      <span>
        онлайн <span className="text-ok">{online.toLocaleString("ru-RU")}</span> из{" "}
        {total.toLocaleString("ru-RU")}
      </span>
      <span className="ml-auto tabular-nums">{time}</span>
    </footer>
  );
}
