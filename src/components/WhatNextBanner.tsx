import Link from "next/link";
import type { WhatNext } from "@/lib/what-next";

export default function WhatNextBanner({ next }: { next: WhatNext | null }) {
  if (!next) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-accent/30 bg-accent/8 text-sm">
      <span className="text-accent font-semibold shrink-0">Что дальше:</span>
      <span className="text-ink-soft">{next.text}</span>
      <Link
        href={next.href}
        className="ml-auto shrink-0 px-3 py-1 rounded bg-accent text-white text-xs font-medium hover:bg-accent-deep transition-colors"
      >
        {next.cta} →
      </Link>
    </div>
  );
}
