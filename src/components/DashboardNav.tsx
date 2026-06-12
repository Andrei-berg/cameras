"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  badge?: number;
  badgeCls?: string;
}

export default function DashboardNav({
  isAdmin = false,
  brokenCount = 0,
  openIncidents = 0,
}: {
  isAdmin?: boolean;
  brokenCount?: number;
  openIncidents?: number;
}) {
  const pathname = usePathname();
  const items: NavItem[] = [
    { href: "/dashboard", label: "Главная" },
    {
      href: "/cameras",
      label: "Камеры",
      badge: brokenCount,
      badgeCls: "bg-fail-soft text-fail chip-pulse-red",
    },
    {
      href: "/incidents",
      label: "Инциденты",
      badge: openIncidents,
      badgeCls: "bg-warn-soft text-warn",
    },
    { href: "/map", label: "Карта" },
    { href: "/reports", label: "Отчёты" },
    ...(isAdmin ? [{ href: "/admin", label: "Админ" }] : []),
  ];

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 text-sm rounded transition-colors inline-flex items-center gap-1.5 ${
              active
                ? "bg-accent text-white font-medium"
                : "text-ink-soft hover:bg-canvas hover:text-ink"
            }`}
          >
            {item.label}
            {item.badge != null && item.badge > 0 && (
              <span
                className={`px-1.5 py-px rounded-full text-[10px] font-mono font-semibold leading-4 ${
                  active ? "bg-white/20 text-white" : item.badgeCls
                }`}
              >
                {item.badge.toLocaleString("ru-RU")}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
