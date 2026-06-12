export const ACTION_LABELS: Record<string, string> = {
  "incident.create": "Инцидент зарегистрирован",
  "incident.visit": "Выезд специалиста",
  "incident.move": "Статус изменён (доска)",
  "incident.resolve": "Инцидент закрыт",
  "user.create": "Пользователь создан",
  "user.update": "Пользователь изменён",
  "object.set_coords": "Назначены координаты",
  "registry.import": "Импорт реестра",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
