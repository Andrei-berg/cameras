import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ROLES } from "@/lib/roles";
import { createUserAction, updateUserAction } from "./actions";
import ImportForm from "@/components/ImportForm";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function RoleSelect({ name, defaultValue }: { name: string; defaultValue?: string }) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? "dispatcher"}
      className="px-2 py-1 text-sm border border-line rounded bg-surface"
    >
      {Object.entries(ROLES).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
  );
}

function DistrictSelect({
  name,
  defaultValue,
  districts,
}: {
  name: string;
  defaultValue?: string | null;
  districts: { id: string; name: string }[];
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      className="px-2 py-1 text-sm border border-line rounded bg-surface max-w-44"
    >
      <option value="">Все участки</option>
      {districts.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </select>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "admin") {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const [users, districts] = await Promise.all([
    prisma.user.findMany({
      include: { district: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    }),
    prisma.district.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold">Администрирование</h1>
        <p className="text-sm text-ink-soft">
          Пользователи системы и их роли · {users.length} чел.
        </p>
      </div>

      {sp.error && (
        <div className="px-4 py-2.5 bg-fail-soft text-fail border border-fail/20 rounded text-sm">
          {sp.error}
        </div>
      )}
      {sp.ok && (
        <div className="px-4 py-2.5 bg-ok-soft text-ok border border-ok/20 rounded text-sm">
          {sp.ok}
        </div>
      )}

      <section className="bg-surface border border-line rounded-lg p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-1">
          Импорт операционного реестра
        </h2>
        <p className="text-xs text-ink-soft mb-3">
          Лист «Реестр» (.xlsx/.xlsm): обновит статусы камер, создаст инциденты по
          сломавшимся и закроет по починившимся. Новые объекты не создаёт.
        </p>
        <ImportForm />
      </section>

      <section className="bg-surface border border-line rounded-lg p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft mb-3">
          Новый пользователь
        </h2>
        <form action={createUserAction} className="flex flex-wrap items-center gap-2">
          <input
            name="name"
            required
            placeholder="ФИО"
            className="px-3 py-1.5 text-sm border border-line rounded min-w-48 focus:outline-none focus:border-accent"
          />
          <input
            name="email"
            type="email"
            required
            placeholder="email"
            className="px-3 py-1.5 text-sm border border-line rounded min-w-52 focus:outline-none focus:border-accent"
          />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="пароль (мин. 8)"
            className="px-3 py-1.5 text-sm border border-line rounded min-w-40 focus:outline-none focus:border-accent"
          />
          <RoleSelect name="role" />
          <DistrictSelect name="districtId" districts={districts} />
          <button
            type="submit"
            className="px-4 py-1.5 text-sm font-medium text-white bg-accent hover:bg-accent-deep rounded transition-colors"
          >
            Создать
          </button>
        </form>
      </section>

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line-strong bg-canvas/60 text-left text-xs uppercase tracking-wider text-ink-soft">
              <th className="px-4 py-2.5 font-medium">Имя</th>
              <th className="px-3 py-2.5 font-medium">Email</th>
              <th className="px-3 py-2.5 font-medium">Роль и участок</th>
              <th className="px-3 py-2.5 font-medium">Создан</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2 font-medium">
                  {u.name}
                  {u.id === session.user.id && (
                    <span className="ml-2 text-xs text-ink-faint">(вы)</span>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-ink-soft">{u.email}</td>
                <td className="px-3 py-2">
                  <form
                    action={updateUserAction}
                    className="flex items-center gap-2 flex-wrap"
                  >
                    <input type="hidden" name="id" value={u.id} />
                    <RoleSelect name="role" defaultValue={u.role} />
                    <DistrictSelect
                      name="districtId"
                      defaultValue={u.districtId}
                      districts={districts}
                    />
                    <button
                      type="submit"
                      className="px-3 py-1 text-xs border border-line rounded hover:border-accent transition-colors"
                    >
                      Сохранить
                    </button>
                  </form>
                </td>
                <td className="px-3 py-2 text-xs text-ink-faint whitespace-nowrap">
                  {dateFmt.format(u.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
