# cameras — мониторинг видеокамер ГБУ «ГОРМОСТ»

Прод: https://cameras-nu.vercel.app · push в `main` (remote **github**) = автодеплой.
GitLab-remote (`origin`) НЕ используется — не пушить, не трогать.

## Перед коммитом — обязательно
```
npx tsc --noEmit && npm test && npm run build
```
Next тайпчекает и `scripts/` — ломаются деплои, не только приложение.

## Архитектура
- Серверные компоненты + Prisma + server actions. Никакого RPC-слоя и клиентского фетча данных,
  кроме спец-случаев (палитра ⌘K, канбан, импорт-форма — паттерн: серверная страница грузит
  данные → передаёт в `'use client'`).
- Тонкие `page.tsx`; переиспользуемое — в `src/components/`, бизнес-логика — в `src/lib/`.
- Чистая логика (правила, расчёты) отделяется от Prisma-обёрток ради тестов:
  образец — `lib/alerts-rules.ts` (pure) + `lib/alerts.ts` (запросы). Тесты Vitest рядом в `__tests__/`.

## Дизайн-система — только токены
- Цвета ТОЛЬКО через токены `@theme` из `globals.css` (`bg-surface`, `text-ink`, `text-fail`…).
  Сырые `gray-*`/`#hex`/`isDark ? …` в компонентах ЗАПРЕЩЕНЫ — тёмная тема ломается.
- Тема по умолчанию тёмная (`html.dark`); инлайн-цвета только через `light-dark()`.
- Технические значения (IP, ключи, счётчики, даты) — `font-mono`.
- Русская плюрализация — `lib/plural.ts`, не писать руками «N камер(ы)».

## База данных
- Prisma 7: URL в `prisma.config.ts` (из `.env.local`), datasource в schema — только provider.
- Подключение ТОЛЬКО через pooler `aws-1-eu-central-1.pooler.supabase.com`
  (прямой хост db.* — IPv6-only, отсюда недоступен). Vercel: runtime 6543, миграции 5432.
- `user.role`: dispatcher | engineer | manager | admin (`lib/roles.ts`). Роль в сессии
  через Better Auth `additionalFields`.
- Имена объектов из Excel нормализовать (`\n`, двойные пробелы) с обеих сторон сравнения.

## Auth
- Публичный sign-up ОТКЛЮЧЁН. Пользователи: `/admin` или `scripts/create-user.ts`
  (хэш — через `lib/create-user.ts`, не руками).
- Better Auth 1.6: метод `requestPasswordReset` (не `forgetPassword`).

## Скрипты (tsx, читают .env.local)
- `scripts/import-cameras.ts` — первичный импорт из Excel (готовые npm-скрипты)
- `scripts/enrich-coordinates.ts` — координаты из KSVD (`--dry-run`, `--loose`, `--candidates`)
- `scripts/create-user.ts <email> <ФИО> <пароль> [роль]`

## Не трогать без причины
- `src/generated/prisma` — генерат, в .gitignore, создаётся в build
- `vercel.json` crons — ежедневный снапшот (8:00 МСК), защищён CRON_SECRET
- Ключ Yandex Maps — бесплатный, ТОЛЬКО API 2.1, лимит ~100 загрузок /map
