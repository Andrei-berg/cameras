export const ROLES = {
  dispatcher: "Диспетчер",
  engineer: "Инженер",
  manager: "Руководитель",
  admin: "Администратор",
} as const;

export type Role = keyof typeof ROLES;

export function isRole(value: string): value is Role {
  return value in ROLES;
}
