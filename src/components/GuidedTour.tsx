"use client";

import { useEffect, useState } from "react";

/** Обучающий тур при первом входе (§9 gormost): подсветка элементов по data-tour */

const STEPS = [
  {
    key: "nav",
    title: "Разделы системы",
    text: "Камеры, инциденты, карта и отчёты. Бейджи показывают живые счётчики: красный — сломанные камеры, янтарный — активные инциденты.",
  },
  {
    key: "ctrlk",
    title: "Быстрый поиск",
    text: "Ctrl+K (или ⌘K) из любого экрана — мгновенный переход к объекту или разделу.",
  },
  {
    key: "theme",
    title: "Тема",
    text: "По умолчанию ночная — для работы в диспетчерской. Кнопка переключает на светлую.",
  },
  {
    key: "main",
    title: "Главный экран",
    text: "Красные и янтарные баннеры сверху — то, что требует действия прямо сейчас. Плитки участков кликабельны и ведут к сломанным камерам.",
  },
  {
    key: "statusbar",
    title: "Статус-бар",
    text: "Внизу всегда видно, сколько камер онлайн, и текущее время.",
  },
];

export default function GuidedTour() {
  const [step, setStep] = useState(-1);

  useEffect(() => {
    try {
      if (!localStorage.getItem("tour_done")) setStep(0);
    } catch {
      /* приватный режим */
    }
  }, []);

  useEffect(() => {
    if (step < 0 || step >= STEPS.length) return;
    const el = document.querySelector(`[data-tour="${STEPS[step].key}"]`);
    el?.classList.add("tour-target");
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return () => el?.classList.remove("tour-target");
  }, [step]);

  if (step < 0 || step >= STEPS.length) return null;

  const finish = () => {
    try {
      localStorage.setItem("tour_done", "1");
    } catch {}
    setStep(STEPS.length);
  };

  const s = STEPS[step];
  return (
    <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 w-[min(26rem,90vw)] bg-surface border border-accent/40 rounded-xl shadow-2xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{s.title}</h3>
        <span className="font-mono text-xs text-ink-faint">
          {step + 1} / {STEPS.length}
        </span>
      </div>
      <p className="text-sm text-ink-soft">{s.text}</p>
      <div className="flex items-center gap-2 pt-1">
        <button onClick={finish} className="text-xs text-ink-faint hover:text-ink">
          Пропустить
        </button>
        <div className="ml-auto flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-3 py-1 text-xs border border-line rounded hover:border-accent"
            >
              ← Назад
            </button>
          )}
          <button
            onClick={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}
            className="px-3 py-1 text-xs font-medium text-white bg-accent rounded hover:bg-accent-deep"
          >
            {step === STEPS.length - 1 ? "Готово" : "Далее →"}
          </button>
        </div>
      </div>
    </div>
  );
}
