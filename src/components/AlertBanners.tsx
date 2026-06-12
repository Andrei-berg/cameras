import Link from "next/link";
import type { Alert } from "@/lib/alerts";

export default function AlertBanners({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <Link
          key={i}
          href={a.href}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
            a.severity === "critical"
              ? "bg-fail-soft text-fail border-fail/30 hover:border-fail"
              : "bg-warn-soft text-warn border-warn/30 hover:border-warn"
          }`}
        >
          <span
            className={`size-2 rounded-full shrink-0 ${
              a.severity === "critical" ? "bg-fail animate-pulse" : "bg-warn"
            }`}
          />
          {a.text}
          <span className="ml-auto opacity-60">→</span>
        </Link>
      ))}
    </div>
  );
}
