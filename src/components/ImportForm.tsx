"use client";

import { useState } from "react";

interface ImportResult {
  ok?: boolean;
  error?: string;
  rows?: number;
  broken?: number;
  fixed?: number;
  unchanged?: number;
  notFound?: number;
}

export default function ImportForm() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/import/registry", { method: "POST", body: fd });
      setResult(await r.json());
    } catch {
      setResult({ error: "сбой загрузки — проверьте размер файла (лимит ~4.5 МБ)" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="flex items-center gap-2 flex-wrap">
        <input
          type="file"
          name="file"
          required
          accept=".xlsx,.xlsm"
          className="text-sm file:mr-3 file:px-3 file:py-1.5 file:border file:border-line file:rounded file:bg-surface file:text-sm file:cursor-pointer"
        />
        <button
          disabled={busy}
          className="px-4 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-deep rounded disabled:opacity-50"
        >
          {busy ? "Импортирую…" : "Импортировать"}
        </button>
      </form>

      {result?.error && (
        <p className="px-4 py-2.5 bg-fail-soft text-fail border border-fail/20 rounded text-sm">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <div className="px-4 py-3 bg-ok-soft border border-ok/20 rounded text-sm space-y-1">
          <p className="font-medium text-ok">Импорт завершён</p>
          <p className="font-mono text-xs text-ink-soft">
            строк: {result.rows} · сломалось: {result.broken} · починилось: {result.fixed} ·
            без изменений: {result.unchanged} · не найдено: {result.notFound}
          </p>
          <p className="text-xs text-ink-soft">
            По сломавшимся созданы инциденты, по починившимся — закрыты.
          </p>
        </div>
      )}
    </div>
  );
}
