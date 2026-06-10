"use client";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/auth-client";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="text-center space-y-4">
        <p className="text-sm text-red-600">
          Неверная ссылка. Запросите сброс пароля повторно.
        </p>
        <a href="/forgot-password" className="text-sm text-blue-600 hover:underline">
          Запросить сброс пароля
        </a>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const newPassword = form.get("password") as string;
    const confirmPassword = form.get("confirmPassword") as string;
    if (newPassword !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }
    setLoading(true);
    const { error } = await resetPassword({ newPassword, token: token! });
    setLoading(false);
    if (error) {
      setError(error.message ?? "Ошибка сброса пароля");
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <div className="text-center space-y-4">
        <p className="text-sm text-gray-700">Пароль изменён. Войдите с новым паролем.</p>
        <a href="/login" className="text-sm text-blue-600 hover:underline">Войти</a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
          Новый пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
          Подтверждение пароля
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Сохранение..." : "Сохранить пароль"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-800 mb-6 text-center">
          Новый пароль
        </h1>
        <Suspense fallback={<div className="text-sm text-gray-500">Загрузка...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
