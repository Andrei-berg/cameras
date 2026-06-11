"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Главная" },
  { href: "/cameras", label: "Камеры" },
  { href: "/incidents", label: "Инциденты" },
  { href: "/map", label: "Карта" },
  { href: "/reports", label: "Отчёты" },
];

export default function DashboardNav({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const visible = isAdmin ? [...items, { href: "/admin", label: "Админ" }] : items;

  return (
    <nav className="flex items-center gap-1">
      {visible.map((item) => (
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
      ))}
    </nav>
  );
}
