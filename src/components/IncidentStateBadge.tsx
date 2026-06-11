export const INCIDENT_STATES: Record<string, { label: string; cls: string }> = {
  open: { label: "Открыт", cls: "bg-fail-soft text-fail" },
  in_repair: { label: "В ремонте", cls: "bg-warn-soft text-warn" },
  resolved: { label: "Закрыт", cls: "bg-ok-soft text-ok" },
};

export default function IncidentStateBadge({ state }: { state: string }) {
  const st = INCIDENT_STATES[state] ?? { label: state, cls: "bg-canvas text-ink-soft" };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${st.cls}`}>
      {st.label}
    </span>
  );
}
