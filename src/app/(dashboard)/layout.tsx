import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import SignOutButton from "@/components/SignOutButton";
import DashboardNav from "@/components/DashboardNav";
import CommandPalette from "@/components/CommandPalette";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-surface border-b border-line px-6 py-2.5 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-8">
          <div className="leading-tight">
            <span className="font-semibold tracking-wide text-ink">
              ГОРМОСТ
            </span>
            <span className="block text-[11px] uppercase tracking-widest text-ink-faint">
              мониторинг камер
            </span>
          </div>
          <DashboardNav isAdmin={session.user.role === "admin"} />
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden md:inline text-xs text-ink-faint border border-line rounded px-1.5 py-0.5 font-mono">
            Ctrl K
          </span>
          <span className="text-sm text-ink-soft">{session.user.name}</span>
          <SignOutButton />
        </div>
      </header>
      <CommandPalette isAdmin={session.user.role === "admin"} />
      <main className="p-6 max-w-screen-2xl mx-auto">{children}</main>
    </div>
  );
}
