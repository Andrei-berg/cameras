/**
 * Создание пользователя из командной строки (регистрация на сайте закрыта).
 *
 * Запуск:
 *   npx tsx scripts/create-user.ts <email> <ФИО> <пароль> [роль]
 *   роль: dispatcher (по умолчанию) | engineer | manager | admin
 */

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const [email, name, password, role = "dispatcher"] = process.argv.slice(2);
  if (!email || !name || !password) {
    console.error("Использование: npx tsx scripts/create-user.ts <email> <ФИО> <пароль> [роль]");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Пароль — минимум 8 символов");
    process.exit(1);
  }

  // импорт после dotenv: auth.ts читает env при инициализации
  const { createUserWithPassword } = await import("../src/lib/create-user");
  const user = await createUserWithPassword({ name, email, password, role });
  console.log(`✓ Создан: ${user.email} (${user.role}, id ${user.id})`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});
