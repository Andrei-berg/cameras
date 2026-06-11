"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Главная" },
  { href: "/cameras", label: "Камеры" },
  { href: "/incidents", label: "Инциденты", disabled: true },
  { href: "/map", label: "Карта", disabled: true },
];

export default function DashboardNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const visible = isAdmin ? [...items, { href: "/admin", label: "Админ" }] : items;

  return (
    <nav className="flex items-center gap-1">
      {visible.map((item) =>
        item.disabled ? (
          <span
            key={item.href}
            className="px-3 py-1.5 text-sm text-ink-faint cursor-not-allowed select-none"
            title="Будет доступно в следующих фазах"
          >
            {item.label}
          </span>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 text-sm rounded transition-colors ${
              pathname.startsWith(item.href)
                ? "bg-accent text-white font-medium"
                : "text-ink-soft hover:bg-canvas hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        )
      )}
    </nav>
  );
}
