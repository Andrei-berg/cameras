"use client";
import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await signOut();
        router.push("/login");
      }}
      className="text-sm text-ink-soft hover:text-ink border border-line rounded px-3 py-1 hover:bg-canvas"
    >
      Выйти
    </button>
  );
}
