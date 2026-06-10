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
      className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded px-3 py-1 hover:bg-gray-50"
    >
      Выйти
    </button>
  );
}
