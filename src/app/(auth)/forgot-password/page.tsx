"use client";
import { useState } from "react";
import { requestPasswordReset } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const { error } = await requestPasswordReset({
      email: form.get("email") as string,
      redirectTo: "/reset-password",
    });
    setLoading(false);
    if (error) {
      setError(error.message ?? "Ошибка отправки письма");
    } else {
      setSent(true);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gray-800 mb-6 text-center">
          Сброс пароля
        </h1>
        {sent ? (
          <div className="text-center space-y-4">
            <p className="text-sm text-gray-700">
              Письмо отправлено. Проверьте почту и перейдите по ссылке.
            </p>
            <a href="/login" className="text-sm text-blue-600 hover:underline">
              Вернуться к входу
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Отправка..." : "Сбросить пароль"}
            </button>
            <a href="/login" className="block text-sm text-blue-600 hover:underline text-center">
              Вернуться к входу
            </a>
          </form>
        )}
      </div>
    </main>
  );
}
