export default function StatusBadge({ isWorking }: { isWorking: boolean }) {
  return isWorking ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-ok-soft text-ok">
      <span className="size-1.5 rounded-full bg-ok" />
      Работает
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-fail-soft text-fail">
      <span className="size-1.5 rounded-full bg-fail animate-pulse" />
      Не работает
    </span>
  );
}
