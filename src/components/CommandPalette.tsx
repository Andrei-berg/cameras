"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface FoundObject {
  id: string;
  name: string;
  district: string;
  total: number;
  broken: number;
}

const NAV = [
  { label: "Главная", href: "/dashboard" },
  { label: "Камеры — реестр", href: "/cameras" },
  { label: "Камеры — не работают", href: "/cameras?status=broken" },
  { label: "Инциденты — открытые", href: "/incidents?state=open" },
  { label: "Карта", href: "/map" },
  { label: "Отчёты", href: "/reports" },
];

export default function CommandPalette({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [objects, setObjects] = useState<FoundObject[]>([]);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nav = isAdmin ? [...NAV, { label: "Администрирование", href: "/admin" }] : NAV;
  const navFiltered = q
    ? nav.filter((n) => n.label.toLowerCase().includes(q.toLowerCase()))
    : nav;
  const items: { label: string; sub?: string; href: string }[] = [
    ...navFiltered.map((n) => ({ label: n.label, href: n.href })),
    ...objects.map((o) => ({
      label: o.name,
      sub: `${o.district} · камер ${o.total}${o.broken ? ` · не работает ${o.broken}` : ""}`,
      href: `/cameras?q=${encodeURIComponent(o.name.slice(0, 40))}`,
    })),
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setObjects([]);
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const search = useCallback((value: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (value.trim().length < 2) return setObjects([]);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
        const data = await r.json();
        setObjects(data.objects ?? []);
        setActive(0);
      } catch {
        /* сеть — не критично для палитры */
      }
    }, 200);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl bg-surface rounded-xl shadow-2xl border border-line overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            search(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, items.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            }
            if (e.key === "Enter" && items[active]) go(items[active].href);
          }}
          placeholder="Объект, раздел… (Esc — закрыть)"
          className="w-full px-4 py-3 text-sm border-b border-line focus:outline-none"
        />
        <div className="max-h-80 overflow-y-auto py-1">
          {items.map((it, i) => (
            <button
              key={`${it.href}-${i}`}
              onClick={() => go(it.href)}
              onMouseEnter={() => setActive(i)}
              className={`w-full text-left px-4 py-2 text-sm flex flex-col ${
                i === active ? "bg-accent text-white" : ""
              }`}
            >
              <span className="truncate">{it.label}</span>
              {it.sub && (
                <span className={`text-xs truncate ${i === active ? "text-white/70" : "text-ink-faint"}`}>
                  {it.sub}
                </span>
              )}
            </button>
          ))}
          {items.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-ink-faint">Ничего не найдено</p>
          )}
        </div>
        <div className="px-4 py-2 border-t border-line text-xs text-ink-faint">
          ↑↓ — выбор · Enter — перейти · Ctrl/⌘+K — открыть/закрыть
        </div>
      </div>
    </div>
  );
}
